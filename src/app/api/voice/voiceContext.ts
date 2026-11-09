import { getSession } from "@/lib/supabase/server";
import { getPersona } from "@/lib/personas";
import { getRelevantMemories } from "@/lib/memories";
import { currentItem, getOrCreateSchedule } from "@/lib/schedule";
import { buildPersonaPrompt } from "@/lib/prompt";
import { getStage } from "@/lib/relationship";
import { simNow } from "@/lib/simtime";

export const ELEVENLABS_API = "https://api.elevenlabs.io";

/** Signed-in, onboarded user with their partner, or null. */
export async function loadVoiceUser() {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return null;
  const persona = getPersona(profile.partner_id);
  if (!persona) return null;
  return { supabase, user, profile, persona, now: simNow(profile) };
}

export type VoiceUser = NonNullable<Awaited<ReturnType<typeof loadVoiceUser>>>;

/**
 * Builds the shared persona prompt for the voice channel, with memories picked
 * against the last few messages so the call continues where the chat left off,
 * and the relationship stage so the call is as close as the chat.
 */
export async function buildVoicePrompt(ctx: VoiceUser) {
  const { supabase, user, profile, persona, now } = ctx;
  const { data: recent } = await supabase
    .from("messages")
    .select("content")
    .eq("user_id", user.id)
    .eq("partner_id", persona.id)
    .order("created_at", { ascending: false })
    .limit(6);
  const recentText = (recent ?? []).map((m) => m.content as string).join("\n");

  const [schedule, memories, { stage }] = await Promise.all([
    getOrCreateSchedule(supabase, user.id, persona, now.date, now.weekday),
    getRelevantMemories(supabase, user.id, persona.id, recentText, now.date),
    getStage(supabase, user.id, persona.id),
  ]);
  const prompt = buildPersonaPrompt({
    persona,
    profile,
    memories,
    simDate: now.date,
    weekday: now.weekday,
    time: now.time,
    nowActivity: currentItem(schedule, now.time),
    channel: "voice",
    stage,
  });
  return { prompt, memories };
}
