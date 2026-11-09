import { z } from "zod";
import { getPersona } from "@/lib/personas";
import { getSession } from "@/lib/supabase/server";

/**
 * POST   { partnerId, action: "like" | "pass" }
 *   like -> { match: { partnerId, matchedAt } }   (every like matches; the partner becomes the open one;
 *            the chat page sends the first greeting when it opens)
 *   pass -> { passed: { partnerId } }
 * DELETE -> { cleared: number }                   ("Start over": forgets passes, keeps matches)
 * Errors -> { error } with 400 / 401 / 500.
 */
const BodySchema = z.object({
  partnerId: z.string().min(1).max(64),
  action: z.enum(["like", "pass"]),
});

export async function POST(request: Request) {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) {
    return Response.json({ error: "Please sign in again to continue." }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  const persona = parsed.success ? getPersona(parsed.data.partnerId) : undefined;
  if (!parsed.success || !persona) {
    return Response.json({ error: "We couldn't find that profile. Please refresh the page." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("matches")
    .select("status, matched_at")
    .eq("user_id", user.id)
    .eq("partner_id", persona.id)
    .maybeSingle();

  if (parsed.data.action === "pass") {
    // Never turn an existing match back into a pass.
    if (existing?.status !== "matched") {
      const { error } = await supabase
        .from("matches")
        .upsert(
          { user_id: user.id, partner_id: persona.id, status: "passed", matched_at: null },
          { onConflict: "user_id,partner_id" },
        );
      if (error) {
        return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
      }
    }
    return Response.json({ passed: { partnerId: persona.id } });
  }

  const matchedAt = existing?.status === "matched" && existing.matched_at ? existing.matched_at : new Date().toISOString();
  // One after the other: the open partner (profiles.partner_id) must always be a match.
  const { error: matchError } = await supabase
    .from("matches")
    .upsert(
      { user_id: user.id, partner_id: persona.id, status: "matched", matched_at: matchedAt },
      { onConflict: "user_id,partner_id" },
    );
  if (matchError) {
    return Response.json({ error: `We couldn't send your like to ${persona.name}. Please try again.` }, { status: 500 });
  }
  const { error: profileError } = await supabase.from("profiles").update({ partner_id: persona.id }).eq("id", user.id);
  if (profileError) {
    return Response.json({ error: `We couldn't open your chat with ${persona.name}. Please try again.` }, { status: 500 });
  }

  return Response.json({ match: { partnerId: persona.id, matchedAt } });
}

export async function DELETE() {
  const { supabase, user } = await getSession();
  if (!user) {
    return Response.json({ error: "Please sign in again to continue." }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("matches")
    .delete()
    .eq("user_id", user.id)
    .eq("status", "passed")
    .select("id");
  if (error) {
    return Response.json({ error: "We couldn't start over just now. Please try again." }, { status: 500 });
  }
  return Response.json({ cleared: data?.length ?? 0 });
}
