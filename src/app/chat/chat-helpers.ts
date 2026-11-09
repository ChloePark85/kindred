import type { Persona } from "@/lib/personas";
import type { Message, ScheduleItem } from "@/lib/types";

/**
 * Lowercases the first letter so an activity reads naturally mid-sentence,
 * but leaves acronyms ("GP appointment") and names alone.
 */
function inSentence(activity: string) {
  if (/^[A-Z]{2}/.test(activity)) return activity;
  return activity.charAt(0).toLowerCase() + activity.slice(1);
}

/** The partner can't reply right away during a busy block or at night (no block). */
export function isBusy(item: ScheduleItem | null) {
  return !item || item.busy;
}

/** "Margaret right now: watering the roses" */
export function partnerStatus(persona: Persona, item: ScheduleItem | null) {
  return `${persona.name} right now: ${item ? inSentence(item.activity) : "resting for the night"}`;
}

/** Gray system line shown when the partner is busy. */
export function busyNote(persona: Persona, item: ScheduleItem | null) {
  if (!item) return `🌙 ${persona.name} has turned in for the night. ${persona.name} will reply in a little while.`;
  return `${persona.emoji} ${persona.name} is busy right now (${inSentence(item.activity)}). ${persona.name} will reply in a little while.`;
}

/** True while a busy note is the partner's latest message, i.e. a delayed reply is still owed. */
export function awaitingDelayedReply(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "partner") return messages[i].kind === "busy_note";
  }
  return false;
}
