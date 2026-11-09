import type { SupabaseClient } from "@supabase/supabase-js";
import { getPersona, type Persona } from "@/lib/personas";

/**
 * The partner a chat, call or reach-out request is about. Pages send the
 * partner they show (`requested`), because profiles.partner_id moves whenever
 * the user likes or opens someone else, possibly in another tab, while this
 * page or call is still open. A requested partner must be one the user matched
 * with. Without one (older clients), the open partner is used.
 * Returns null when the requested partner isn't a match; throws if the check
 * itself fails, so a database hiccup is a server error, not "not matched".
 */
export async function resolvePartner(
  supabase: SupabaseClient,
  userId: string,
  openPartnerId: string | null,
  requested: unknown,
): Promise<Persona | null> {
  if (typeof requested !== "string" || requested === openPartnerId) return getPersona(openPartnerId) ?? null;
  const persona = getPersona(requested);
  if (!persona) return null;
  const { data, error } = await supabase
    .from("matches")
    .select("id")
    .eq("user_id", userId)
    .eq("partner_id", persona.id)
    .eq("status", "matched")
    .maybeSingle();
  if (error) throw new Error(`Checking the match failed: ${error.message}`);
  return data ? persona : null;
}

/** Reads `partnerId` from a JSON body that may be missing or malformed. */
export function requestedPartnerId(body: unknown): string | undefined {
  if (body && typeof body === "object" && "partnerId" in body) {
    const id = (body as { partnerId: unknown }).partnerId;
    if (typeof id === "string") return id;
  }
  return undefined;
}

/**
 * Call transcripts are stored as "You: <user>\n<Partner>: <partner>" lines,
 * where "You" is the user. Relabels the user's lines with their name so both
 * speakers are named and the partner's model never reads the user's words as its own.
 */
export function relabelCallTranscript(content: string, userName: string): string {
  return content
    .split("\n")
    .map((line) => (line.startsWith("You: ") ? `${userName}: ${line.slice(5)}` : line))
    .join("\n");
}
