import { z } from "zod";
import { extractAndStoreMemories } from "@/lib/memories";
import { loadVoiceUser } from "../voiceContext";

const BodySchema = z.object({
  transcript: z
    .array(z.object({ role: z.enum(["user", "partner"]), text: z.string().trim().max(4000) }))
    .max(500),
});

/**
 * POST /api/voice/transcript — saves a finished call as one "call" message
 * and remembers anything new the user mentioned.
 */
export async function POST(request: Request) {
  const ctx = await loadVoiceUser();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const lines = parsed.data.transcript.filter((l) => l.text.length > 0);
  if (lines.length === 0) return Response.json({ saved: false });

  const { supabase, user, profile, persona, now } = ctx;
  const content = lines.map((l) => `${l.role === "user" ? "You" : persona.name}: ${l.text}`).join("\n");

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      partner_id: persona.id,
      role: "partner",
      kind: "call",
      content,
      sim_date: now.date,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Saving call transcript failed", error);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }

  const userSide = lines.filter((l) => l.role === "user").map((l) => l.text);
  if (userSide.length > 0) {
    try {
      await extractAndStoreMemories({
        supabase,
        userId: user.id,
        partnerId: persona.id,
        userName: profile.name,
        userMessage: userSide.join("\n"),
        partnerReply: lines.filter((l) => l.role === "partner").map((l) => l.text).join("\n"),
        simDate: now.date,
        weekday: now.weekday,
        sourceMessageId: message.id as string,
      });
    } catch (err) {
      console.error("Memory extraction after call failed", err);
    }
  }

  return Response.json({ saved: true, messageId: message.id });
}
