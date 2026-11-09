import { Suspense } from "react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ReachOutButton } from "@/components/ReachOutButton";
import { getStage } from "@/lib/closeness";
import { currentItem, getOrCreateSchedule } from "@/lib/schedule";
import { requireOnboarded } from "@/lib/session";
import { simNow } from "@/lib/simtime";
import type { Message } from "@/lib/types";
import { awaitingDelayedReply, partnerStatus } from "./chat-helpers";

export const metadata: Metadata = {
  title: "Chat — SeniorChat",
};

const HISTORY_LIMIT = 100;

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-10 text-xl">Opening your chat…</p>}>
      <ChatContent />
    </Suspense>
  );
}

async function ChatContent() {
  const { supabase, user, profile, persona } = await requireOnboarded();

  const [{ data, error }, { data: match }, { stage }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("partner_id", persona.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("matches")
      .select("matched_at, created_at")
      .eq("user_id", user.id)
      .eq("partner_id", persona.id)
      .eq("status", "matched")
      .maybeSingle(),
    getStage(supabase, user.id, persona.id),
  ]);
  const messages = ((data ?? []) as Message[]).reverse();
  const matchRow = match as { matched_at: string | null; created_at: string } | null;
  const matchedAt = matchRow?.matched_at ?? matchRow?.created_at;
  const matchedOn = matchedAt
    ? new Date(matchedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: profile.timezone || "UTC" })
    : null;

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
      <AppHeader persona={persona} stage={stage} active="/chat" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-4 text-lg">
        {error ? (
          <p role="alert" className="card text-xl">
            Sorry, we couldn&apos;t load your conversation. Please refresh the page to try again.
          </p>
        ) : (
          <ChatWindow
            key={persona.id}
            persona={persona}
            initialMessages={messages}
            initialStatus={status}
            initialAwaiting={awaitingDelayedReply(messages)}
            initialStage={{ id: stage.id, label: stage.label, emoji: stage.emoji }}
            matchedOn={matchedOn}
            showsStart={messages.length < HISTORY_LIMIT}
            reachOut={<ReachOutButton partnerId={persona.id} partnerName={persona.name} />}
          />
        )}
      </main>
    </>
  );
}
