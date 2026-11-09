import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { z } from "zod";
import { awaitingDelayedReply, partnerStatus } from "@/app/chat/chat-helpers";
import { availability, msUntil, replyDelay, simInstantIn } from "@/lib/availability";
import { DEMO, isDemo } from "@/lib/demo";
import { generateText } from "@/lib/claude";
import { extractAndStoreMemories, getRelevantMemories } from "@/lib/memories";
import { relabelCallTranscript, requestedPartnerId, resolvePartner } from "@/lib/partner";
import { getStage, type Stage } from "@/lib/relationship";
import { buildPersonaPrompt } from "@/lib/prompt";
import { currentItem, getOrCreateSchedule } from "@/lib/schedule";
import { simNow } from "@/lib/simtime";
import { getSession } from "@/lib/supabase/server";
import type { Persona } from "@/lib/personas";
import type { Message, MessageKind, MessageRole, Schedule, ScheduleItem } from "@/lib/types";

/**
 * POST /api/chat
 *   { message: string } -> store and reply now, or, if the partner is busy, asleep or hasn't looked
 *                          yet, store a busy note (with reply_at) and return { busy: true, note, replyAfterMs };
 *                          if a delayed reply is already owed, store the message and return { queued: true, replyAfterMs }.
 *   { resume: true }    -> the delayed reply to every user message since the partner's last reply, or
 *                          { notYet: true, replyAfterMs } while the partner still isn't free.
 *   replyAfterMs is null when the wait is too long to keep the page waiting (e.g. until morning).
 *   { greet: true }     -> the partner's first message when the conversation is empty.
 * Every success returns { messages: Message[] (newly stored), status: string, stage: { id, label, emoji } }
 * where stage is the relationship stage after this exchange (the client celebrates when it goes up).
 */

const Body = z.union([
  z.object({ message: z.string().trim().min(1).max(2000) }),
  z.object({ resume: z.literal(true) }),
  z.object({ greet: z.literal(true) }),
]);

const HISTORY_LIMIT = 20;
/** Longest wait the open chat page keeps a timer for; later replies arrive on the next visit or "Next day". */
const MAX_CLIENT_WAIT_MS = 6 * 60 * 60_000;

/**
 * Demo mode: the first message after matching finds the partner busy for a few
 * seconds (with something from their real day), so "they live their own life"
 * shows up on cue; after that they answer right away.
 */
function demoDelay(persona: Persona, schedule: Schedule, time: string, history: Message[]) {
  if (history.some((m) => m.kind === "busy_note")) return null;
  const activity = schedule.items.find((i) => i.busy)?.activity ?? DEMO.busyFallback;
  const [h, m] = time.split(":").map(Number);
  const soon = `${String((h + Math.floor((m + 1) / 60)) % 24).padStart(2, "0")}:${String((m + 1) % 60).padStart(2, "0")}`;
  return replyDelay(persona, { state: "busy", until: soon, minutes: DEMO.busyMinutes, activity }, 0);
}

/** How long the page should wait before asking for the reply again (null: don't wait on this page). */
function clientDelay(ms: number) {
  if (ms <= 0) return 1000;
  return ms <= MAX_CLIENT_WAIT_MS ? ms + 1500 : null;
}
const FRIENDLY_ERROR = "Sorry, something went wrong. Please try again.";
const STALE_PARTNER_ERROR = "This page is out of date. Please refresh the page.";

type Turn = { role: "user" | "assistant"; content: string };

