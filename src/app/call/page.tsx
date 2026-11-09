import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { CallScreen } from "@/components/call/CallScreen";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = {
  title: "Call — SeniorChat",
};

export default function CallPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-10 text-xl">Getting the phone ready…</p>}>
      <CallContent />
    </Suspense>
  );
}

async function CallContent() {
  const { profile, persona } = await requireOnboarded();
  return (
    <>
      <AppHeader persona={persona} active="/call" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
        <h1 className="text-3xl font-bold">Call {persona.name}</h1>
        <CallScreen partnerName={persona.name} userName={profile.name} />
      </main>
    </>
  );
}
