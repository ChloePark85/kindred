import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ReachOutButton } from "@/components/ReachOutButton";
import { currentItem, getOrCreateSchedule } from "@/lib/schedule";
import { requireOnboarded } from "@/lib/session";
import { simNow } from "@/lib/simtime";
import type { Message } from "@/lib/types";
import { awaitingDelayedReply, partnerStatus } from "./chat-helpers";

export const metadata: Metadata = {
  title: "Chat — SeniorChat",
};

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-10 text-xl">Opening your chat…</p>}>
      <ChatContent />
    </Suspense>
  );
}

async function ChatContent() {
  const { supabase, user, profile, persona } = await requireOnboarded();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("user_id", user.id)
    .eq("partner_id", persona.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const messages = ((data ?? []) as Message[]).reverse();

  let status: string | null = null;
  try {
    const sim = simNow(profile);
    const schedule = await getOrCreateSchedule(supabase, user.id, persona, sim.date, sim.weekday);
    status = partnerStatus(persona, currentItem(schedule, sim.time));
  } catch (e) {
    console.error("Could not load partner schedule", e);
  }

  return (
    <>
      <AppHeader persona={persona} active="/chat" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-4 text-lg">
        {error ? (
          <p role="alert" className="card text-xl">
            Sorry, we couldn&apos;t load your conversation. Please refresh the page to try again.
          </p>
        ) : (
          <ChatWindow
            persona={persona}
            initialMessages={messages}
            initialStatus={status}
            initialAwaiting={awaitingDelayedReply(messages)}
            reachOut={<ReachOutButton partnerName={persona.name} />}
          />
        )}
      </main>
    </>
  );
}
