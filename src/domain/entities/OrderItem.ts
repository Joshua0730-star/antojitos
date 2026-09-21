import { Money } from '../value-objects/Money.js';

export interface ExtraAddition {
  name?: string;
  nombre?: string;
  additionalPrice?: number;
  adicional?: number;
}

export interface SizeOption {
  name?: string;
  nombre?: string;
  additional?: number;
  adicional?: number;
}

export interface ExtraCheeseOption {
  name?: string;
  nombre?: string;
  additional?: number;
  adicional?: number;
}

export interface OrderItemProps {
  productId: string;
  productName: string;
  category: string;
  basePrice: number;
  quantity: number;
  size?: SizeOption;
  toppings?: string[];
  sauce?: string;
  extraAdditions?: ExtraAddition[];
  iceCreamFlavor?: string;
  extraCheese?: ExtraCheeseOption;
}

export class OrderItem {
  public readonly productId: string;
  public readonly productName: string;
  public readonly category: string;
  public readonly basePrice: number;
  public readonly quantity: number;
  public readonly size?: SizeOption;
  public readonly toppings: string[];
  public readonly sauce?: string;
  public readonly extraAdditions: ExtraAddition[];
  public readonly iceCreamFlavor?: string;
  public readonly extraCheese?: ExtraCheeseOption;

  constructor(props: OrderItemProps) {
    if (props.quantity <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }
    this.productId = props.productId;
    this.productName = props.productName;
    this.category = props.category;
    this.basePrice = props.basePrice;
    this.quantity = props.quantity;
    this.size = props.size;
    this.toppings = props.toppings || [];
    this.sauce = props.sauce;
    this.extraAdditions = props.extraAdditions || [];
    this.iceCreamFlavor = props.iceCreamFlavor;
    this.extraCheese = props.extraCheese;
  }

  public getUnitPrice(): Money {
    let unitTotal = this.basePrice;

    if (this.size) {
      unitTotal += this.size.additional ?? this.size.adicional ?? 0;
    }

    if (this.extraAdditions && this.extraAdditions.length > 0) {
      for (const add of this.extraAdditions) {
        unitTotal += add.additionalPrice ?? add.adicional ?? 0;
      }
    }

    if (this.extraCheese) {
      unitTotal += this.extraCheese.additional ?? this.extraCheese.adicional ?? 0;
    }

    return Money.cop(unitTotal);
  }

  public getSubtotal(): Money {
    return Money.cop(this.getUnitPrice().amount * this.quantity);
  }

  public formatForKitchen(): string {
    const lines: string[] = [];
    const sizeName = this.size ? (this.size.name || this.size.nombre || '') : '';
    const sizeStr = sizeName ? ` (${sizeName})` : '';
    lines.push(`• ${this.quantity}x *${this.productName}*${sizeStr}`);

    const details: string[] = [];
    if (this.toppings.length > 0) {
      details.push(`Toppings: ${this.toppings.join(', ')}`);
    }
    if (this.sauce) {
      details.push(`Salsa: ${this.sauce}`);
    }
    if (this.iceCreamFlavor) {
      details.push(`Helado: ${this.iceCreamFlavor}`);
    }
    if (this.extraCheese && (this.extraCheese.additional || this.extraCheese.adicional)) {
      const cheeseName = this.extraCheese.name || this.extraCheese.nombre || 'Con extra queso';
      details.push(`Extra Queso: ${cheeseName}`);
    }
    if (this.extraAdditions.length > 0) {
      const names = this.extraAdditions.map(a => a.name || a.nombre || 'Adición');
      details.push(`Adiciones: ${names.join(', ')}`);
    }

    for (const d of details) {
      lines.push(`  └ ${d}`);
    }

    return lines.join('\n');
  }
}
