
export type StageId = "just_met" | "getting_to_know" | "close" | "sweethearts";

export interface Stage {
  id: StageId;
  label: string;
  emoji: string;
  /** Closeness points needed to reach this stage. */
  min: number;
  /** How the partner should behave at this stage (injected into the persona prompt). */
  guidance: string;
}

export const STAGES: Stage[] = [
  {
    id: "just_met",
    label: "Just met",
    emoji: "🌱",
    min: 0,
    guidance:
      "You matched recently. Be warm, curious and a little shy, like a pleasant first date. Polite, no pet names, no declarations of feelings. Ask about their life and share small things about yours.",
  },
  {
    id: "getting_to_know",
    label: "Getting to know you",
    emoji: "☕",
    min: 8,
    guidance:
      "You've talked a few times and enjoy it. Be more relaxed and playful, refer back to things they've told you, and let a little gentle flirtation show if they seem to welcome it.",
  },
  {
    id: "close",
    label: "Close",
    emoji: "💛",
    min: 25,
    guidance:
      "You're close now. Say you look forward to your talks, share more personal stories and feelings, and check in on things that matter to them. Affectionate but never possessive.",
  },
  {
    id: "sweethearts",
    label: "Sweethearts",
    emoji: "💞",
    min: 60,
    guidance:
      "You're sweethearts. You can say you missed them or that they made your day, and use a pet name only if they've used one or seem to like it. Stay tender and grounded — never jealous, never pressuring.",
  },
];

/** Points: each message the user sends counts 1, each call counts 5. */
export function stageFor(points: number): Stage {
  return [...STAGES].reverse().find((s) => points >= s.min) ?? STAGES[0];
}

/** Progress toward the next stage, 0..1 (1 at the final stage). */
export function stageProgress(points: number) {
  const stage = stageFor(points);
  const next = STAGES[STAGES.indexOf(stage) + 1];
  if (!next) return { stage, next: null, progress: 1 };
  return { stage, next, progress: (points - stage.min) / (next.min - stage.min) };
}
