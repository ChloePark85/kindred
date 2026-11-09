import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/onboarding { name, age_range, seeking, interests, timezone } -> { ok: true }
 * Creates or updates the signed-in (anonymous) user's profile. Keeps partner_id and day_offset.
 */

const AGE_RANGES = ["50–59", "60–69", "70–79", "80+"] as const;

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  age_range: z.enum(AGE_RANGES),
  seeking: z.enum(["men", "women", "anyone"]),
  interests: z.array(z.string().trim().min(1).max(60)).max(20),
  timezone: z.string().max(64),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Please tell us your first name, your age range and who you'd like to meet." }, { status: 400 });
  }
  const { name, age_range, seeking, interests, timezone } = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Sorry, something went wrong. Please try again." }, { status: 401 });

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        name,
        age_range,
        seeking,
        interests: [...new Set(interests)],
        timezone: isTimeZone(timezone) ? timezone : "UTC",
      },
      { onConflict: "id" },
    );
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Saving profile failed", e);
    return Response.json({ error: "Sorry, something went wrong. Please try again." }, { status: 500 });
  }
}
