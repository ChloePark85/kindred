import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO, isDemo } from "@/lib/demo";
import { stageProgress } from "@/lib/relationship";

/**
 * Server-side closeness: how far the relationship with a partner has come.
 * (Kept apart from relationship.ts, which the chat screen also loads in the browser.)
 */

export async function getClosenessPoints(supabase: SupabaseClient, userId: string, partnerId: string) {
  const [{ count: userMessages }, { count: calls }] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("partner_id", partnerId)
      .eq("role", "user"),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("partner_id", partnerId)
      .eq("kind", "call"),
  ]);
  return (userMessages ?? 0) + (calls ?? 0) * 5;
}

/**
 * The relationship stage with a partner, plus how many more chats reach the next one.
 * Demo mode counts points faster, so a stage-up fits in a short demo.
 */
export async function getStage(supabase: SupabaseClient, userId: string, partnerId: string) {
  const [raw, demo] = await Promise.all([getClosenessPoints(supabase, userId, partnerId), isDemo()]);
  const multiplier = demo ? DEMO.closenessMultiplier : 1;
  const points = raw * multiplier;
  const result = stageProgress(points);
  return { ...result, chatsToNext: result.next ? Math.ceil((result.next.min - points) / multiplier) : 0 };
}
