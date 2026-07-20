/**
 * Splits a character message into separate SMS-style bubbles.
 * Handles sentence boundaries, line breaks, and em-dash / semicolon breaks.
 */
export function splitCharacterMessageParts(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const newlineParts = trimmed
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (newlineParts.length > 1) {
    return newlineParts.flatMap((part) => splitSentences(part));
  }

  const sentenceParts = splitSentences(trimmed);
  if (sentenceParts.length > 1) {
    return sentenceParts;
  }

  const dashParts = trimmed
    .split(/\s*(?:—|--|;)\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (dashParts.length > 1) {
    return dashParts;
  }

  return [trimmed];
}

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const matches = normalized.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);

  if (!matches) {
    return [normalized];
  }

  const parts = matches.map((part) => part.trim()).filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [normalized];
}
