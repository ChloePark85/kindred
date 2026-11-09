"use client";

import { PartnerPhoto } from "@/components/PartnerPhoto";
import type { PendingLike } from "@/lib/likes";
import { getPersona } from "@/lib/personas";

/** Under this, the partner is "looking at your profile" rather than busy or asleep. */
const SOON_MS = 15 * 60_000;
/** Offer to skip ahead when someone won't answer for longer than this. */
const SKIP_AFTER_MS = 20 * 60_000;

function waitingLine(name: string, like: PendingLike) {
  if (like.waitMs < SOON_MS) return `${name} is looking at your profile… 💭`;
  if (like.laterDay) return `${name} has gone to sleep 🌙 and will see your like in the morning.`;
  return `${name} is busy right now and will see your like around ${like.answersAt}.`;
}

/** Likes the partners haven't answered yet, so waiting feels like waiting for a real person. */
export function PendingLikes({
  pending,
  onSkip,
  skipping,
}: {
  pending: PendingLike[];
  onSkip: () => void;
  skipping: boolean;
}) {
  if (pending.length === 0) return null;
  const canSkip = pending.some((p) => p.waitMs > SKIP_AFTER_MS);
  return (
    <section aria-label="Likes waiting for an answer" className="card flex flex-col gap-3">
      <h2 className="text-xl font-bold">💌 Waiting to hear back</h2>
      <ul className="flex flex-col gap-3">
        {pending.map((like) => {
          const persona = getPersona(like.partnerId);
          if (!persona) return null;
          return (
            <li key={like.partnerId} className="flex items-center gap-3">
              <PartnerPhoto persona={persona} small decorative className="h-14 w-14 shrink-0 rounded-full" />
              <p className="text-lg">{waitingLine(persona.name, like)}</p>
            </li>
          );
        })}
      </ul>
      {canSkip && (
        <button type="button" onClick={onSkip} disabled={skipping} className="btn-secondary">
          {skipping ? "Moving to tomorrow…" : "☀️ Skip ahead to tomorrow"}
        </button>
      )}
    </section>
  );
}
