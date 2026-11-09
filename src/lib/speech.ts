/**
 * Emojis read badly aloud; drop them from a chat message used as a spoken line,
 * with their skin-tone modifiers, joiners and variation selectors.
 */
export function forSpeech(text: string) {
  return text.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/\s{2,}/g, " ").trim();
}
