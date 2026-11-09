import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const client = new Anthropic();

// Server-side refusal fallback: if a request is declined by a safety classifier,
// the API retries it on Anthropic's recommended fallback model in the same call.
const FALLBACK: Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

type Effort = "low" | "medium" | "high";

/** Single text reply. Returns "" if the model refused. */
export async function generateText(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens?: number;
  effort?: Effort;
}): Promise<string> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2000,
    system: opts.system,
    messages: opts.messages,
    output_config: { effort: opts.effort ?? "low" },
    ...FALLBACK,
  });
  const text =
    response.stop_reason === "refusal"
      ? ""
      : response.content
          .flatMap((b) => (b.type === "text" ? [b.text] : []))
          .join("")
          .trim();
  // Thinking counts toward max_tokens, so a tight cap can cut a reply short or leave it empty.
  if (!text || response.stop_reason === "max_tokens") {
    console.warn("Claude reply empty or cut short", { stop_reason: response.stop_reason, usage: response.usage });
  }
  return text;
}

/** Structured JSON output validated against a Zod schema. Returns null on refusal or parse failure. */
export async function generateJson<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
  effort?: Effort;
}): Promise<z.infer<T> | null> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
    ...FALLBACK,
  });
  if (response.stop_reason === "refusal") return null;
  return (response.parsed_output as z.infer<T> | null) ?? null;
}
