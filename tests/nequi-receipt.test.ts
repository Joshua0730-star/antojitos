import { describe, it, expect, beforeEach } from 'vitest';
import { ValidateNequiReceiptUseCase } from '../src/application/use-cases/ValidateNequiReceiptUseCase.js';
import { MockVisionService } from '../src/infrastructure/vision/MockVisionService.js';
import { INequiReceiptRepository } from '../src/domain/repositories/INequiReceiptRepository.js';
import { NequiReceipt } from '../src/domain/entities/NequiReceipt.js';

class InMemoryReceiptRepo implements INequiReceiptRepository {
  private receipts = new Map<string, NequiReceipt>();

  async existsReference(reference: string): Promise<boolean> {
    return this.receipts.has(reference.toUpperCase());
  }

  async save(receipt: NequiReceipt): Promise<void> {
    this.receipts.set(receipt.reference.toUpperCase(), receipt);
  }

  async findByReference(reference: string): Promise<NequiReceipt | null> {
    return this.receipts.get(reference.toUpperCase()) || null;
  }
}

describe('ValidateNequiReceiptUseCase (Anti-Fraude y Negocio)', () => {
  let visionService: MockVisionService;
  let receiptRepo: InMemoryReceiptRepo;
  let useCase: ValidateNequiReceiptUseCase;

  beforeEach(() => {
    visionService = new MockVisionService();
    receiptRepo = new InMemoryReceiptRepo();
    useCase = new ValidateNequiReceiptUseCase(visionService, receiptRepo);
  });

  it('aprueba un comprobante válido y lo registra en la base de datos', async () => {
    const today = new Date().toISOString().replace('T', ' ').slice(0, 19);
    visionService.setExtractionResult({
      es_comprobante_nequi: true,
      monto: 25000,
      numero_m39_referencia: 'M12345678',
      fecha_hora: today,
      estado_legible: true,
      sospecha_fraude: false
    });

    const result = await useCase.execute({
      imageUrl: 'test.jpg',
      expectedAmount: 25000
    });

    expect(result.exito).toBe(true);
    expect(result.referencia).toBe('M12345678');
    expect(result.mensaje).toContain('verificado con éxito');

    // Comprobar que quedó registrado
    const exists = await receiptRepo.existsReference('M12345678');
    expect(exists).toBe(true);
  });

  it('RECHAZA un comprobante si el número de referencia ya fue usado antes (Anti-Fraude)', async () => {
    const today = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Guardar referencia previa en la BD
    await receiptRepo.save(
      new NequiReceipt({
        reference: 'M99999999',
        amount: 25000,
        transactionDate: today,
        isNequiReceipt: true,
        isLegible: true,
        fraudSuspicion: false
      })
    );

    // El atacante intenta volver a mandar la misma captura
    visionService.setExtractionResult({
      es_comprobante_nequi: true,
      monto: 25000,
      numero_m39_referencia: 'M99999999',
      fecha_hora: today,
      estado_legible: true,
      sospecha_fraude: false
    });

    const result = await useCase.execute({
      imageUrl: 'captura_reusada.jpg',
      expectedAmount: 25000
    });

    expect(result.exito).toBe(false);
    expect(result.mensaje).toContain('ya fue utilizado en un pedido anterior');
  });

  it('RECHAZA un comprobante si el monto pagado es menor al total del pedido', async () => {
    const today = new Date().toISOString().replace('T', ' ').slice(0, 19);
    visionService.setExtractionResult({
      es_comprobante_nequi: true,
      monto: 15000, // Pagó 15.000
      numero_m39_referencia: 'M88888888',
      fecha_hora: today,
      estado_legible: true,
      sospecha_fraude: false
    });

    const result = await useCase.execute({
      imageUrl: 'test.jpg',
      expectedAmount: 25000 // Pero la orden cuesta 25.000
    });

    expect(result.exito).toBe(false);
    expect(result.mensaje).toContain('El comprobante muestra un pago de $15.000, pero el total de la orden es $25.000');
  });

  it('RECHAZA si la imagen no es un comprobante Nequi o tiene sospecha de fraude', async () => {
    const today = new Date().toISOString().replace('T', ' ').slice(0, 19);
    visionService.setExtractionResult({
      es_comprobante_nequi: false,
      monto: 25000,
      numero_m39_referencia: '',
      fecha_hora: today,
      estado_legible: true,
      sospecha_fraude: true
    });

    const result = await useCase.execute({
      imageUrl: 'meme.jpg',
      expectedAmount: 25000
    });

    expect(result.exito).toBe(false);
    expect(result.mensaje).toContain('no corresponde a un comprobante Nequi');
  });
});
