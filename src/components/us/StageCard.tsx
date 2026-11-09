import type { Stage } from "@/lib/relationship";

/** Relationship stage with this partner, progress toward the next one, and the match date. */
export function StageCard({
  partnerName,
  stage,
  next,
  progress,
  pointsToNext,
  matchedAt,
}: {
  partnerName: string;
  stage: Stage;
  next: Stage | null;
  progress: number;
  pointsToNext: number;
  matchedAt: string | null;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <section aria-labelledby="stage-heading" className="card flex flex-col gap-3">
      <p className="text-lg text-muted">You and {partnerName}</p>
      <h2 id="stage-heading" className="text-3xl font-bold">
        <span aria-hidden>{stage.emoji}</span> {stage.label}
      </h2>
      {next ? (
        <>
          <div
            role="progressbar"
            aria-label={`Progress to ${next.label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-5 w-full overflow-hidden rounded-full bg-accent-soft"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-lg">
            {pointsToNext} more {pointsToNext === 1 ? "chat" : "chats"} to {next.emoji} {next.label}
          </p>
        </>
      ) : (
        <p className="text-lg">You&apos;ve reached the closest stage together.</p>
      )}
      {matchedAt && (
        <p className="text-base text-muted">
          <span aria-hidden>💞</span> Matched since{" "}
          {new Date(matchedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      )}
    </section>
  );
}
