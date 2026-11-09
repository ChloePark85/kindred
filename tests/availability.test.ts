import { describe, expect, it } from "vitest";
import {
  acceptsLike,
  availability,
  clockLabel,
  likeDecisionMinutes,
  msUntil,
  replyDelay,
  sharedInterests,
  simInstantIn,
} from "@/lib/availability";
import { getPersona } from "@/lib/personas";
import type { Schedule } from "@/lib/types";

const schedule: Schedule = {
  id: "s1",
  user_id: "u1",
  partner_id: "walter",
  sim_date: "2026-11-09",
  items: [
    { start: "07:00", end: "09:00", activity: "Breakfast and the paper", busy: false },
    { start: "09:00", end: "11:30", activity: "Workshop: repairing a mantel clock", busy: true },
    { start: "11:30", end: "12:00", activity: "Choir practice", busy: true },
    { start: "12:00", end: "14:00", activity: "Lunch", busy: false },
    { start: "15:00", end: "21:00", activity: "Reading on the porch", busy: false },
    { start: "21:00", end: "22:00", activity: "Winding down", busy: true },
  ],
} as Schedule;

const walter = getPersona("walter")!;

describe("availability", () => {
  it("is free during a free block", () => {
    expect(availability(schedule, "08:15")).toEqual({ state: "free" });
  });

  it("is busy until the end of back-to-back busy blocks", () => {
    expect(availability(schedule, "10:00")).toMatchObject({ state: "busy", until: "12:00", minutes: 120 });
  });

  it("treats a gap between blocks as away until the next block", () => {
    expect(availability(schedule, "14:30")).toMatchObject({ state: "busy", until: "15:00", minutes: 30 });
  });

  it("is asleep before the day starts, waking at the first block", () => {
    expect(availability(schedule, "05:00")).toEqual({ state: "asleep", until: "07:00", minutes: 120, tomorrow: false });
  });

  it("is asleep after the day ends, until tomorrow morning", () => {
    expect(availability(schedule, "23:00")).toEqual({ state: "asleep", until: "07:30", minutes: 60 + 450, tomorrow: true });
  });

  it("sleeps through a busy block that runs to the end of the day", () => {
    expect(availability(schedule, "21:30")).toMatchObject({ state: "asleep", tomorrow: true });
  });
});

describe("replyDelay", () => {
  it("answers right away most of the time when free", () => {
    expect(replyDelay(walter, { state: "free" }, 0.5)).toBeNull();
  });

  it("sometimes hasn't looked at the phone yet", () => {
    const delay = replyDelay(walter, { state: "free" }, 0.1)!;
    expect(delay.minutes).toBeGreaterThanOrEqual(2);
    expect(delay.note).toContain("hasn't seen it yet");
  });

  it("replies after a busy block, saying until when", () => {
    const delay = replyDelay(walter, availability(schedule, "10:00"), 0)!;
    expect(delay.minutes).toBe(120);
    expect(delay.note).toContain("until about 12:00 PM");
  });

  it("sees messages in the morning when asleep", () => {
    const delay = replyDelay(walter, availability(schedule, "23:00"), 0)!;
    expect(delay.note).toContain("in the morning");
    expect(delay.minutes).toBe(510);
  });
});

describe("simulated clock", () => {
  it("counts the day offset, so skipping a day makes waits due", () => {
    const at = Date.parse("2026-11-09T12:00:00Z");
    const replyAt = simInstantIn({ day_offset: 0 }, 600, at); // 10 hours later
    expect(msUntil({ day_offset: 0 }, replyAt, at)).toBe(600 * 60_000);
    expect(msUntil({ day_offset: 1 }, replyAt, at)).toBe(0);
  });
});

describe("likes", () => {
  it("always says yes to someone's first match", () => {
    expect(acceptsLike({ hasMatch: false, shared: 0, roll: 0.99 })).toBe(true);
  });

  it("says yes more often with shared interests, and never more than 85%", () => {
    expect(acceptsLike({ hasMatch: true, shared: 0, roll: 0.65 })).toBe(false);
    expect(acceptsLike({ hasMatch: true, shared: 2, roll: 0.65 })).toBe(true);
    expect(acceptsLike({ hasMatch: true, shared: 9, roll: 0.86 })).toBe(false);
  });

  it("finds shared interests in the partner's hobbies and bio", () => {
    expect(sharedInterests(["🚶 Walking", "🧶 Crafts"], walter)).toBe(1); // "River walks"
    expect(sharedInterests([], walter)).toBe(0);
  });

  it("answers a first like within a minute when free, later likes in a few minutes, otherwise when free", () => {
    expect(likeDecisionMinutes({ state: "free" }, true, 1)).toBeLessThanOrEqual(1);
    expect(likeDecisionMinutes({ state: "free" }, false, 1)).toBeLessThanOrEqual(5);
    expect(likeDecisionMinutes(availability(schedule, "23:00"), true, 0)).toBe(510);
  });
});

describe("clockLabel", () => {
  it.each([
    ["00:05", "12:05 AM"],
    ["09:30", "9:30 AM"],
    ["12:00", "12:00 PM"],
    ["21:45", "9:45 PM"],
  ])("%s -> %s", (t, label) => expect(clockLabel(t)).toBe(label));
});

describe("morning reach-out rings", () => {
  it("rings on a partner's first morning, then every other one", async () => {
    const { shouldRing } = await import("@/lib/availability");
    expect([0, 1, 2, 3].map(shouldRing)).toEqual([true, false, true, false]);
  });
});
