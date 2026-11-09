import type { Profile } from "@/lib/types";

/**
 * The app keeps a "simulated" calendar per user: real wall-clock time in the
 * user's timezone, shifted forward by `day_offset` days ("simulate next day").
 */
export function simNow(profile: Pick<Profile, "timezone" | "day_offset">, at: Date = new Date()) {
  const shifted = new Date(at.getTime() + profile.day_offset * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(shifted);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD
  const time = `${get("hour")}:${get("minute")}`; // HH:MM
  return { date, time, weekday: get("weekday") };
}

export function formatDateLong(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
