/**
 * Emojis read badly aloud; drop them from a chat message used as a spoken line,
 * with their skin-tone modifiers, joiners and variation selectors.
 */
export function forSpeech(text: string) {
  return text.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/\s{2,}/g, " ").trim();
}

/** Drops voice delivery tags like "[warm]" or "[laughs softly]" from spoken text. */
export function withoutVoiceTags(text: string) {
  return text.replace(/\[[a-z][a-z ,'-]{0,30}\]\s*/gi, "").replace(/\s{2,}/g, " ");
}
