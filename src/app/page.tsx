import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";

export default async function Home() {
  const { profile } = await getSession();
  if (!profile) redirect("/onboarding");
  if (!profile.partner_id) redirect("/onboarding/partner");
  redirect("/chat");
}
