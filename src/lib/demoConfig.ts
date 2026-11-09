/**
 * Demo mode, for filming a short walkthrough: visit any page with ?demo=1 (the
 * proxy keeps it in a cookie; ?demo=0 turns it off). Partners still live their
 * own day, but on a demo-friendly clock so every scene happens on cue:
 * - a like is answered in a few seconds: the first is a yes, the second a gentle no;
 * - the first message after matching finds the partner busy for ~20 seconds;
 * - otherwise the partner is free and answers right away (no sleeping, no "not seen yet").
 */
export const DEMO_COOKIE = "sc_demo";

export const DEMO = {
  /** How long a partner takes to answer a like. */
  likeMinutes: 0.1,
  /** How long the partner stays busy after the user's first message. */
  busyMinutes: 0.33,
  /** What the partner is busy with when the schedule has no busy block to borrow. */
  busyFallback: "Out running a quick errand",
} as const;
