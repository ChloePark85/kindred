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

/** "Margaret right now: watering the roses" */
export function partnerStatus(persona: Persona, item: ScheduleItem | null) {
  return `${persona.name} right now: ${item ? inSentence(item.activity) : "resting for the night"}`;
}

/** True while a busy note is the partner's latest message, i.e. a delayed reply is still owed. */
export function awaitingDelayedReply(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "partner") return messages[i].kind === "busy_note";
  }
  return false;
}
