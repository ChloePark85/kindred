import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { z } from "zod";
import { awaitingDelayedReply, busyNote, isBusy, partnerStatus } from "@/app/chat/chat-helpers";
import { generateText } from "@/lib/claude";
import { extractAndStoreMemories, getRelevantMemories } from "@/lib/memories";
import { getPersona } from "@/lib/personas";
import { buildPersonaPrompt } from "@/lib/prompt";
import { currentItem, getOrCreateSchedule } from "@/lib/schedule";
import { simNow } from "@/lib/simtime";
import { getSession } from "@/lib/supabase/server";
import type { Message, MessageKind, MessageRole, ScheduleItem } from "@/lib/types";

/**
 * POST /api/chat
 *   { message: string } -> store and reply now, or, if the partner is busy, store a busy note and
 *                          return { busy: true, note, replyAfterMs }; if a delayed reply is already
 *                          owed, just store the message and return { queued: true }.
 *   { resume: true }    -> the delayed reply to every user message since the partner's last reply.
 *   { greet: true }     -> the partner's first message when the conversation is empty.
 * Every success returns { messages: Message[] (newly stored), status: string }.
 */

const Body = z.union([
  z.object({ message: z.string().trim().min(1).max(2000) }),
  z.object({ resume: z.literal(true) }),
  z.object({ greet: z.literal(true) }),
]);

const HISTORY_LIMIT = 20;
const FRIENDLY_ERROR = "Sorry, something went wrong. Please try again.";

type Turn = { role: "user" | "assistant"; content: string };

/** Alternating user/assistant turns (first is user) from stored messages, skipping busy notes. */
function toConversation(history: Message[]): Anthropic.Beta.BetaMessageParam[] {
  const turns: Turn[] = [];
  for (const m of history) {
    const role = m.role === "user" ? "user" : "assistant";
    const content = m.kind === "call" ? `(Transcript of our phone call earlier:)\n${m.content.slice(0, 3000)}` : m.content;
    const last = turns.at(-1);
    if (last?.role === role) last.content += `\n\n${content}`;
    else turns.push({ role, content });
  }
  if (turns[0]?.role === "assistant") turns.unshift({ role: "user", content: "(opens the chat)" });
  return turns;
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please type a message first." }, { status: 400 });
  const body = parsed.data;

  try {
    const { supabase, user, profile } = await getSession();
    if (!user || !profile) return Response.json({ error: "Please start again from the welcome page." }, { status: 401 });
    const persona = getPersona(profile.partner_id);
    if (!persona) return Response.json({ error: "Please choose a partner first." }, { status: 400 });

    const sim = simNow(profile);
    const schedule = await getOrCreateSchedule(supabase, user.id, persona, sim.date, sim.weekday);
    const item = currentItem(schedule, sim.time);
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

    async function store(role: MessageRole, kind: MessageKind, content: string): Promise<Message> {
      const { data, error } = await supabase
        .from("messages")
        .insert({ user_id: user!.id, partner_id: persona!.id, role, kind, content, sim_date: sim.date })
        .select("*")
        .single();
      if (error) throw error;
      return data as Message;
    }

    /** Generates and stores the partner's reply to the conversation so far. */
    async function reply(history: Message[], nowActivity: ScheduleItem | null, extraInstructions = ""): Promise<Message> {
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
        }) + extraInstructions;

      const text = await generateText({ system, messages: toConversation(conversation), maxTokens: 600 });
      if (!text) throw new Error("Empty reply from model");
      const saved = await store("partner", "chat", text);

      if (unanswered.length > 0) {
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

    if ("greet" in body) {
      if (recent.length > 0) return Response.json({ messages: [], status });
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
      const greeting = await reply([cue], item);
      return Response.json({ messages: [greeting], status });
    }

    if ("resume" in body) {
      const lastReal = recent.findLast((m) => m.kind !== "busy_note");
      if (!lastReal || lastReal.role !== "user") return Response.json({ messages: [], status });
      const backFrom = isBusy(item)
        ? `\n\nYou were away (${item ? item.activity : "asleep for the night"}) and are only now reading ${profile.name}'s messages. You may say in a few words that you're back, then answer everything they wrote.`
        : `\n\nYou were away for a little while and are only now reading ${profile.name}'s messages. You may say in a few words that you're back, then answer everything they wrote.`;
      const nowActivity = item ? { ...item, activity: `just back from ${item.activity}`, busy: false } : null;
      const saved = await reply(recent, nowActivity, backFrom);
      return Response.json({ messages: [saved], status });
    }

    const userMessage = await store("user", "chat", body.message);

    if (awaitingDelayedReply(recent)) {
      return Response.json({ messages: [userMessage], status, queued: true });
    }

    if (isBusy(item)) {
      const note = busyNote(persona, item);
      const noteMessage = await store("partner", "busy_note", note);
      const replyAfterMs = 8000 + Math.floor(Math.random() * 7000);
      return Response.json({ messages: [userMessage, noteMessage], status, busy: true, note, replyAfterMs });
    }

    try {
      const saved = await reply([...recent, userMessage], item);
      return Response.json({ messages: [userMessage, saved], status });
    } catch (e) {
      // The user's message is saved; the client offers "Try again", which sends { resume: true }.
      console.error("Chat reply failed", e);
      return Response.json({ error: FRIENDLY_ERROR, messages: [userMessage], status, retry: true }, { status: 502 });
    }
  } catch (e) {
    console.error("Chat request failed", e);
    return Response.json({ error: FRIENDLY_ERROR }, { status: 500 });
  }
}
