import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { getPersona, type Persona } from "@/lib/personas";
import type { Profile } from "@/lib/types";

/** For pages that need a fully onboarded user; redirects otherwise. */
export async function requireOnboarded() {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) redirect("/onboarding");
  const persona = getPersona(profile.partner_id);
  if (!persona) redirect("/onboarding/partner");
  return { supabase, user, profile: profile as Profile, persona: persona as Persona };
}
