import type { MediaType } from "@/lib/types/database";

export interface MessageMediaFields {
  audio_url?: string | null;
  image_url?: string | null;
}

export function resolveMediaType(
  content: string,
  media?: MessageMediaFields | null,
): MediaType {
  const audioUrl = media?.audio_url?.trim() ?? "";
  const imageUrl = media?.image_url?.trim() ?? "";
  const hasAudio = audioUrl.length > 0;
  const hasImage = imageUrl.length > 0;
  const hasText = content.trim().length > 0 && content.trim() !== "·";

  const mediaCount = Number(hasAudio) + Number(hasImage) + Number(hasText);

  if (mediaCount >= 2) {
    return "mixed";
  }
  if (hasAudio) {
    return "audio";
  }
  if (hasImage) {
    return "image";
  }
  return "text";
}
