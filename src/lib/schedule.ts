import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson } from "@/lib/claude";
import type { Persona } from "@/lib/personas";
import type { Schedule, ScheduleItem } from "@/lib/types";

const ScheduleSchema = z.object({
  items: z.array(
    z.object({
      start: z.string().describe("HH:MM 24h"),
      end: z.string().describe("HH:MM 24h"),
      activity: z.string().describe("Short description, e.g. 'Watering the roses'"),
      busy: z.boolean().describe("True if they could not reply to messages right away"),
    }),
  ),
});

/** Returns the partner's schedule for a simulated date, generating and storing it on first use. */
export async function getOrCreateSchedule(
  supabase: SupabaseClient,
  userId: string,
  persona: Persona,
  simDate: string,
  weekday: string,
): Promise<Schedule> {
  const { data: found } = await supabase
    .from("schedules")
    .select("*")
    .eq("user_id", userId)
    .eq("partner_id", persona.id)
    .eq("sim_date", simDate)
    .maybeSingle();
  if (found) return found as Schedule;

  const result = await generateJson({
    system: "You plan a realistic, simple daily schedule for a fictional character.",
    prompt: `Character: ${persona.name}, ${persona.age}. ${persona.bio}
Usual routine: ${persona.routine}
Date: ${weekday}, ${simDate}

Write 6-9 consecutive time blocks from 07:00 to 22:00 covering the whole day. Vary details from day to day. Mark 2-3 blocks as busy (e.g. choir practice, a nap, a doctor visit, volunteering) — the rest free.`,
    schema: ScheduleSchema,
  });
  const items: ScheduleItem[] = result?.items?.length
    ? result.items
    : [
        { start: "07:00", end: "12:00", activity: "Morning routine and chores", busy: false },
        { start: "12:00", end: "14:00", activity: "Lunch and a short nap", busy: true },
        { start: "14:00", end: "22:00", activity: "Relaxing at home", busy: false },
      ];

  const { data, error } = await supabase
    .from("schedules")
    .upsert(
      { user_id: userId, partner_id: persona.id, sim_date: simDate, items },
      { onConflict: "user_id,partner_id,sim_date" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as Schedule;
}

/** The block covering `time` (HH:MM), or null outside the schedule (night). */
export function currentItem(schedule: Schedule, time: string): ScheduleItem | null {
  return schedule.items.find((i) => i.start <= time && time < i.end) ?? null;
}

/** First non-busy block starting at or after `time`. */
export function nextFreeItem(schedule: Schedule, time: string): ScheduleItem | null {
  return schedule.items.find((i) => !i.busy && i.start >= time) ?? null;
}