/** Alternating user/assistant turns (first is user) from stored messages, skipping busy notes. */
function toConversation(history: Message[], userName: string): Anthropic.Beta.BetaMessageParam[] {
  const turns: Turn[] = [];
  for (const m of history) {
    const role = m.role === "user" ? "user" : "assistant";
    const content = m.kind === "call" ? `(Transcript of our phone call earlier:)\n${relabelCallTranscript(m.content, userName).slice(0, 3000)}` : m.content;
    const last = turns.at(-1);
    if (last?.role === role) last.content += `\n\n${content}`;
    else turns.push({ role, content });
  }
  if (turns[0]?.role === "assistant") turns.unshift({ role: "user", content: "(opens the chat)" });
  return turns;
}

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Please type a message first." }, { status: 400 });
  const body = parsed.data;

  try {
    const { supabase, user, profile } = await getSession();
    if (!user || !profile) return Response.json({ error: "Please start again from the welcome page." }, { status: 401 });
    const persona = await resolvePartner(supabase, user.id, profile.partner_id, requestedPartnerId(raw));
    if (!persona) return Response.json({ error: STALE_PARTNER_ERROR, refresh: true }, { status: 409 });

    const sim = simNow(profile);
    const schedule = await getOrCreateSchedule(supabase, user.id, persona, sim.date, sim.weekday);
    // Plan tomorrow's day ahead of time, so "Next day" doesn't wait for it.
    after(async () => {
      const tomorrow = simNow({ ...profile, day_offset: profile.day_offset + 1 });
      await getOrCreateSchedule(supabase, user.id, persona, tomorrow.date, tomorrow.weekday).catch((e) =>
        console.error("Planning tomorrow failed", e),
      );
    });

    const demo = await isDemo();
    const scheduled = currentItem(schedule, sim.time);
    // Demo mode keeps the partner around (not asleep, not mid-nap) so each scene happens on cue.
    const item: ScheduleItem | null =
      demo && (!scheduled || scheduled.busy)
        ? { start: sim.time, end: sim.time, activity: "Taking it easy at home", busy: false }
        : scheduled;
    const status = partnerStatus(persona, item);

    const { data: recentRows, error: loadError } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("partner_id", persona.id)
      .order("created_at", { ascending: false })
      .limit(60);
    if (loadError) throw loadError;
    const recent = (recentRows as Message[]).reverse();

    async function store(role: MessageRole, kind: MessageKind, content: string, replyAt?: string): Promise<Message> {
      const { data, error } = await supabase
        .from("messages")
        .insert({ user_id: user!.id, partner_id: persona!.id, role, kind, content, sim_date: sim.date, reply_at: replyAt ?? null })
        .select("*")
        .single();
      if (error) throw error;
      return data as Message;
    }

    /** Generates and stores the partner's reply to the conversation so far. */
    async function reply(
      history: Message[],
      stage: Stage,
      nowActivity: ScheduleItem | null,
      extraInstructions = "",
      /** For the first greeting: skip storing if a message arrived meanwhile (e.g. from another tab). */
      onlyIfStillEmpty = false,
      /** Off for delayed replies: those messages were remembered when they were sent. */
      extractMemories = true,
    ): Promise<Message | null> {
      const conversation = history.filter((m) => m.kind !== "busy_note").slice(-HISTORY_LIMIT);
      const lastPartner = conversation.findLastIndex((m) => m.role === "partner");
      const unanswered = conversation.slice(lastPartner + 1).filter((m) => m.role === "user");
      const context = conversation
        .slice(-6)
        .map((m) => m.content)
        .join("\n");

      const memories = await getRelevantMemories(supabase, user!.id, persona!.id, context, sim.date);
      const system =
        buildPersonaPrompt({
          persona: persona!,
          profile: profile!,
          memories,
          simDate: sim.date,
          weekday: sim.weekday,
          time: sim.time,
          nowActivity,
          channel: "chat",
          stage,
        }) + extraInstructions;

      const text = await generateText({ system, messages: toConversation(conversation, profile!.name), maxTokens: 1500 });
      if (!text) throw new Error("Empty reply from model");
      if (onlyIfStillEmpty) {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("partner_id", persona!.id);
        if ((count ?? 0) > 0) return null;
      }
      const saved = await store("partner", "chat", text);

      if (extractMemories && unanswered.length > 0) {
        after(async () => {
          try {
            await extractAndStoreMemories({
              supabase,
              userId: user!.id,
              partnerId: persona!.id,
              userName: profile!.name,
              userMessage: unanswered.map((m) => m.content).join("\n"),
              partnerReply: text,
              simDate: sim.date,
              weekday: sim.weekday,
              sourceMessageId: unanswered.at(-1)!.id,
            });
          } catch (e) {
            console.error("Memory extraction failed", e);
          }
        });
      }
      return saved;
    }

    async function currentStage() {
      const { stage } = await getStage(supabase, user!.id, persona!.id);
      return stage;
    }
    const stageInfo = (stage: Stage) => ({ id: stage.id, label: stage.label, emoji: stage.emoji });

    if ("greet" in body) {
      const stage = await currentStage();
      if (recent.length > 0) return Response.json({ messages: [], status, stage: stageInfo(stage) });
      const cue: Message = {
        id: "greeting-cue",
        user_id: user.id,
        partner_id: persona.id,
        role: "user",
        kind: "chat",
        content: `(${profile.name} has just opened the chat with you for the very first time. Greet them warmly by name, introduce yourself in one sentence, and ask one gentle question.)`,
        sim_date: sim.date,
        created_at: new Date().toISOString(),
      };
      const greeting = await reply([cue], stage, item, "", true);
      return Response.json({ messages: greeting ? [greeting] : [], status, stage: stageInfo(stage) });
    }

    if ("resume" in body) {
      const stage = await currentStage();
      const lastReal = recent.findLast((m) => m.kind !== "busy_note");
      if (!lastReal || lastReal.role !== "user") return Response.json({ messages: [], status, stage: stageInfo(stage) });
      // The partner answers only once they're actually free (or awake) again.
      const owed = recent.findLast((m) => m.kind === "busy_note");
      const waitMs = owed?.reply_at ? msUntil(profile, owed.reply_at) : 0;
      if (waitMs > 0) {
        return Response.json({ messages: [], status, stage: stageInfo(stage), notYet: true, replyAfterMs: clientDelay(waitMs) });
      }
      const backFrom = owed
        ? `\n\nWhile ${profile.name} was writing, the app told them: "${owed.content}" You are only now reading their messages. Say in a few natural words why you're answering late (e.g. back from what you were doing, just woke up, only now saw it), then answer everything they wrote.`
        : `\n\nYou were away for a little while and are only now reading ${profile.name}'s messages. You may say in a few words that you're back, then answer everything they wrote.`;
      const saved = (await reply(recent, stage, item, backFrom, false, false))!;
      return Response.json({ messages: [saved], status, stage: stageInfo(stage) });
    }

    const userMessage = await store("user", "chat", body.message);
    // Counted after storing, so this message can be the one that moves the relationship up a stage.
    const stage = await currentStage();

    /**
     * When the partner can't answer now, remember what the user said right away: the
     * later answer may come from another route ("Next day"), and "tomorrow" must be
     * resolved against today's date.
     */
    const rememberNow = () =>
      after(async () => {
        try {
          await extractAndStoreMemories({
            supabase,
            userId: user.id,
            partnerId: persona.id,
            userName: profile.name,
            userMessage: body.message,
            partnerReply: "(no reply yet)",
            simDate: sim.date,
            weekday: sim.weekday,
            sourceMessageId: userMessage.id,
          });
        } catch (e) {
          console.error("Memory extraction failed", e);
        }
      });

    if (awaitingDelayedReply(recent)) {
      const owed = recent.findLast((m) => m.kind === "busy_note");
      const waitMs = owed?.reply_at ? msUntil(profile, owed.reply_at) : 0;
      rememberNow();
      return Response.json({ messages: [userMessage], status, stage: stageInfo(stage), queued: true, replyAfterMs: clientDelay(waitMs) });
    }

    // Partners live their own day: busy, asleep, or just not looking at their phone yet.
    const delay = demo
      ? demoDelay(persona, schedule, sim.time, recent)
      : replyDelay(persona, availability(schedule, sim.time), Math.random());
    if (delay) {
      const note = delay.note;
      const noteMessage = await store("partner", "busy_note", note, simInstantIn(profile, delay.minutes));
      rememberNow();
      const replyAfterMs = clientDelay(delay.minutes * 60_000);
      return Response.json({
        messages: [userMessage, noteMessage],
        status,
        stage: stageInfo(stage),
        busy: true,
        note,
        replyAfterMs,
      });
    }

    try {
      const saved = (await reply([...recent, userMessage], stage, item))!;
      return Response.json({ messages: [userMessage, saved], status, stage: stageInfo(stage) });
    } catch (e) {
      // The user's message is saved; the client offers "Try again", which sends { resume: true }.
      console.error("Chat reply failed", e);
      return Response.json(
        { error: FRIENDLY_ERROR, messages: [userMessage], status, stage: stageInfo(stage), retry: true },
        { status: 502 },
      );
    }
  } catch (e) {
    console.error("Chat request failed", e);
    return Response.json({ error: FRIENDLY_ERROR }, { status: 500 });
  }
}
