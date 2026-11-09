import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { PartnerPhoto } from "@/components/PartnerPhoto";
import { getPersona, type Persona } from "@/lib/personas";
import { isDemo } from "@/lib/demo";
import { settleLikes } from "@/lib/likes";
import { getStage } from "@/lib/closeness";
import { type Stage } from "@/lib/relationship";
import { requireProfile } from "@/lib/session";
import type { Message } from "@/lib/types";
import { OpenMatchButtons } from "./OpenMatchButtons";

export const metadata: Metadata = {
  title: "Your matches — Kindred",
};

type MatchRow = { partner_id: string; matched_at: string | null; created_at: string };

function preview(message: Message | undefined, persona: Persona) {
  if (!message) return `Say hello to ${persona.name}!`;
  if (message.kind === "call") return "📞 Phone call";
  if (message.kind === "voice_message") return "🔊 Voice message";
  const text = message.content.replace(/\s+/g, " ").trim();
  const short = text.length > 80 ? `${text.slice(0, 79)}…` : text;
  return message.role === "user" ? `You: ${short}` : short;
}

export default function MatchesPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-10 text-xl">Finding your matches…</p>}>
      <MatchesContent />
    </Suspense>
  );
}

async function MatchesContent() {
  const { supabase, user, profile, persona: wasOpen } = await requireProfile();
  // Partners whose time has come answer the user's likes now; a yes becomes the open partner.
  const { decided, pending } = await settleLikes(supabase, user.id, profile, { demo: await isDemo() });
  const lastYes = decided.findLast((d) => d.status === "matched");
  const openPersona = lastYes ? (getPersona(lastYes.partnerId) ?? wasOpen) : wasOpen;

  const { data: matchRows, error } = await supabase
    .from("matches")
    .select("partner_id, matched_at, created_at")
    .eq("user_id", user.id)
    .eq("status", "matched")
    .order("matched_at", { ascending: false, nullsFirst: false });

  const matches = ((matchRows ?? []) as MatchRow[]).flatMap((m) => {
    const persona = getPersona(m.partner_id);
    return persona ? [{ persona, matchedAt: m.matched_at ?? m.created_at }] : [];
  });
  const partnerIds = matches.map((m) => m.persona.id);

  const lastMessage = new Map<string, Message>();
  const stages = new Map<string, Stage>();
  if (partnerIds.length > 0) {
    const [{ data: recent }, stageList] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("user_id", user.id)
        .in("partner_id", partnerIds)
        .neq("kind", "busy_note")
        .order("created_at", { ascending: false })
        .limit(300),
      Promise.all(partnerIds.map((id) => getStage(supabase, user.id, id))),
    ]);
    for (const m of (recent ?? []) as Message[]) if (!lastMessage.has(m.partner_id)) lastMessage.set(m.partner_id, m);
    partnerIds.forEach((id, i) => stages.set(id, stageList[i].stage));
  }

  const timeFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: profile.timezone || "UTC",
  });

  return (
    <>
      <AppHeader
        persona={openPersona}
        stage={openPersona ? stages.get(openPersona.id) : undefined}
        active="/matches"
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 text-lg">
        <h1 className="text-3xl font-bold">💞 Your matches</h1>

        {pending.length > 0 && (
          <Link href="/discover" className="card flex items-center gap-3 text-lg hover:bg-accent-soft/40">
            <span className="text-3xl" aria-hidden>
              💌
            </span>
            <span>
              Waiting to hear back from{" "}
              <strong>{pending.map((p) => getPersona(p.partnerId)?.name).filter(Boolean).join(", ")}</strong>
            </span>
          </Link>
        )}

        {error ? (
          <p role="alert" className="card text-xl">
            Sorry, we couldn&apos;t load your matches. Please refresh the page to try again.
          </p>
        ) : matches.length === 0 ? (
          <section className="card flex flex-col items-center gap-4 text-center">
            <p className="text-6xl" aria-hidden>
              💘
            </p>
            <p className="text-2xl font-bold">No matches yet</p>
            <p className="text-xl">Browse a few profiles and say hello to someone who catches your eye.</p>
            <Link href="/discover" className="btn-primary w-full text-xl">
              💘 Meet someone new
            </Link>
          </section>
        ) : (
          <ul className="flex flex-col gap-4">
            {matches.map(({ persona }) => {
              const isOpen = persona.id === openPersona?.id;
              const stage = stages.get(persona.id);
              const last = lastMessage.get(persona.id);
              return (
                <li
                  key={persona.id}
                  className={`card flex flex-col gap-4 ${isOpen ? "border-accent bg-accent-soft/40 ring-2 ring-accent" : ""}`}
                >
                  <div className="flex items-start gap-4">
                    <PartnerPhoto persona={persona} small decorative className="h-20 w-20 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <h2 className="text-2xl font-bold">
                          {persona.name}, {persona.age}
                        </h2>
                        {last && (
                          <time dateTime={last.created_at} className="text-base text-muted">
                            {timeFormat.format(new Date(last.created_at))}
                          </time>
                        )}
                      </div>
                      <p className="flex flex-wrap items-center gap-2 text-base">
                        {stage && (
                          <span className="rounded-full bg-white px-3 font-bold">
                            {stage.emoji} {stage.label}
                          </span>
                        )}
                        <span className="rounded-full bg-[#2a1a1f] px-2.5 py-0.5 text-base font-bold text-white">AI</span>
                        {isOpen && <span className="font-bold text-accent">• Open now</span>}
                      </p>
                      <p className="truncate text-lg text-muted">{preview(last, persona)}</p>
                    </div>
                  </div>
                  <OpenMatchButtons partnerId={persona.id} partnerName={persona.name} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
