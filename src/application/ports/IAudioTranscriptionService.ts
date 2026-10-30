export interface IAudioTranscriptionService {
  /** Returns a short transcription or null when audio cannot be processed safely. */
  transcribe(mediaUrl: string, mimeType?: string): Promise<string | null>;
}
