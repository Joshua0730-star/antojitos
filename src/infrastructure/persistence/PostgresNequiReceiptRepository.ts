import { Pool } from 'pg';
import { INequiReceiptRepository } from '../../domain/repositories/INequiReceiptRepository.js';
import { NequiReceipt, NequiReceiptProps } from '../../domain/entities/NequiReceipt.js';

export class PostgresNequiReceiptRepository implements INequiReceiptRepository {
  constructor(private readonly db: Pool) {}

  async existsReference(reference: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM nequi_receipts WHERE normalized_reference = $1 LIMIT 1',
      [reference.trim().toUpperCase()]
    );
    return result.rowCount !== 0;
  }

  async save(receipt: NequiReceipt): Promise<void> {
    const payload: NequiReceiptProps = {
      id: receipt.id || `REC-${Date.now()}`,
      reference: receipt.reference,
      amount: receipt.amount,
      transactionDate: receipt.transactionDate,
      isNequiReceipt: receipt.isNequiReceipt,
      isLegible: receipt.isLegible,
      fraudSuspicion: receipt.fraudSuspicion,
      imageUrl: receipt.imageUrl,
      orderId: receipt.orderId,
      createdAt: receipt.createdAt
    };

    await this.db.query(
      `INSERT INTO nequi_receipts (normalized_reference, id, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (normalized_reference) DO UPDATE SET id = EXCLUDED.id, payload = EXCLUDED.payload`,
      [receipt.reference.trim().toUpperCase(), payload.id, JSON.stringify(payload)]
    );
  }

  async findByReference(reference: string): Promise<NequiReceipt | null> {
    const result = await this.db.query<{ payload: NequiReceiptProps }>(
      'SELECT payload FROM nequi_receipts WHERE normalized_reference = $1',
      [reference.trim().toUpperCase()]
    );
    const payload = result.rows[0]?.payload;
    return payload ? new NequiReceipt({ ...payload, createdAt: new Date(payload.createdAt ?? Date.now()) }) : null;
  }
}
