import { z } from "zod";
import { availability, likeDecisionMinutes, simInstantIn } from "@/lib/availability";
import { DEMO, isDemo } from "@/lib/demo";
import { settleLikes } from "@/lib/likes";
import { getPersona } from "@/lib/personas";
import { getOrCreateSchedule } from "@/lib/schedule";
import { simNow } from "@/lib/simtime";
import { getSession } from "@/lib/supabase/server";

/**
 * Partners answer likes in their own time, and not always with a yes.
 *
 * POST   { partnerId, action: "like" | "pass" }
 *   like -> { pending: PendingLike } once sent (or { match } if already matched, { declined } if already declined).
 *           The partner looks at it when free (soon if free now, after a busy block, or in the morning).
 *   pass -> { passed: { partnerId } }
 * GET    -> { decided: DecidedLike[], pending: PendingLike[] }   answers that just came in, and likes still waiting
 * PUT    -> skip ahead a day on the simulated clock (for likes waiting overnight), then same as GET
 * DELETE -> { cleared: number }                              ("Start over": forgets passes, keeps everything else)
 * Errors -> { error } with 400 / 401 / 500.
 */
const BodySchema = z.object({
  partnerId: z.string().min(1).max(64),
  action: z.enum(["like", "pass"]),
});

const SIGN_IN_AGAIN = "Please sign in again to continue.";

export async function POST(request: Request) {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) {
    return Response.json({ error: SIGN_IN_AGAIN }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  const persona = parsed.success ? getPersona(parsed.data.partnerId) : undefined;
  if (!parsed.success || !persona) {
    return Response.json({ error: "We couldn't find that profile. Please refresh the page." }, { status: 400 });
  }

  const { data: rows, error: loadError } = await supabase
    .from("matches")
    .select("partner_id, status, matched_at")
    .eq("user_id", user.id)
    .in("status", ["pending", "matched", "declined"]);
  if (loadError) {
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  const existing = rows?.find((r) => r.partner_id === persona.id);

  if (parsed.data.action === "pass") {
    // Never turn a like, a match or an answer back into a pass.
    if (!existing) {
      const { error } = await supabase
        .from("matches")
        .upsert(
          { user_id: user.id, partner_id: persona.id, status: "passed", matched_at: null, decide_at: null },
          { onConflict: "user_id,partner_id" },
        );
      if (error) {
        return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
      }
    }
    return Response.json({ passed: { partnerId: persona.id } });
  }

  if (existing?.status === "matched") return Response.json({ match: { partnerId: persona.id, matchedAt: existing.matched_at } });
  if (existing?.status === "declined") return Response.json({ declined: { partnerId: persona.id } });

  if (existing?.status !== "pending") {
    // The partner looks at the like when they're free: soon, after their current busy block, or in the morning.
    // (Demo mode: a few seconds, whatever their day looks like.)
    const firstLike = !rows?.some((r) => r.status === "matched" || r.status === "pending");
    let minutes: number = DEMO.likeMinutes;
    if (!(await isDemo())) {
      const sim = simNow(profile);
      const schedule = await getOrCreateSchedule(supabase, user.id, persona, sim.date, sim.weekday);
      minutes = likeDecisionMinutes(availability(schedule, sim.time), firstLike, Math.random());
    }
    const { error } = await supabase
      .from("matches")
      .upsert(
        {
          user_id: user.id,
          partner_id: persona.id,
          status: "pending",
          matched_at: null,
          decide_at: simInstantIn(profile, minutes),
        },
        { onConflict: "user_id,partner_id" },
      );
    if (error) {
      return Response.json({ error: `We couldn't send your like to ${persona.name}. Please try again.` }, { status: 500 });
    }
  }

  const { pending, decided } = await settleLikes(supabase, user.id, profile, { demo: await isDemo() });
  const mine = pending.find((p) => p.partnerId === persona.id);
  return Response.json({ pending: mine ?? null, decided });
}

export async function GET() {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return Response.json({ error: SIGN_IN_AGAIN }, { status: 401 });
  try {
    return Response.json(await settleLikes(supabase, user.id, profile, { demo: await isDemo() }));
  } catch (e) {
    console.error("Settling likes failed", e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function PUT() {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return Response.json({ error: SIGN_IN_AGAIN }, { status: 401 });
  // Conditional update so a double click can't skip two days at once.
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ day_offset: profile.day_offset + 1 })
    .eq("id", user.id)
    .eq("day_offset", profile.day_offset)
    .select("*")
    .maybeSingle();
  if (error) return Response.json({ error: "We couldn't move to the next day. Please try again." }, { status: 500 });
  try {
    return Response.json(await settleLikes(supabase, user.id, updated ?? profile, { demo: await isDemo() }));
  } catch (e) {
    console.error("Settling likes failed", e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function DELETE() {
  const { supabase, user } = await getSession();
  if (!user) {
    return Response.json({ error: SIGN_IN_AGAIN }, { status: 401 });
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
