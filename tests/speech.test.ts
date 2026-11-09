import { describe, expect, it } from "vitest";
import { forSpeech } from "@/lib/speech";

describe("forSpeech", () => {
  it.each([
    ["Good morning, Susan! ☀️ How did you sleep?", "Good morning, Susan! How did you sleep?"],
    ["Hi 👋🏽 José!", "Hi José!"],
    ["👨‍👩‍👧❤️", ""],
    ["a  ☀️  b", "a b"],
    ["Greetings from home 🇺🇸!", "Greetings from home !"],
    ["Crème brûlée at Zoë's café", "Crème brûlée at Zoë's café"],
  ])("%j -> %j", (input, expected) => {
    expect(forSpeech(input)).toBe(expected);
  });
});
