import { generateText } from "@/lib/claude";
import { buildVoicePrompt, ELEVENLABS_API, loadVoiceUser } from "../voiceContext";

async function fetchSignedUrl(agentId: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${ELEVENLABS_API}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store" },
    );
    if (!res.ok) {
      console.error("ElevenLabs signed URL failed", res.status, await res.text());
      return null;
    }
    const body = (await res.json()) as { signed_url?: string };
    return body.signed_url ?? null;
  } catch (error) {
    console.error("ElevenLabs signed URL error", error);
    return null;
  }
}

/** Emojis read badly aloud; drop them from a chat message used as a spoken line. */
function forSpeech(text: string) {
  return text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * POST /api/voice/session — everything the browser needs to start a call:
 * a signed ElevenLabs URL plus the persona prompt, opening line and voice to
 * pass as conversation overrides. Body `{ incoming: true }` means the partner
 * is the one calling: their latest "reach out" message today becomes the
 * opening line.
 */
export async function POST(request: Request) {
  const ctx = await loadVoiceUser();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { incoming?: unknown } | null;
  const incoming = body?.incoming === true;

  const { supabase, user, persona, profile, now } = ctx;
  const fallbackGreeting = `Hi ${profile.name}! It's ${persona.name} — so nice to hear your voice.`;

  const [signedUrl, { prompt, memories }] = await Promise.all([
    fetchSignedUrl(agentId, apiKey),
    buildVoicePrompt(ctx),
  ]);
  if (!signedUrl) return Response.json({ error: "signed_url_failed" }, { status: 502 });

  let firstMessage = fallbackGreeting;
  if (incoming) {
    const { data: reachOut } = await supabase
      .from("messages")
      .select("content")
      .eq("user_id", user.id)
      .eq("partner_id", persona.id)
      .eq("kind", "reach_out")
      .eq("sim_date", now.date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const line = reachOut ? forSpeech(reachOut.content as string) : "";
    if (line) return Response.json({ signedUrl, prompt, firstMessage: line, voiceId: persona.voiceId });
  }
  if (memories.length > 0) {
    try {
      const line = await generateText({
        system: prompt,
        messages: [
          {
            role: "user",
            content: `(${profile.name} just picked up your phone call. Say your opening line: greet them by name and, if it fits, warmly ask about one thing you remember. One or two short spoken sentences, no emojis, no stage directions.)`,
          },
        ],
        maxTokens: 200,
      });
      if (line) firstMessage = line;
    } catch (error) {
      console.error("Opening line generation failed", error);
    }
  }

  return Response.json({ signedUrl, prompt, firstMessage, voiceId: persona.voiceId });
}
