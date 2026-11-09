"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeclineNotice } from "@/components/discover/DeclineNotice";
import { MatchOverlay } from "@/components/discover/MatchOverlay";
import { PendingLikes } from "@/components/discover/PendingLikes";
import { ProfileCard, ProfileDetails } from "@/components/discover/ProfileCard";
import type { DecidedLike, PendingLike } from "@/lib/likes";
import { getPersona, type Persona } from "@/lib/personas";

type Action = "like" | "pass";

const SWIPE_THRESHOLD = 110; // px of horizontal drag that counts as a decision
const FLING_MS = 300; // matches duration-300 on the card
/** Longest the page keeps a timer for an answer; longer waits are checked on the next visit. */
const MAX_POLL_MS = 6 * 60 * 60_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type LikesResponse = {
  pending?: PendingLike | PendingLike[] | null;
  decided?: DecidedLike[];
  error?: string;
};

async function callLikes(method: "POST" | "GET" | "PUT", body?: unknown): Promise<LikesResponse> {
  const res = await fetch("/api/discover", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as LikesResponse | null;
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong. Please try again.");
  return data ?? {};
}

/** Swipeable stack of partner profiles with Pass / Like buttons, keyboard arrows and the match celebration. */
export function DiscoverDeck({
  initialDeck,
  userName,
  initialPending,
  initialDecided,
}: {
  initialDeck: string[];
  userName: string;
  /** Likes the partners haven't answered yet. */
  initialPending: PendingLike[];
  /** Answers that came in since the last visit, to reveal one by one. */
  initialDecided: DecidedLike[];
}) {
  const router = useRouter();
  const [deck, setDeck] = useState<Persona[]>(() =>
    initialDeck.map((id) => getPersona(id)).filter((p): p is Persona => Boolean(p)),
  );
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [fling, setFling] = useState<Action | null>(null);
  const [sending, setSending] = useState<Persona | null>(null);
  const [pending, setPending] = useState<PendingLike[]>(initialPending);
  const [answers, setAnswers] = useState<DecidedLike[]>(initialDecided);
  const [skipping, setSkipping] = useState(false);
  const answer = answers[0] ?? null;
  const answerPersona = answer ? (getPersona(answer.partnerId) ?? null) : null;
  const matched = answer?.status === "matched" ? answerPersona : null;
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [resetting, setResetting] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  const current = deck[0] ?? null;
  const next = deck[1] ?? null;
  const busy = fling !== null || sending !== null || answer !== null;

  /** Folds a likes response into the waiting list and queues any answers to reveal. */
  const applyLikes = useCallback((data: LikesResponse) => {
    if (Array.isArray(data.pending)) setPending(data.pending);
    else if (data.pending) {
      const one = data.pending;
      setPending((list) => [...list.filter((p) => p.partnerId !== one.partnerId), one]);
    }
    const decided = data.decided ?? [];
    if (decided.length > 0) {
      const ids = new Set(decided.map((d) => d.partnerId));
      setPending((list) => list.filter((p) => !ids.has(p.partnerId)));
      setAnswers((queue) => [...queue, ...decided]);
    }
  }, []);

  const decide = useCallback(
    async (action: Action) => {
      const persona = deck[0];
      if (!persona || busy) return;
      setError(null);
      setFling(action);
      setAnnouncement(action === "like" ? `You liked ${persona.name}.` : `You passed on ${persona.name}.`);
      if (!prefersReducedMotion()) await wait(FLING_MS);
      setDeck((d) => d.slice(1));
      setFling(null);
      setDrag({ x: 0, y: 0, active: false });
      setExpanded(false);

      try {
        if (action === "pass") {
          await callLikes("POST", { partnerId: persona.id, action: "pass" });
          return;
        }
        setSending(persona);
        const data = await callLikes("POST", { partnerId: persona.id, action: "like" });
        setSending(null);
        applyLikes(data);
        setAnnouncement(`Your like is on its way to ${persona.name}.`);
      } catch (e) {
        // Put the card back so nothing is lost.
        setSending(null);
        setDeck((d) => [persona, ...d.filter((p) => p.id !== persona.id)]);
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      }
    },
    [deck, busy, applyLikes],
  );

  // Ask again when the next partner is due to answer (only while it's a reasonable wait).
  const nextWait = pending.length > 0 ? Math.min(...pending.map((p) => p.waitMs)) : null;
  useEffect(() => {
    if (nextWait === null || nextWait > MAX_POLL_MS) return;
    const timer = window.setTimeout(() => {
      callLikes("GET").then(applyLikes, () => {});
    }, nextWait + 1500);
    return () => window.clearTimeout(timer);
  }, [nextWait, pending, applyLikes]);

  const answerAnnouncement =
    answer && answerPersona
      ? answer.status === "matched"
        ? `It's a match! ${answerPersona.name} liked you back.`
        : `${answerPersona.name} decided not to connect right now.`
      : null;

  async function skipAhead() {
    setSkipping(true);
    setError(null);
    try {
      applyLikes(await callLikes("PUT"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSkipping(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Only when nothing else has focus, so arrow keys on a link or button never pass or like someone by accident.
      const focused = target?.closest("input, textarea, select, [contenteditable], button, a");
      if (focused && !focused.hasAttribute("data-deck-decision")) return;
      if (e.key === "ArrowLeft") decide("pass");
      else if (e.key === "ArrowRight") decide("like");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy || (e.pointerType === "mouse" && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ x: e.clientX - start.current.x, y: (e.clientY - start.current.y) * 0.3, active: true });
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (!start.current || start.current.id !== e.pointerId) return;
    start.current = null;
    if (!cancelled && Math.abs(drag.x) > SWIPE_THRESHOLD) {
      decide(drag.x > 0 ? "like" : "pass");
    } else {
      setDrag({ x: 0, y: 0, active: false });
    }
  }

  function nextAnswer() {
    const wasMatch = answer?.status === "matched";
    setAnswers((queue) => queue.slice(1));
    if (wasMatch) router.refresh(); // header now shows the newly matched partner
  }

  async function startOver() {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/discover", { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "We couldn't start over just now. Please try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't start over just now. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  let transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`;
  if (fling) transform = `translate(${fling === "like" ? 150 : -150}vw, ${drag.y}px) rotate(${fling === "like" ? 30 : -30}deg)`;
  const hint = fling ?? (drag.x > SWIPE_THRESHOLD / 2 ? "like" : drag.x < -SWIPE_THRESHOLD / 2 ? "pass" : null);

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {answerAnnouncement ?? announcement}
      </p>

      {error && (
        <p role="alert" className="rounded-2xl bg-accent-soft px-4 py-3 text-lg font-bold">
          {error}
        </p>
      )}

      <PendingLikes pending={pending} onSkip={skipAhead} skipping={skipping} />

      {sending ? (
        <div className="card flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <span className="animate-pulse text-6xl motion-reduce:animate-none" aria-hidden>
            💌
          </span>
          <p className="text-2xl font-bold">Sending your like to {sending.name}…</p>
        </div>
      ) : current ? (
        <>
          <div className="relative h-[70vh] max-h-[44rem] min-h-[26rem]">
            {next && (
              <div className="absolute inset-0 translate-y-3 scale-95 opacity-80" aria-hidden>
                <ProfileCard persona={next} />
              </div>
            )}
            <div
              className={`absolute inset-0 cursor-grab touch-pan-y select-none active:cursor-grabbing ${
                drag.active ? "" : "transition-transform duration-300 ease-out motion-reduce:transition-none"
              }`}
              style={{ transform }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => endDrag(e, false)}
              onPointerCancel={(e) => endDrag(e, true)}
              aria-roledescription="profile card"
              aria-label={`${current.name}, ${current.age}. Swipe right or press Like, swipe left or press Pass.`}
            >
              <ProfileCard key={current.id} persona={current} priority />
              {hint && (
                <span
                  aria-hidden
                  className={`absolute top-16 rounded-2xl border-4 bg-white/90 px-4 py-1 text-3xl font-bold ${
                    hint === "like" ? "left-6 -rotate-12 border-accent text-accent" : "right-6 rotate-12 border-[#3d3438] text-[#3d3438]"
                  }`}
                >
                  {hint === "like" ? "LIKE ❤️" : "PASS ✕"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start justify-center gap-10">
            <DecisionButton label="Pass" icon="✕" onClick={() => decide("pass")} disabled={busy} variant="pass" name={current.name} />
            <DecisionButton label="Like" icon="❤️" onClick={() => decide("like")} disabled={busy} variant="like" name={current.name} />
          </div>
          <p className="text-center text-base text-muted">Tip: you can also swipe the photo, or use the ← and → keys.</p>

          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="profile-details"
            onClick={() => setExpanded((v) => !v)}
            className="btn-secondary w-full"
          >
            {expanded ? `Hide details` : `More about ${current.name}`} <span aria-hidden>{expanded ? "▲" : "▼"}</span>
          </button>
          {expanded && <ProfileDetails persona={current} id="profile-details" />}
        </>
      ) : (
        <section className="card flex flex-col gap-4 text-center">
          <p className="text-5xl" aria-hidden>
            🌷
          </p>
          <h2 className="text-2xl font-bold">You&apos;ve met everyone for now</h2>
          <p className="text-xl">Your matches are waiting to hear from you. You can also look through the people you passed again.</p>
          <Link href="/matches" className="btn-primary">
            💞 See my matches
          </Link>
          <button type="button" onClick={startOver} disabled={resetting} className="btn-secondary">
            {resetting ? "Starting over…" : "🔄 Start over"}
          </button>
        </section>
      )}

      {matched && <MatchOverlay persona={matched} userName={userName} onContinue={nextAnswer} />}
      {answer?.status === "declined" && answerPersona && <DeclineNotice persona={answerPersona} onContinue={nextAnswer} />}
    </>
  );
}

function DecisionButton({
  label,
  icon,
  name,
  variant,
  onClick,
  disabled,
}: {
  label: string;
  icon: string;
  name: string;
  variant: "like" | "pass";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`${label} ${name}`}
        data-deck-decision
        className={`flex h-20 w-20 items-center justify-center rounded-full text-4xl shadow-lg transition-transform hover:scale-105 disabled:opacity-50 motion-reduce:transition-none ${
          variant === "like" ? "bg-accent text-white" : "border-4 border-[#3d3438] bg-white text-[#3d3438]"
        }`}
      >
        <span aria-hidden>{icon}</span>
      </button>
      <span className="text-lg font-bold" aria-hidden>
        {label}
      </span>
    </div>
  );
}
