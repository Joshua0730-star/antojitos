import { Pool } from 'pg';
import { normalizeContactIdentity } from '../../application/utils/contactIdentity.js';
import {
  ChatMessage,
  ConversationState,
  IConversationRepository
} from '../../domain/repositories/IConversationRepository.js';

type ConversationRow = {
  phone_number: string;
  messages: ChatMessage[];
  current_step: number;
  current_order_id: string | null;
  coexistence_status: ConversationState['coexistenceStatus'];
  last_human_interaction: Date | null;
  human_takeover_started_at: Date | null;
  human_pause_until: Date | null;
  bot_paused_indefinitely: boolean;
  fsm_session: ConversationState['fsmSession'] | null;
  updated_at: Date;
};

function toState(row: ConversationRow): ConversationState {
  return {
    phoneNumber: row.phone_number,
    messages: row.messages.map(message => ({ ...message, timestamp: new Date(message.timestamp) })),
    currentStep: row.current_step,
    currentOrderId: row.current_order_id ?? undefined,
    coexistenceStatus: row.coexistence_status || 'BOT_ACTIVE',
    lastHumanInteraction: row.last_human_interaction ? new Date(row.last_human_interaction) : undefined,
    humanTakeoverStartedAt: row.human_takeover_started_at ? new Date(row.human_takeover_started_at) : undefined,
    humanPauseUntil: row.human_pause_until ? new Date(row.human_pause_until) : undefined,
    botPausedIndefinitely: row.bot_paused_indefinitely,
    fsmSession: row.fsm_session ?? undefined,
    updatedAt: new Date(row.updated_at)
  };
}

export class PostgresConversationRepository implements IConversationRepository {
  constructor(private readonly db: Pool) {}

  async getState(phoneNumber: string): Promise<ConversationState> {
    phoneNumber = normalizeContactIdentity(phoneNumber);
    const result = await this.db.query<ConversationRow>(
      'SELECT * FROM bot_conversations WHERE phone_number = $1', [phoneNumber]
    );
    const row = result.rows[0];
    if (row) return toState(row);

    return {
      phoneNumber,
      messages: [],
      currentStep: 1,
      coexistenceStatus: 'BOT_ACTIVE',
      updatedAt: new Date()
    };
  }

  async saveState(state: ConversationState): Promise<void> {
    state = { ...state, phoneNumber: normalizeContactIdentity(state.phoneNumber) };
    const messages = state.messages.map(message => ({
      ...message,
      timestamp: message.timestamp.toISOString()
    }));
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Advisory transaction locks coordinate state writes across Cloud Run
      // replicas without holding a connection-level lock after COMMIT.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [state.phoneNumber]);
      await client.query(
        `INSERT INTO bot_conversations (
          phone_number, messages, current_step, current_order_id, coexistence_status,
          last_human_interaction, human_takeover_started_at, human_pause_until, bot_paused_indefinitely, updated_at, fsm_session
        ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        ON CONFLICT (phone_number) DO UPDATE SET
          messages = EXCLUDED.messages,
          current_step = EXCLUDED.current_step,
          current_order_id = EXCLUDED.current_order_id,
          coexistence_status = EXCLUDED.coexistence_status,
          last_human_interaction = EXCLUDED.last_human_interaction,
          human_takeover_started_at = EXCLUDED.human_takeover_started_at,
          human_pause_until = EXCLUDED.human_pause_until,
          bot_paused_indefinitely = EXCLUDED.bot_paused_indefinitely,
          fsm_session = EXCLUDED.fsm_session,
          updated_at = EXCLUDED.updated_at`,
        [
          state.phoneNumber,
          JSON.stringify(messages),
          state.currentStep,
          state.currentOrderId ?? null,
          state.coexistenceStatus ?? 'BOT_ACTIVE',
          state.lastHumanInteraction ?? null,
          state.humanTakeoverStartedAt ?? null,
          state.humanPauseUntil ?? null,
          state.botPausedIndefinitely ?? false,
          state.updatedAt,
          JSON.stringify(state.fsmSession ?? null)
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async addMessage(phoneNumber: string, message: ChatMessage): Promise<void> {
    phoneNumber = normalizeContactIdentity(phoneNumber);
    const serializedMessage = JSON.stringify({ ...message, timestamp: message.timestamp.toISOString() });
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phoneNumber]);
      await client.query(
        `INSERT INTO bot_conversations (phone_number, messages, current_step, coexistence_status, updated_at)
         VALUES ($1, jsonb_build_array($2::jsonb), 1, 'BOT_ACTIVE', NOW())
         ON CONFLICT (phone_number) DO UPDATE SET
           messages = bot_conversations.messages || EXCLUDED.messages,
           updated_at = NOW()`,
        [phoneNumber, serializedMessage]
      );
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async clearConversation(phoneNumber: string): Promise<void> {
    await this.db.query('DELETE FROM bot_conversations WHERE phone_number = $1', [normalizeContactIdentity(phoneNumber)]);
  }
}
