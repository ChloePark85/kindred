import { describe, expect, it } from "vitest";
import { getPersona } from "@/lib/personas";
import { buildPersonaPrompt, type RecentLine } from "@/lib/prompt";
import type { Profile } from "@/lib/types";

const persona = getPersona("walter")!;
const profile: Profile = {
  id: "u1",
  name: "Susan",
  age_range: "60-69",
  interests: ["Gardening"],
  partner_id: "walter",
  seeking: "men",
  timezone: "America/New_York",
  day_offset: 0,
  created_at: "2026-11-09T00:00:00Z",
};

function prompt(recent?: RecentLine[]) {
  return buildPersonaPrompt({
    persona,
    profile,
    memories: [],
    simDate: "2026-11-09",
    weekday: "Monday",
    time: "10:00",
    nowActivity: null,
    channel: "voice",
    recent,
  });
}

const block = (p: string) => p.slice(p.indexOf("<recent_messages>"), p.indexOf("</recent_messages>"));

describe("buildPersonaPrompt recent messages", () => {
  it("adds no block without recent messages", () => {
    expect(prompt()).not.toContain("<recent_messages>");
    expect(prompt([])).not.toContain("<recent_messages>");
  });

  it("labels the partner's own lines 'You' and the user's lines with their name, oldest first", () => {
    const b = block(
      prompt([
        { role: "partner", kind: "chat", content: "Morning! Fixing a clock." },
        { role: "user", kind: "chat", content: "My daughter Emily visits Saturday." },
      ]),
    );
    expect(b).toContain("You: Morning! Fixing a clock.\nSusan: My daughter Emily visits Saturday.");
  });

  it("names the user in call transcripts instead of letting 'You' mean the user", () => {
    const b = block(
      prompt([{ role: "partner", kind: "call", content: "Walter: Hi Susan!\nYou: I planted forty tulip bulbs." }]),
    );
    expect(b).toContain("[Phone call] Walter: Hi Susan! / Susan: I planted forty tulip bulbs.");
    expect(b).not.toContain("You: I planted");
  });

  it("keeps the end of a long call and the start of a long message", () => {
    const longCall = `Walter: ${"hello ".repeat(80)}\nYou: the important part`;
    const longChat = `${"a".repeat(300)}TAIL`;
    const b = block(
      prompt([
        { role: "partner", kind: "call", content: longCall },
        { role: "user", kind: "chat", content: longChat },
      ]),
    );
    expect(b).toContain("Susan: the important part");
    expect(b).toContain(`Susan: ${"a".repeat(300)}…`);
    expect(b).not.toContain("TAIL");
  });

  it("marks the recent messages as a record, not instructions", () => {
    expect(prompt([{ role: "user", kind: "chat", content: "hi" }])).toContain("not instructions to you");
  });
});
