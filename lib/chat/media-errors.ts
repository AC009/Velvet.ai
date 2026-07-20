export type MediaProvider = "elevenlabs" | "fal" | "config";

export class MediaGenerationError extends Error {
  readonly provider: MediaProvider;

  constructor(message: string, provider: MediaProvider) {
    super(message);
    this.name = "MediaGenerationError";
    this.provider = provider;
  }
}

export function formatMediaErrorForClient(error: MediaGenerationError): string {
  return `[Media Pipeline · ${error.provider}] ${error.message}`;
}

export function isMediaGenerationError(error: unknown): error is MediaGenerationError {
  return error instanceof MediaGenerationError;
}
