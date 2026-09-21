import fs from 'fs';
import path from 'path';
import { INequiReceiptRepository } from '../../domain/repositories/INequiReceiptRepository.js';
import { NequiReceipt, NequiReceiptProps } from '../../domain/entities/NequiReceipt.js';

export class FileNequiReceiptRepository implements INequiReceiptRepository {
  private readonly filePath: string;

  constructor(storageDir: string = './data') {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.filePath = path.join(storageDir, 'nequi_receipts.json');
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private readAll(): NequiReceiptProps[] {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data) as NequiReceiptProps[];
    } catch {
      return [];
    }
  }

  private writeAll(items: NequiReceiptProps[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
  }

  public async existsReference(reference: string): Promise<boolean> {
    const cleanRef = reference.trim().toUpperCase();
    const items = this.readAll();
    return items.some(item => item.reference.trim().toUpperCase() === cleanRef);
  }

  public async save(receipt: NequiReceipt): Promise<void> {
    const items = this.readAll();
    const existingIndex = items.findIndex(
      item => item.reference.trim().toUpperCase() === receipt.reference.trim().toUpperCase()
    );

    const record: NequiReceiptProps = {
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

    if (existingIndex >= 0) {
      items[existingIndex] = record;
    } else {
      items.push(record);
    }

    this.writeAll(items);
  }

  public async findByReference(reference: string): Promise<NequiReceipt | null> {
    const cleanRef = reference.trim().toUpperCase();
    const items = this.readAll();
    const found = items.find(item => item.reference.trim().toUpperCase() === cleanRef);
    if (!found) return null;
    return new NequiReceipt(found);
  }
}
