import { getSession } from "@/lib/supabase/server";
import { resolvePartner } from "@/lib/partner";
import { getRelevantMemories } from "@/lib/memories";
import { currentItem, getOrCreateSchedule } from "@/lib/schedule";
import { buildPersonaPrompt, getRecentLines } from "@/lib/prompt";
import { getStage } from "@/lib/relationship";
import { simNow } from "@/lib/simtime";

export const ELEVENLABS_API = "https://api.elevenlabs.io";

/**
 * Signed-in, onboarded user with the partner the page shows (`requestedPartnerId`,
 * which must be a match) or, without one, the open partner. Null otherwise.
 */
export async function loadVoiceUser(requestedPartnerId?: string) {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) return null;
  const persona = await resolvePartner(supabase, user.id, profile.partner_id, requestedPartnerId);
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
  const recent = await getRecentLines(supabase, user.id, persona.id);
  const recentText = recent.map((m) => m.content).join("\n");

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
    recent,
  });
  return { prompt, memories };
}
