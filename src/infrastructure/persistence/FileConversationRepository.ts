import fs from 'fs';
import path from 'path';
import {
  IConversationRepository,
  ConversationState,
  ChatMessage
} from '../../domain/repositories/IConversationRepository.js';

interface SerializedConversation {
  phoneNumber: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    imageUrl?: string;
    timestamp: string;
  }>;
  currentStep: number;
  currentOrderId?: string;
  coexistenceStatus?: 'BOT_ACTIVE' | 'HUMAN_TAKE-OVER' | 'COOLDOWN';
  lastHumanInteraction?: string;
  humanTakeoverStartedAt?: string;
  humanPauseUntil?: string;
  botPausedIndefinitely?: boolean;
  updatedAt: string;
}

export class FileConversationRepository implements IConversationRepository {
  private readonly filePath: string;

  constructor(storageDir: string = './data') {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.filePath = path.join(storageDir, 'conversations.json');
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2), 'utf-8');
    }
  }

  private readAll(): Record<string, SerializedConversation> {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, SerializedConversation>): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  public async getState(phoneNumber: string): Promise<ConversationState> {
    const all = this.readAll();
    const existing = all[phoneNumber];

    if (!existing) {
      return {
        phoneNumber,
        messages: [],
        currentStep: 1,
        coexistenceStatus: 'BOT_ACTIVE',
        updatedAt: new Date()
      };
    }

    return {
      phoneNumber: existing.phoneNumber,
      messages: existing.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp)
      })),
      currentStep: existing.currentStep,
      currentOrderId: existing.currentOrderId,
      coexistenceStatus: existing.coexistenceStatus || 'BOT_ACTIVE',
      lastHumanInteraction: existing.lastHumanInteraction ? new Date(existing.lastHumanInteraction) : undefined,
      humanTakeoverStartedAt: existing.humanTakeoverStartedAt ? new Date(existing.humanTakeoverStartedAt) : undefined,
      humanPauseUntil: existing.humanPauseUntil ? new Date(existing.humanPauseUntil) : undefined,
      botPausedIndefinitely: existing.botPausedIndefinitely,
      updatedAt: new Date(existing.updatedAt)
    };
  }

  public async saveState(state: ConversationState): Promise<void> {
    const all = this.readAll();
    all[state.phoneNumber] = {
      phoneNumber: state.phoneNumber,
      messages: state.messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString()
      })),
      currentStep: state.currentStep,
      currentOrderId: state.currentOrderId,
      coexistenceStatus: state.coexistenceStatus || 'BOT_ACTIVE',
      lastHumanInteraction: state.lastHumanInteraction ? state.lastHumanInteraction.toISOString() : undefined,
      humanTakeoverStartedAt: state.humanTakeoverStartedAt ? state.humanTakeoverStartedAt.toISOString() : undefined,
      humanPauseUntil: state.humanPauseUntil ? state.humanPauseUntil.toISOString() : undefined,
      botPausedIndefinitely: state.botPausedIndefinitely,
      updatedAt: state.updatedAt.toISOString()
    };
    this.writeAll(all);
  }

  public async addMessage(phoneNumber: string, message: ChatMessage): Promise<void> {
    const state = await this.getState(phoneNumber);
    state.messages.push(message);
    state.updatedAt = new Date();
    await this.saveState(state);
  }

  public async clearConversation(phoneNumber: string): Promise<void> {
    const all = this.readAll();
    delete all[phoneNumber];
    this.writeAll(all);
  }
}
