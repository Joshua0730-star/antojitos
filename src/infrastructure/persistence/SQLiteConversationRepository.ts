// src/infrastructure/persistence/SQLiteConversationRepository.ts
/*********************************************************************
 *  Repositorio basado en SQLite que implementa IConversationRepository
 *  Usa la tabla `conversations` creada por init-sqlite-db.ts
 *********************************************************************/

import Database from 'better-sqlite3';
import {
  IConversationRepository,
  ConversationState,
  ChatMessage,
} from '../../domain/repositories/IConversationRepository.js';
import { ENV } from '../config/env.js';
import path from 'path';
import fs from 'fs';

interface SQLiteConversationRow {
  phoneNumber: string;
  messages: string | null;
  currentStep: number;
  currentOrderId: string | null;
  coexistenceStatus: ConversationState['coexistenceStatus'] | null;
  lastHumanInteraction: string | null;
  humanTakeoverStartedAt: string | null;
  humanPauseUntil: string | null;
  botPausedIndefinitely: number | boolean;
  updatedAt: string;
}

export class SQLiteConversationRepository implements IConversationRepository {
  private readonly db: Database.Database;

  constructor(storagePath: string = process.env.DATABASE_PATH ?? './data/antojitos.db') {
    const fullPath = path.resolve(storagePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(fullPath);
  }

  private serializeMessages(messages: ChatMessage[]): string {
    return JSON.stringify(messages);
  }

  private deserializeMessages(raw: string): ChatMessage[] {
    return JSON.parse(raw).map((m: any) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  }

  public async getState(phoneNumber: string): Promise<ConversationState> {
    const row = this.db
      .prepare('SELECT * FROM conversations WHERE phoneNumber = ?')
      .get(phoneNumber) as SQLiteConversationRow | undefined;

    if (!row) {
      return {
        phoneNumber,
        messages: [],
        currentStep: 1,
        coexistenceStatus: 'BOT_ACTIVE',
        updatedAt: new Date(),
      };
    }

    return {
      phoneNumber: row.phoneNumber,
      messages: this.deserializeMessages(row.messages ?? '[]'),
      currentStep: row.currentStep,
      currentOrderId: row.currentOrderId ?? undefined,
      coexistenceStatus: (row.coexistenceStatus as any) ?? 'BOT_ACTIVE',
      lastHumanInteraction: row.lastHumanInteraction
        ? new Date(row.lastHumanInteraction)
        : undefined,
      humanTakeoverStartedAt: row.humanTakeoverStartedAt
        ? new Date(row.humanTakeoverStartedAt)
        : undefined,
      humanPauseUntil: row.humanPauseUntil ? new Date(row.humanPauseUntil) : undefined,
      botPausedIndefinitely: Boolean(row.botPausedIndefinitely),
      updatedAt: new Date(row.updatedAt),
    };
  }

  public async saveState(state: ConversationState): Promise<void> {
    const upsert = `
      INSERT INTO conversations (
        phoneNumber,
        messages,
        currentStep,
        currentOrderId,
        coexistenceStatus,
        lastHumanInteraction,
        humanTakeoverStartedAt,
        humanPauseUntil,
        botPausedIndefinitely,
        updatedAt
      ) VALUES (
        @phoneNumber,
        @messages,
        @currentStep,
        @currentOrderId,
        @coexistenceStatus,
        @lastHumanInteraction,
        @humanTakeoverStartedAt,
        @humanPauseUntil,
        @botPausedIndefinitely,
        @updatedAt
      )
      ON CONFLICT(phoneNumber) DO UPDATE SET
        messages = excluded.messages,
        currentStep = excluded.currentStep,
        currentOrderId = excluded.currentOrderId,
        coexistenceStatus = excluded.coexistenceStatus,
        lastHumanInteraction = excluded.lastHumanInteraction,
        humanTakeoverStartedAt = excluded.humanTakeoverStartedAt,
        humanPauseUntil = excluded.humanPauseUntil,
        botPausedIndefinitely = excluded.botPausedIndefinitely,
        updatedAt = excluded.updatedAt;
    `;

    this.db.prepare(upsert).run({
      phoneNumber: state.phoneNumber,
      messages: this.serializeMessages(state.messages),
      currentStep: state.currentStep,
      currentOrderId: state.currentOrderId ?? null,
      coexistenceStatus: state.coexistenceStatus ?? 'BOT_ACTIVE',
      lastHumanInteraction: state.lastHumanInteraction
        ? state.lastHumanInteraction.toISOString()
        : null,
      humanTakeoverStartedAt: state.humanTakeoverStartedAt
        ? state.humanTakeoverStartedAt.toISOString()
        : null,
      humanPauseUntil: state.humanPauseUntil ? state.humanPauseUntil.toISOString() : null,
      botPausedIndefinitely: state.botPausedIndefinitely ? 1 : 0,
      updatedAt: state.updatedAt.toISOString(),
    });
  }

  public async addMessage(phoneNumber: string, message: ChatMessage): Promise<void> {
    const state = await this.getState(phoneNumber);
    state.messages.push(message);
    state.updatedAt = new Date();
    await this.saveState(state);
  }

  public async clearConversation(phoneNumber: string): Promise<void> {
    this.db.prepare('DELETE FROM conversations WHERE phoneNumber = ?').run(phoneNumber);
  }
}
