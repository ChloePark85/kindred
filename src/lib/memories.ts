import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson } from "@/lib/claude";
import type { Memory } from "@/lib/types";

const STOPWORDS = new Set(
  "the a an and or but i me my you your we our it is was are be to of in on at for with that this have has had do did not so just about from".split(" "),
);

function keywords(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Picks the memories most worth bringing up next: keyword overlap with the
 * current conversation, upcoming/recent dated events, importance and recency.
 */
export async function getRelevantMemories(
  supabase: SupabaseClient,
  userId: string,
  partnerId: string,
  context: string,
  simDate: string,
  limit = 8,
): Promise<Memory[]> {
  const { data } = await supabase
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(200);
  const memories = (data ?? []) as Memory[];
  const ctx = keywords(context);
  const today = Date.parse(simDate);

  const scored = memories.map((m, i) => {
    let score = m.importance;
    for (const w of keywords(m.content)) if (ctx.has(w)) score += 2;
    if (m.event_date) {
      const days = Math.abs(Date.parse(m.event_date) - today) / 86_400_000;
      if (days <= 2) score += 4;
      else if (days <= 7) score += 1;
    }
    if (!m.followed_up && (m.category === "event" || m.category === "plan")) score += 1;
    score += Math.max(0, 2 - i * 0.1); // recency
    return { m, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.m);
}

export function formatMemoriesForPrompt(memories: Memory[]): string {
  if (memories.length === 0) return "(Nothing remembered yet — you are just getting to know them.)";
  return memories
    .map((m) => `- [${m.category}] ${m.content}${m.person_name ? ` (person: ${m.person_name}${m.relationship ? `, ${m.relationship}` : ""})` : ""}${m.event_date ? ` (date: ${m.event_date})` : ""}${m.followed_up ? " (already asked about)" : ""}`)
    .join("\n");
}

const ExtractionSchema = z.object({
  memories: z.array(
    z.object({
      category: z.enum(["event", "person", "feeling", "plan"]),
      content: z.string().describe("One short third-person sentence about the user, e.g. 'Has a doctor's appointment for knee pain on Thursday.'"),
      event_date: z.string().nullable().describe("YYYY-MM-DD if a specific date is stated or clearly implied, else null"),
      importance: z.number().int().min(1).max(3),
      person_name: z
        .string()
        .nullable()
        .describe("Name (or how the user refers to them, e.g. 'my sister') of a real person in the user's life this fact involves — family, friend, neighbor. Null if none. Never the companion."),
      relationship: z.string().nullable().describe("Their relationship to the user, e.g. 'daughter', 'neighbor', 'old friend'. Null if none."),
    }),
  ),
});

/**
 * Extracts memorable facts about the user from the latest exchange and stores
 * new ones in `memories`. Skips facts already stored.
 */
export async function extractAndStoreMemories(opts: {
  supabase: SupabaseClient;
  userId: string;
  partnerId: string;
  userName: string;
  userMessage: string;
  partnerReply: string;
  simDate: string;
  weekday: string;
  sourceMessageId: string | null;
}): Promise<Memory[]> {
  const { supabase, userId, partnerId } = opts;
  const { data: existing } = await supabase
    .from("memories")
    .select("content")
    .eq("user_id", userId)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(60);
  const known = (existing ?? []).map((m) => `- ${m.content}`).join("\n") || "(none)";

  const result = await generateJson({
    system:
      "You extract memorable personal facts about a user from a chat with their companion. Only extract things worth remembering and bringing up later: events (appointments, visits, outings), people in their life (names and relationships), feelings (worries, joys, loneliness), and plans. Ignore small talk and anything the companion said about itself. Never duplicate a known fact; return an empty list if nothing new.",
    prompt: `Today is ${opts.weekday}, ${opts.simDate}. The user's name is ${opts.userName}.

Already known:
${known}

Latest exchange:
${opts.userName}: ${opts.userMessage}
Companion: ${opts.partnerReply}

Return new memories only. Resolve relative dates like "Thursday" or "tomorrow" to YYYY-MM-DD. Tag every memory that involves a real person in the user's life (family, friends, neighbors) with person_name and relationship.`,
    schema: ExtractionSchema,
  });
  if (!result || result.memories.length === 0) return [];

  const rows = result.memories.map((m) => ({
    user_id: userId,
    partner_id: partnerId,
    category: m.category,
    content: m.content,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(m.event_date ?? "") ? m.event_date : null,
    importance: m.importance,
    person_name: m.person_name?.trim() || null,
    relationship: m.relationship?.trim() || null,
    source_message_id: opts.sourceMessageId,
    sim_date: opts.simDate,
  }));
  const { data } = await supabase.from("memories").insert(rows).select("*");
  return (data ?? []) as Memory[];
}
