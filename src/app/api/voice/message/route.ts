import { generateText } from "@/lib/claude";
import { buildVoicePrompt, ELEVENLABS_API, loadVoiceUser } from "../voiceContext";

async function synthesize(text: string, voiceId: string): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: "eleven_v4" }),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      console.error("ElevenLabs TTS failed", res.status, await res.text());
      return null;
    }
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch (error) {
    console.error("ElevenLabs TTS error", error);
    return null;
  }
}

/**
 * POST /api/voice/message — when a call can't connect, the partner leaves a
 * short voice message instead. Returns { text, audio } where audio is a
 * base64 MP3, or null if speech synthesis failed (the text is still shown).
 */
export async function POST() {
  const ctx = await loadVoiceUser();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { supabase, user, profile, persona, now } = ctx;
  const { prompt } = await buildVoicePrompt(ctx);

  let text = "";
  try {
    text = await generateText({
      system: prompt,
      messages: [
        {
          role: "user",
          content: `(You tried to phone ${profile.name} but the call didn't connect, so you are leaving a voice message. Speak 2-3 short, warm sentences: greet them by name, follow up on one thing you remember about them if there is one, and say you'd love to talk soon. Plain spoken words only — no emojis, no stage directions, no sound effects.)`,
        },
      ],
      maxTokens: 300,
    });
  } catch (error) {
    console.error("Voice message generation failed", error);
  }
  if (!text) {
    text = `Hi ${profile.name}, it's ${persona.name}. I tried to give you a call but couldn't get through. I hope you're having a nice day, and I'd love to talk again soon.`;
  }

  const [audio, { error }] = await Promise.all([
    synthesize(text, persona.voiceId),
    supabase.from("messages").insert({
      user_id: user.id,
      partner_id: persona.id,
      role: "partner",
      kind: "voice_message",
      content: text,
      sim_date: now.date,
    }),
  ]);
  if (error) console.error("Saving voice message failed", error);

  return Response.json({ text, audio });
}
