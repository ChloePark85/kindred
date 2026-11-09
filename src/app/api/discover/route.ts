import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { z } from "zod";
import { generateText } from "@/lib/claude";
import { getPersona, type Persona } from "@/lib/personas";
import { buildPersonaPrompt } from "@/lib/prompt";
import { STAGES } from "@/lib/relationship";
import { currentItem, getOrCreateSchedule } from "@/lib/schedule";
import { simNow } from "@/lib/simtime";
import { getSession } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * POST   { partnerId, action: "like" | "pass" }
 *   like -> { match: { partnerId, matchedAt } }   (every like matches; the partner becomes the open one)
 *   pass -> { passed: { partnerId } }
 * DELETE -> { cleared: number }                   ("Start over": forgets passes, keeps matches)
 * Errors -> { error } with 400 / 401 / 500.
 */
const BodySchema = z.object({
  partnerId: z.string().min(1).max(64),
  action: z.enum(["like", "pass"]),
});

async function isConversationEmpty(supabase: SupabaseClient, userId: string, partnerId: string) {
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("partner_id", partnerId);
  return (count ?? 0) === 0;
}

/** The partner's first message after a new match, so the chat isn't empty. */
async function sendFirstGreeting(supabase: SupabaseClient, profile: Profile, persona: Persona) {
  if (!(await isConversationEmpty(supabase, profile.id, persona.id))) return;

  const sim = simNow(profile);
  const schedule = await getOrCreateSchedule(supabase, profile.id, persona, sim.date, sim.weekday);
  const system = buildPersonaPrompt({
    persona,
    profile,
    memories: [],
    simDate: sim.date,
    weekday: sim.weekday,
    time: sim.time,
    nowActivity: currentItem(schedule, sim.time),
    channel: "chat",
    stage: STAGES[0],
  });
  const text = await generateText({
    system,
    messages: [
      {
        role: "user",
        content: `(App instruction, not from ${profile.name}.) You and ${profile.name} just matched on SeniorChat. Write your very first message to them: greet them warmly by name, say you're glad you matched, mention one small thing from your profile or your day, and ask one easy question. 2-3 short sentences. Reply with the message text only.`,
      },
    ],
    maxTokens: 400,
  });
  if (!text) return;

  // The chat page greets empty conversations too; check again right before writing.
  if (!(await isConversationEmpty(supabase, profile.id, persona.id))) return;
  await supabase.from("messages").insert({
    user_id: profile.id,
    partner_id: persona.id,
    role: "partner",
    kind: "chat",
    content: text,
    sim_date: sim.date,
  });
}

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

  const greetingProfile = { ...profile, partner_id: persona.id } as Profile;
  after(async () => {
    try {
      await sendFirstGreeting(supabase, greetingProfile, persona);
    } catch (e) {
      console.error("Match greeting failed", e);
    }
  });

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
