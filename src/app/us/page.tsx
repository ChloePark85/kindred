import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { ConnectionsCard, weeklyConnections } from "@/components/us/ConnectionsCard";
import { MemoryTimeline } from "@/components/us/MemoryTimeline";
import { StageCard } from "@/components/us/StageCard";
import { getStage } from "@/lib/closeness";
import { requireOnboarded } from "@/lib/session";
import { simNow } from "@/lib/simtime";
import type { Memory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Us — SeniorChat",
};

export default function UsPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-10 text-xl">Opening your notes…</p>}>
      <UsContent />
    </Suspense>
  );
}

async function UsContent() {
  const { supabase, user, profile, persona } = await requireOnboarded();
  const [{ data, error }, { data: match }, closeness] = await Promise.all([
    supabase
      .from("memories")
      .select("*")
      .eq("user_id", user.id)
      .eq("partner_id", persona.id)
      .order("sim_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("matches")
      .select("matched_at")
      .eq("user_id", user.id)
      .eq("partner_id", persona.id)
      .eq("status", "matched")
      .maybeSingle(),
    getStage(supabase, user.id, persona.id),
  ]);
  const { stage, next, progress, chatsToNext } = closeness;
  const memories = (data ?? []) as Memory[];

  return (
    <>
      <AppHeader persona={persona} stage={stage} active="/us" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 text-lg">
        <h1 className="text-3xl font-bold">What {persona.name} remembers about you</h1>

        <StageCard
          partnerName={persona.name}
          stage={stage}
          next={next}
          progress={progress}
          pointsToNext={chatsToNext}
          matchedAt={(match?.matched_at as string | null | undefined) ?? null}
        />

        {!error && <ConnectionsCard people={weeklyConnections(memories, simNow(profile).date)} partnerName={persona.name} />}

        {error ? (
          <p role="alert" className="card text-xl">
            We couldn&apos;t load your notes just now. Please refresh the page to try again.
          </p>
        ) : memories.length === 0 ? (
          <section className="card flex flex-col gap-4">
            <p className="text-xl">
              {persona.name} hasn&apos;t written anything down yet. As you chat about your day, the people you love and
              your plans, {persona.name} will keep little notes here so they can ask you about them later.
            </p>
            <Link href="/chat" className="btn-primary self-start">
              💬 Start chatting with {persona.name}
            </Link>
          </section>
        ) : (
          <MemoryTimeline memories={memories} partnerName={persona.name} />
        )}

        <p className="mt-4 border-t-2 border-[#e8ddd0] pt-4 text-base text-muted">
          {persona.name} is an AI. These notes are stored in your account so {persona.name} can remember you.
        </p>
      </main>
    </>
  );
}
