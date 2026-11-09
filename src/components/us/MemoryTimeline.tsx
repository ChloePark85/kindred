"use client";

import { useState, useTransition } from "react";
import { forgetMemory } from "@/app/us/actions";
import { formatDateLong } from "@/lib/simtime";
import type { Memory, MemoryCategory } from "@/lib/types";

const CATEGORIES: { id: MemoryCategory; icon: string; label: string; itemLabel: string }[] = [
  { id: "event", icon: "📅", label: "Events", itemLabel: "Event" },
  { id: "person", icon: "👤", label: "People", itemLabel: "People" },
  { id: "feeling", icon: "💛", label: "Feelings", itemLabel: "Feelings" },
  { id: "plan", icon: "🗺️", label: "Plans", itemLabel: "Plans" },
];
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  MemoryCategory,
  (typeof CATEGORIES)[number]
>;

function formatShort(date: string, withWeekday: boolean) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: withWeekday ? "long" : undefined,
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Memories grouped by the simulated day they were noted, newest first, with filters and "Forget this". */
export function MemoryTimeline({ memories, partnerName }: { memories: Memory[]; partnerName: string }) {
  const [filter, setFilter] = useState<MemoryCategory | "all">("all");
  const [forgotten, setForgotten] = useState<Set<string>>(new Set());

  const kept = memories.filter((m) => !forgotten.has(m.id));
  const shown = filter === "all" ? kept : kept.filter((m) => m.category === filter);
  const since = kept.reduce<string | null>((min, m) => (min === null || m.sim_date < min ? m.sim_date : min), null);

  const groups: { date: string; items: Memory[] }[] = [];
  for (const m of [...shown].sort((a, b) => b.sim_date.localeCompare(a.sim_date))) {
    const last = groups.at(-1);
    if (last && last.date === m.sim_date) last.items.push(m);
    else groups.push({ date: m.sim_date, items: [m] });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xl text-muted">
        {kept.length} {kept.length === 1 ? "memory" : "memories"}
        {since && ` · since ${formatShort(since, false)}`}
      </p>

      <div role="group" aria-label="Show memories by type" className="flex flex-wrap gap-2">
        {[{ id: "all" as const, icon: "📖", label: "All" }, ...CATEGORIES].map((c) => {
          const count = c.id === "all" ? kept.length : kept.filter((m) => m.category === c.id).length;
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(c.id)}
              className={`btn px-5 ${active ? "bg-accent text-white" : "border-2 border-[#cfc3b5] bg-white"}`}
            >
              <span aria-hidden>{c.icon}</span> {c.label} ({count})
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <p className="card text-xl">Nothing in this group yet. Try &ldquo;All&rdquo; to see every note.</p>
      ) : (
        groups.map((g) => (
          <section key={g.date} aria-labelledby={`day-${g.date}`} className="flex flex-col gap-3">
            <h2 id={`day-${g.date}`} className="text-2xl font-bold">
              {formatDateLong(g.date)}
            </h2>
            <ul className="flex flex-col gap-3">
              {g.items.map((m) => (
                <MemoryItem
                  key={m.id}
                  memory={m}
                  partnerName={partnerName}
                  onForgotten={() => setForgotten((prev) => new Set(prev).add(m.id))}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function MemoryItem({
  memory,
  partnerName,
  onForgotten,
}: {
  memory: Memory;
  partnerName: string;
  onForgotten: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const category = CATEGORY_BY_ID[memory.category];

  function forget() {
    setError(null);
    startTransition(async () => {
      const result = await forgetMemory(memory.id).catch(() => ({
        error: "We couldn't reach the internet. Please check your connection and try again.",
      }));
      if (result.error) setError(result.error);
      else onForgotten();
    });
  }

  return (
    <li className="card flex flex-col gap-3">
      <p className="inline-flex items-center gap-2 self-start rounded-full bg-accent-soft px-3 py-1 text-base font-bold">
        <span aria-hidden>{category.icon}</span> {category.itemLabel}
      </p>
      <p className="text-xl">{memory.content}</p>
      {memory.person_name && (
        <p className="self-start rounded-full border-2 border-[#cfc3b5] px-3 py-1 text-base">
          <span aria-hidden>👤</span> {memory.person_name}
          {memory.relationship && ` (${memory.relationship})`}
        </p>
      )}
      {memory.event_date && <p className="text-lg text-muted">on {formatShort(memory.event_date, true)}</p>}
      {memory.followed_up && (
        <p className="text-base font-bold text-[#2f6b3a]">
          <span aria-hidden>✓</span> {partnerName} asked about this
        </p>
      )}

      {confirming ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-accent-soft p-4">
          <p className="text-lg font-bold">Forget this for good? {partnerName} won&apos;t remember it anymore.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={forget} disabled={pending} className="btn-primary">
              {pending ? "Forgetting…" : "Yes, forget it"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="btn-secondary">
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-secondary self-start">
          Forget this
        </button>
      )}
      {error && (
        <p role="alert" className="text-lg font-bold text-[#a3261b]">
          {error}
        </p>
      )}
    </li>
  );
}
