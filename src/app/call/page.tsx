import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { CallScreen } from "@/components/call/CallScreen";
import { getStage } from "@/lib/closeness";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = {
  title: "Call — Kindred",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function CallPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-10 text-xl">Getting the phone ready…</p>}>
      <CallContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CallContent({ searchParams }: { searchParams: SearchParams }) {
  const [{ supabase, user, profile, persona }, params] = await Promise.all([requireOnboarded(), searchParams]);
  const { stage } = await getStage(supabase, user.id, persona.id);
  // ?incoming=1: the partner is calling the user (e.g. after "Next day").
  const incoming = params.incoming === "1";
  // A fresh id per ring, so a second call from the same partner starts ringing again
  // instead of reusing the preserved screen of the last one.
  const ringId = typeof params.ring === "string" ? params.ring : "";

  return (
    <>
      <AppHeader persona={persona} stage={stage} active="/call" />
      <main className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-3xl flex-1 flex-col px-3 py-3">
        <h1 className="sr-only">Call {persona.name}</h1>
        <CallScreen key={`${persona.id}:${incoming}:${ringId}`} persona={persona} userName={profile.name} incoming={incoming} />
      </main>
    </>
  );
}
