import { z } from "zod";
import { getPersona } from "@/lib/personas";
import { getSession } from "@/lib/supabase/server";

/** POST /api/onboarding/partner { partnerId } -> { ok: true }. Sets profiles.partner_id. */

const Body = z.object({ partnerId: z.string() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  const persona = parsed.success ? getPersona(parsed.data.partnerId) : undefined;
  if (!persona) return Response.json({ error: "Please choose one of the partners." }, { status: 400 });

  try {
    const { supabase, user, profile } = await getSession();
    if (!user || !profile) {
      return Response.json({ error: "Please fill in the first page again.", restart: true }, { status: 401 });
    }
    const { error } = await supabase.from("profiles").update({ partner_id: persona.id }).eq("id", user.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Choosing partner failed", e);
    return Response.json({ error: "Sorry, something went wrong. Please try again." }, { status: 500 });
  }
}
