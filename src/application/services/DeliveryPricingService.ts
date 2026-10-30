export interface DeliveryPricingInput {
  neighborhood: string;
  raining?: boolean;
  hour?: number;
}

export interface DeliveryPricingResult {
  amount: number;
  distant: boolean;
  factors: string[];
}

/** Deterministic business rule: the model must never calculate delivery fees. */
export class DeliveryPricingService {
  private readonly distantNeighborhoods = ['los pinos', 'mama juana', 'la victoria', 'las catorce', 'villa marina'];

  public calculate(input: DeliveryPricingInput): DeliveryPricingResult {
    const neighborhood = input.neighborhood.trim().toLowerCase();
    const distant = this.distantNeighborhoods.some(item => neighborhood.includes(item));
    // La hora se obtiene del servidor en America/Bogota; nunca se solicita
    // al cliente. La lluvia solo puede venir de una fuente interna confiable.
    const hour = input.hour ?? Number(new Intl.DateTimeFormat('es-CO', { hour: '2-digit', hour12: false, timeZone: 'America/Bogota' }).format(new Date()));
    const raining = input.raining ?? false;
    const afterSeven = hour >= 19;
    const factors: string[] = [];

    if (distant) factors.push('barrio_lejano');
    if (raining) factors.push('lluvia');
    if (afterSeven) factors.push('despues_de_las_7pm');

    let amount = 2000;
    if (distant) amount = raining ? 5000 : afterSeven ? 4000 : 3000;
    else if (raining) amount = 4000;
    else if (afterSeven) amount = 3000;

    return { amount, distant, factors };
  }
}
