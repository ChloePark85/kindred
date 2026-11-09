import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "@/lib/claude";
import { getRelevantMemories } from "@/lib/memories";
import { shouldRing } from "@/lib/availability";
import { requestedPartnerId, resolvePartner } from "@/lib/partner";
import { buildPersonaPrompt, getRecentLines } from "@/lib/prompt";
import { getStage } from "@/lib/relationship";
import { getOrCreateSchedule } from "@/lib/schedule";
import { simNow } from "@/lib/simtime";
import { getSession } from "@/lib/supabase/server";
import type { Memory, Message, Profile } from "@/lib/types";

const MAX_FOLLOW_UPS = 2;

/** Shifts a YYYY-MM-DD date by whole days. */
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Memories worth asking about this morning: recent events/plans not yet
 * followed up (e.g. yesterday's doctor visit), then ones coming up in the next
 * two days, then the generally most relevant memories.
 */
async function pickFollowUps(
  supabase: SupabaseClient,
  userId: string,
  partnerId: string,
  simDate: string,
): Promise<Memory[]> {
  const { data } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .eq("partner_id", partnerId)
    .in("category", ["event", "plan"])
    .eq("followed_up", false)
    .not("event_date", "is", null)
    .gte("event_date", addDays(simDate, -2))
    .lte("event_date", addDays(simDate, 2))
    .order("importance", { ascending: false });
  const dated = (data ?? []) as Memory[];

  const recent = dated
    .filter((m) => m.event_date! <= simDate)
    .sort((a, b) => b.event_date!.localeCompare(a.event_date!));
  const upcoming = dated
    .filter((m) => m.event_date! > simDate)
    .sort((a, b) => a.event_date!.localeCompare(b.event_date!));
  const picked = [...recent, ...upcoming].slice(0, MAX_FOLLOW_UPS);
  if (picked.length > 0) return picked;

  const relevant = await getRelevantMemories(supabase, userId, partnerId, "", simDate, 4);
  return relevant.filter((m) => !m.followed_up).slice(0, 1);
}

function describeFollowUp(m: Memory, simDate: string) {
  if (!m.event_date) return `- ${m.content}`;
  const when =
    m.event_date < simDate ? "already happened — ask how it went" : m.event_date === simDate ? "is today" : "is coming up soon";
  return `- ${m.content} (date: ${m.event_date}; this ${when})`;
}

const NUDGE_COOLDOWN = 2; // reach-outs in a row that may not both nudge

interface Nudge {
  name: string;
  relationship: string | null;
  memories: Memory[];
}

const personKey = (name: string) => name.trim().toLowerCase();

/**
 * Occasionally encourages the user to contact a real person in their life:
 * only when someone is known and none of the last two reach-outs nudged.
 * Prefers a person tied to a recent feeling/event and avoids repeating the
 * person nudged last time when someone else is known.
 */
async function pickNudge(
  supabase: SupabaseClient,
  userId: string,
  partnerId: string,
  simDate: string,
): Promise<Nudge | null> {
  const [{ data: recentReachOuts }, { data: lastNudged }, { data: personMemories }] = await Promise.all([
    supabase
      .from("messages")
      .select("nudged_person")
      .eq("user_id", userId)
      .eq("partner_id", partnerId)
      .eq("kind", "reach_out")
      .order("created_at", { ascending: false })
      .limit(NUDGE_COOLDOWN),
    supabase
      .from("messages")
      .select("nudged_person")
      .eq("user_id", userId)
      .eq("partner_id", partnerId)
      .eq("kind", "reach_out")
      .not("nudged_person", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("memories")
      .select("*")
      .eq("user_id", userId)
      .eq("partner_id", partnerId)
      .not("person_name", "is", null)
      .order("sim_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if ((recentReachOuts ?? []).some((m) => m.nudged_person)) return null;

  // Group by person, keeping the most recent memory first.
  const people = new Map<string, Nudge>();
  for (const m of (personMemories ?? []) as Memory[]) {
    if (!m.person_name?.trim()) continue;
    const key = personKey(m.person_name);
    const person = people.get(key) ?? { name: m.person_name.trim(), relationship: null, memories: [] };
    person.relationship ??= m.relationship?.trim() || null;
    person.memories.push(m);
    people.set(key, person);
  }
  if (people.size === 0) return null;

  const weekAgo = addDays(simDate, -7);
  const isTimely = (m: Memory) =>
    (m.category === "feeling" || m.category === "event") &&
    (m.sim_date >= weekAgo ||
      (m.event_date !== null && m.event_date >= addDays(simDate, -3) && m.event_date <= addDays(simDate, 3)));
  // Map order is already "most recent person memory first"; stable sort keeps it within each tier.
  let candidates = [...people.values()].sort(
    (a, b) => Number(b.memories.some(isTimely)) - Number(a.memories.some(isTimely)),
  );
  const previous = lastNudged?.nudged_person ? personKey(lastNudged.nudged_person) : null;
  if (candidates.length > 1 && previous) candidates = candidates.filter((p) => personKey(p.name) !== previous);

  const chosen = candidates[0];
  return { ...chosen, memories: chosen.memories.slice(0, 3) };
}

export async function POST(request: Request) {
  const requested = requestedPartnerId(await request.json().catch(() => null));
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) {
    return Response.json({ error: "Please sign in again to continue." }, { status: 401 });
  }
  const persona = await resolvePartner(supabase, user.id, profile.partner_id, requested);
  if (!persona) {
    return Response.json({ error: "This page is out of date. Please refresh the page." }, { status: 409 });
  }

  // Conditional update so a double click can't skip two days at once.
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    // The partner who reaches out becomes the open one, so the incoming-call screen shows them.
    .update({ day_offset: profile.day_offset + 1, partner_id: persona.id })
    .eq("id", user.id)
    .eq("day_offset", profile.day_offset)
    .select("*")
    .maybeSingle();
  if (updateError) {
    return Response.json({ error: "We couldn't move to the next day. Please try again." }, { status: 500 });
  }
  if (!updated) {
    return Response.json({ error: "The next day has already started. Please refresh the page." }, { status: 409 });
  }
  const nextProfile = updated as Profile;

  try {
    const { date, weekday } = simNow(nextProfile);
    const [schedule, followUps, nudge, { stage }, recent, { data: lastPartner }, { count: earlierReachOuts }] = await Promise.all([
      getOrCreateSchedule(supabase, user.id, persona, date, weekday),
      pickFollowUps(supabase, user.id, persona.id, date),
      pickNudge(supabase, user.id, persona.id, date),
      getStage(supabase, user.id, persona.id),
      getRecentLines(supabase, user.id, persona.id),
      // A busy note as the partner's latest message means the user's last messages are still unanswered.
      supabase
        .from("messages")
        .select("kind, content")
        .eq("user_id", user.id)
        .eq("partner_id", persona.id)
        .eq("role", "partner")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("partner_id", persona.id)
        .eq("kind", "reach_out"),
    ]);
    const unansweredNote = lastPartner?.kind === "busy_note" ? (lastPartner.content as string) : null;
    const morning = schedule.items.find((i) => !i.busy) ?? null;
    const time = morning?.start ?? "09:00";
    const memories = await getRelevantMemories(supabase, user.id, persona.id, followUps.map((m) => m.content).join(" "), date);

    const system = buildPersonaPrompt({
      persona,
      profile: nextProfile,
      memories,
      simDate: date,
      weekday,
      time,
      nowActivity: morning,
      channel: "chat",
      stage,
      recent,
    });
    const plan = schedule.items.map((i) => `${i.start}-${i.end} ${i.activity}`).join("; ");
    const followUpText =
      followUps.length > 0
        ? `Naturally follow up on:\n${followUps.map((m) => describeFollowUp(m, date)).join("\n")}`
        : `You don't know much about ${nextProfile.name} yet, so ask a gentle question to get to know them better.`;
    const unansweredText = unansweredNote
      ? `\nImportant: ${nextProfile.name} wrote to you while you were away, and the app told them: "${unansweredNote}" You never answered. Start by answering what they last wrote (see your recent messages), with a short, natural word about why you're only replying now (fell asleep, got caught up). Then the rest.`
      : "";
    const nudgeText = nudge
      ? `\nAlso, gently and without pressure, encourage ${nextProfile.name} to give ${nudge.name}${nudge.relationship ? ` (${nudge.relationship})` : ""} a call or a message, referencing what they told you:\n${nudge.memories.map((m) => `- ${m.content}`).join("\n")}\nOne warm sentence, not preachy.`
      : "";

    const content = await generateText({
      system,
      messages: [
        {
          role: "user",
          content: `(App instruction, not from ${nextProfile.name}.) It is the morning of ${weekday}. Write the first message of the day to ${nextProfile.name}, starting the conversation yourself. Mention briefly what you're up to today from your schedule (${plan}). ${followUpText}${unansweredText}${nudgeText}
Write ${nudge ? "3-4" : "2-3"} short sentences with exactly one question. Reply with the message text only.`,
        },
      ],
      maxTokens: 1000,
    });
    if (!content) {
      throw new Error("Empty reach-out message");
    }

    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
        partner_id: persona.id,
        role: "partner",
        kind: "reach_out",
        content,
        sim_date: date,
        nudged_person: nudge?.name ?? null,
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    if (followUps.length > 0) {
      await supabase
        .from("memories")
        .update({ followed_up: true })
        .in(
          "id",
          followUps.map((m) => m.id),
        );
    }

    // Every other morning the partner phones instead, counted per partner, so their
    // first morning is always a call (skipping days elsewhere doesn't change that).
    return Response.json({ message: message as Message, ring: shouldRing(earlierReachOuts ?? 0) });
  } catch (err) {
    console.error("reach-out failed", err);
    // Roll the day back so the user can simply try again.
    await supabase
      .from("profiles")
      .update({ day_offset: profile.day_offset })
      .eq("id", user.id)
      .eq("day_offset", nextProfile.day_offset);
    return Response.json(
      { error: `${persona.name} couldn't write right now. Please try again in a moment.` },
      { status: 502 },
    );
  }
}
