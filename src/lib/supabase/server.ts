import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/** Returns the signed-in user and their profile, or nulls. */
export async function getSession() {
  // Per-request data: tell Next not to prerender past here (supabase-js reads the clock).
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile: profile as import("@/lib/types").Profile | null };
}
