import { describe, expect, it } from "vitest";
import { forSpeech, withoutVoiceTags } from "@/lib/speech";

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

describe("withoutVoiceTags", () => {
  it.each([
    ["[warm] Ten o'clock, so you've got time.", "Ten o'clock, so you've got time."],
    ["[gentle] No, Susan. [laughs softly] I'm an AI.", "No, Susan. I'm an AI."],
    ["The [1920s] clock stays", "The [1920s] clock stays"],
  ])("%j -> %j", (input, expected) => expect(withoutVoiceTags(input).trim()).toBe(expected));
});
