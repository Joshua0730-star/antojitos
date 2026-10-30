import OpenAI, { toFile } from 'openai';
import { IAudioTranscriptionService } from '../../application/ports/IAudioTranscriptionService.js';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TRANSCRIPTION_CHARS = 2_000;

export class OpenAIAudioTranscriptionService implements IAudioTranscriptionService {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model = 'whisper-1') {
    this.client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 0 });
  }

  async transcribe(mediaUrl: string, mimeType = 'audio/ogg'): Promise<string | null> {
    if (!mediaUrl) return null;
    try {
      const buffer = await this.toBuffer(mediaUrl);
      if (!buffer || buffer.byteLength === 0 || buffer.byteLength > MAX_AUDIO_BYTES) return null;
      const file = await toFile(buffer, `whatsapp-audio.${this.extension(mimeType)}`, { type: mimeType });
      const result = await this.client.audio.transcriptions.create({ file, model: this.model, response_format: 'text' });
      const text = typeof result === 'string' ? result : String(result);
      const normalized = text.replace(/\s+/g, ' ').trim();
      return normalized ? normalized.slice(0, MAX_TRANSCRIPTION_CHARS) : null;
    } catch (error) {
      console.warn('[audio] transcription unavailable', error instanceof Error ? error.name : 'unknown');
      return null;
    }
  }

  private async toBuffer(value: string): Promise<Buffer | null> {
    if (value.startsWith('data:')) {
      const comma = value.indexOf(',');
      if (comma < 0) return null;
      return Buffer.from(value.slice(comma + 1), 'base64');
    }
    if (!/^https?:\/\//i.test(value)) return null;
    const response = await fetch(value, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_AUDIO_BYTES) return null;
    const bytes = await response.arrayBuffer();
    return Buffer.from(bytes);
  }

  private extension(mimeType: string): string {
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('mpeg')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('webm')) return 'webm';
    return 'ogg';
  }
}
