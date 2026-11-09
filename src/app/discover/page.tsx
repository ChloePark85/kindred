import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { DiscoverDeck } from "@/components/discover/DiscoverDeck";
import { isDemo } from "@/lib/demo";
import { settleLikes } from "@/lib/likes";
import { getPersona, personasFor } from "@/lib/personas";
import { getStage } from "@/lib/closeness";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = {
  title: "Meet — Kindred",
};

export default function DiscoverPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-10 text-xl">Finding people for you…</p>}>
      <DiscoverContent />
    </Suspense>
  );
}

async function DiscoverContent() {
  const { supabase, user, profile, persona: openPersona } = await requireProfile();
  // Partners whose time has come answer the user's likes now.
  const { decided, pending } = await settleLikes(supabase, user.id, profile, { demo: await isDemo() });
  const lastYes = decided.findLast((d) => d.status === "matched");
  const persona = lastYes ? (getPersona(lastYes.partnerId) ?? openPersona) : openPersona;
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
        <DiscoverDeck
          key={deckIds.join(",")}
          initialDeck={deckIds}
          userName={profile.name}
          initialPending={pending}
          initialDecided={decided}
        />
      </main>
    </>
  );
}
