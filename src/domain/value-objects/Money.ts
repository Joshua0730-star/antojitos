export class Money {
  constructor(public readonly amount: number, public readonly currency: string = 'COP') {
    if (amount < 0) {
      throw new Error('El monto no puede ser negativo');
    }
  }

  public add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('No se pueden sumar montos con diferentes monedas');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  public formatCOP(): string {
    return `$${this.amount.toLocaleString('es-CO')} ${this.currency}`;
  }

  public static zero(): Money {
    return new Money(0, 'COP');
  }

  public static cop(amount: number): Money {
    return new Money(amount, 'COP');
  }
}
