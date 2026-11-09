import type { Persona } from "@/lib/personas";
import type { Profile, Schedule } from "@/lib/types";

/**
 * Partners live their own day. These helpers turn the partner's schedule into
 * "when can they reply / look at a like", on the user's simulated clock.
 */

const MINUTE = 60_000;
/** When partners wake up when their day's schedule doesn't say otherwise. */
const WAKE_TIME = "07:30";

/** The user's simulated clock as an instant: real time shifted by day_offset days. */
export function simInstant(profile: Pick<Profile, "day_offset">, at = Date.now()) {
  return at + profile.day_offset * 86_400_000;
}

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export type Availability =
  | { state: "free" }
  /** In a busy block (or several in a row) until `until` (HH:MM). */
  | { state: "busy"; until: string; minutes: number; activity: string }
  /** Asleep; wakes at `until` (HH:MM), today or tomorrow morning. */
  | { state: "asleep"; until: string; minutes: number; tomorrow: boolean };

/** Whether the partner can reply at `time` (HH:MM) and, if not, how long until they can. */
export function availability(schedule: Schedule, time: string): Availability {
  const items = [...schedule.items].sort((a, b) => a.start.localeCompare(b.start));
  const now = minutesOf(time);
  const current = items.find((i) => i.start <= time && time < i.end) ?? null;
  if (current && !current.busy) return { state: "free" };

  if (current) {
    // Busy blocks can follow each other; they're free when the run ends.
    let end = current.end;
    for (const next of items) {
      if (next.start === end && next.busy) end = next.end;
    }
    const lastEnd = items.at(-1)?.end ?? end;
    if (end < lastEnd) return { state: "busy", until: end, minutes: minutesOf(end) - now, activity: current.activity };
    // Busy until the end of their day: they reply in the morning.
  }

  const firstStart = items[0]?.start ?? WAKE_TIME;
  // A gap between blocks in the middle of the day: away until the next block.
  const nextBlock = !current && time >= firstStart ? items.find((i) => i.start > time) : undefined;
  if (nextBlock) {
    return { state: "busy", until: nextBlock.start, minutes: minutesOf(nextBlock.start) - now, activity: "Out and about" };
  }
  if (time < firstStart) return { state: "asleep", until: firstStart, minutes: minutesOf(firstStart) - now, tomorrow: false };
  return { state: "asleep", until: WAKE_TIME, minutes: 24 * 60 - now + minutesOf(WAKE_TIME), tomorrow: true };
}

/** "10:30" -> "10:30 AM" */
export function clockLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

function inSentence(activity: string) {
  if (/^[A-Z]{2}/.test(activity)) return activity;
  return activity.charAt(0).toLowerCase() + activity.slice(1);
}

/**
 * How long until the partner reads and answers a message sent now, and the
 * gray note the chat shows meanwhile. Null when they answer right away.
 * `roll` (0..1) decides whether a free partner happens to look a little later.
 */
export function replyDelay(
  persona: Persona,
  avail: Availability,
  roll: number,
): { minutes: number; note: string } | null {
  if (avail.state === "busy") {
    return {
      minutes: avail.minutes + Math.round(roll * 4),
      note: `${persona.emoji} ${persona.name} is busy right now (${inSentence(avail.activity)}) until about ${clockLabel(avail.until)}. ${persona.name} will reply when free.`,
    };
  }
  if (avail.state === "asleep") {
    return {
      minutes: avail.minutes + Math.round(roll * 20),
      note: avail.tomorrow
        ? `🌙 ${persona.name} has gone to sleep. ${persona.name} will see your message in the morning.`
        : `🌙 ${persona.name} is still asleep. ${persona.name} will see your message after waking up, around ${clockLabel(avail.until)}.`,
    };
  }
  // Free, but people don't always look at their phone straight away.
  if (roll < 0.2) {
    return {
      minutes: 2 + Math.round(roll * 20),
      note: `✓ Delivered. ${persona.name} hasn't seen it yet.`,
    };
  }
  return null;
}

/** Milliseconds from now until a reply_at / decide_at instant on the simulated clock (0 if past). */
export function msUntil(profile: Pick<Profile, "day_offset">, instantIso: string, at = Date.now()) {
  return Math.max(0, Date.parse(instantIso) - simInstant(profile, at));
}

/** ISO instant `minutes` from now on the simulated clock. */
export function simInstantIn(profile: Pick<Profile, "day_offset">, minutes: number, at = Date.now()) {
  return new Date(simInstant(profile, at) + minutes * MINUTE).toISOString();
}

/** How many of the user's interests the partner shares (loose word match against hobbies and bio). */
export function sharedInterests(interests: string[], persona: Persona) {
  const text = `${persona.hobbies.join(" ")} ${persona.bio} ${persona.lookingFor}`.toLowerCase();
  const stem = (w: string) => w.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/(ing|s)$/, "");
  return interests.filter((i) => {
    const words = stem(i).split(/\s+/).filter((w) => w.length >= 4);
    return words.some((w) => text.includes(w));
  }).length;
}

/**
 * Whether the partner says yes to a like. Their first match is always a yes, so
 * nobody is left with no one to talk to; after that, about two in three say
 * yes, more when interests overlap. `roll` is 0..1.
 */
export function acceptsLike(opts: { hasMatch: boolean; shared: number; roll: number }) {
  if (!opts.hasMatch) return true;
  const chance = Math.min(0.85, 0.6 + 0.1 * opts.shared);
  return opts.roll < chance;
}

/**
 * How long until the partner looks at a like. A free partner takes a little
 * while (shorter for the first one, so nobody waits long for their first match);
 * otherwise when they're free or awake again.
 */
export function likeDecisionMinutes(avail: Availability, firstLike: boolean, roll: number) {
  if (avail.state === "free") return firstLike ? 0.5 + roll * 0.5 : 1 + roll * 4;
  return avail.minutes + Math.round(roll * 10);
}
