import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptsLike, msUntil, sharedInterests, simInstant } from "@/lib/availability";
import { getPersona } from "@/lib/personas";
import type { Profile } from "@/lib/types";

/** A like still waiting for the partner, as the client shows it. */
export type PendingLike = {
  partnerId: string;
  /** Milliseconds until the partner answers (0 if due now). */
  waitMs: number;
  /** "10:30 AM" on the user's simulated clock, and whether that's on a later day. */
  answersAt: string;
  laterDay: boolean;
};

export type DecidedLike = { partnerId: string; status: "matched" | "declined" };

function clockOf(instantIso: string, profile: Pick<Profile, "timezone">) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: profile.timezone || "UTC" }).format(
    new Date(instantIso),
  );
}

function dayOf(instant: number, profile: Pick<Profile, "timezone">) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: profile.timezone || "UTC" }).format(new Date(instant));
}

/**
 * Lets partners answer the likes whose time has come (decide_at on the simulated
 * clock), and returns what was just decided plus what is still pending.
 * Each pending row is decided once: the update only applies while it is still pending.
 * A yes makes that partner the open one, as liking used to.
 */
export async function settleLikes(
  supabase: SupabaseClient,
  userId: string,
  profile: Pick<Profile, "day_offset" | "timezone" | "interests">,
  roll: () => number = Math.random,
): Promise<{ decided: DecidedLike[]; pending: PendingLike[] }> {
  const { data, error } = await supabase
    .from("matches")
    .select("partner_id, status, decide_at")
    .eq("user_id", userId)
    .in("status", ["pending", "matched"]);
  if (error) throw error;
  const rows = (data ?? []) as { partner_id: string; status: string; decide_at: string | null }[];

  let hasMatch = rows.some((r) => r.status === "matched");
  const decided: DecidedLike[] = [];
  const pending: PendingLike[] = [];
  const now = Date.now();
  const due = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => (a.decide_at ?? "").localeCompare(b.decide_at ?? ""));

  for (const row of due) {
    const persona = getPersona(row.partner_id);
    const waitMs = row.decide_at ? msUntil(profile, row.decide_at, now) : 0;
    if (!persona) continue;
    if (waitMs > 0) {
      pending.push({
        partnerId: persona.id,
        waitMs,
        answersAt: clockOf(row.decide_at!, profile),
        laterDay: dayOf(Date.parse(row.decide_at!), profile) !== dayOf(simInstant(profile, now), profile),
      });
      continue;
    }
    const yes = acceptsLike({ hasMatch, shared: sharedInterests(profile.interests ?? [], persona), roll: roll() });
    const status = yes ? "matched" : "declined";
    const { data: updated, error: updateError } = await supabase
      .from("matches")
      .update({ status, matched_at: yes ? new Date(now).toISOString() : null })
      .eq("user_id", userId)
      .eq("partner_id", persona.id)
      .eq("status", "pending")
      .select("partner_id");
    if (updateError) throw updateError;
    if (!updated?.length) continue; // decided by another request meanwhile
    if (yes) {
      hasMatch = true;
      const { error: openError } = await supabase.from("profiles").update({ partner_id: persona.id }).eq("id", userId);
      if (openError) throw openError;
    }
    decided.push({ partnerId: persona.id, status });
  }
  return { decided, pending };
}
