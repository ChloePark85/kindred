import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { DiscoverDeck } from "@/components/discover/DiscoverDeck";
import { personasFor } from "@/lib/personas";
import { getStage } from "@/lib/relationship";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = {
  title: "Meet — SeniorChat",
};

export default function DiscoverPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-10 text-xl">Finding people for you…</p>}>
      <DiscoverContent />
    </Suspense>
  );
}

async function DiscoverContent() {
  const { supabase, user, profile, persona } = await requireProfile();
  const [{ data: seen }, stage] = await Promise.all([
    supabase.from("matches").select("partner_id").eq("user_id", user.id),
    persona ? getStage(supabase, user.id, persona.id) : null,
  ]);
  const seenIds = new Set((seen ?? []).map((m) => m.partner_id as string));
  const deckIds = personasFor(profile.seeking)
    .filter((p) => !seenIds.has(p.id))
    .map((p) => p.id);

  return (
    <>
      <AppHeader persona={persona} stage={stage?.stage} active="/discover" />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-4 text-lg">
        <h1 className="sr-only">Meet new people</h1>
        {/* Remount when the server deck changes (e.g. after "Start over"). */}
        <DiscoverDeck key={deckIds.join(",")} initialDeck={deckIds} userName={profile.name} />
      </main>
    </>
  );
}
