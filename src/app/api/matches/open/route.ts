import { z } from "zod";
import { getPersona } from "@/lib/personas";
import { getSession } from "@/lib/supabase/server";

/**
 * POST /api/matches/open { partnerId } -> { ok: true }
 * Makes a matched partner the open one (profiles.partner_id) for Chat, Call and Us.
 */

const Body = z.object({ partnerId: z.string() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  const persona = parsed.success ? getPersona(parsed.data.partnerId) : undefined;
  if (!persona) return Response.json({ error: "We couldn't find that person." }, { status: 400 });

  try {
    const { supabase, user, profile } = await getSession();
    if (!user || !profile) return Response.json({ error: "Please start again from the welcome page." }, { status: 401 });

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id")
      .eq("user_id", user.id)
      .eq("partner_id", persona.id)
      .eq("status", "matched")
      .maybeSingle();
    if (matchError) throw matchError;
    if (!match) return Response.json({ error: `You haven't matched with ${persona.name} yet.` }, { status: 403 });

    if (profile.partner_id !== persona.id) {
      const { error } = await supabase.from("profiles").update({ partner_id: persona.id }).eq("id", user.id);
      if (error) throw error;
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Opening match failed", e);
    return Response.json({ error: "Sorry, something went wrong. Please try again." }, { status: 500 });
  }
}
