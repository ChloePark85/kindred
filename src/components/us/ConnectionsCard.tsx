import type { Memory } from "@/lib/types";

/** Distinct real people (case-insensitive) mentioned in memories noted in the last 7 simulated days. */
export function weeklyConnections(memories: Memory[], today: string) {
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const weekStart = start.toISOString().slice(0, 10);

  const people = new Map<string, { name: string; relationship: string | null }>();
  // Memories arrive newest first, so the first spelling and relationship seen are the latest.
  for (const m of memories) {
    const name = m.person_name?.trim();
    if (!name || m.sim_date < weekStart || m.sim_date > today) continue;
    const key = name.toLowerCase();
    const person = people.get(key) ?? { name, relationship: null };
    person.relationship ??= m.relationship?.trim() || null;
    people.set(key, person);
  }
  return [...people.values()];
}

export function ConnectionsCard({
  people,
  partnerName,
}: {
  people: { name: string; relationship: string | null }[];
  partnerName: string;
}) {
  return (
    <section aria-labelledby="connections-heading" className="card flex flex-col gap-3 bg-accent-soft">
      <h2 id="connections-heading" className="text-2xl font-bold">
        Real-life connections this week
      </h2>
      {people.length === 0 ? (
        <p className="text-xl">
          No one mentioned yet this week, and that&apos;s okay. Whenever you feel like it, tell {partnerName} about the
          people in your life.
        </p>
      ) : (
        <>
          <p className="text-xl">
            You mentioned {people.length} {people.length === 1 ? "person" : "people"} in your life this week{" "}
            <span aria-hidden>💛</span>
          </p>
          <ul className="flex flex-wrap gap-2">
            {people.map((p) => (
              <li
                key={p.name.toLowerCase()}
                className="rounded-full border-2 border-[#cfc3b5] bg-white px-4 py-2 text-lg font-bold"
              >
                {p.name}
                {p.relationship && <span className="font-normal text-muted"> · {p.relationship}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
