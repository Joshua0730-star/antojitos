import fs from 'fs';
import path from 'path';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository.js';
import { Order, OrderProps } from '../../domain/entities/Order.js';
import { Customer } from '../../domain/entities/Customer.js';
import { OrderItem, SizeOption, ExtraAddition, ExtraCheeseOption } from '../../domain/entities/OrderItem.js';
import { OrderStatus } from '../../domain/value-objects/OrderStatus.js';

interface SerializedOrder {
  id: string;
  customer: {
    name: string;
    phoneNumber: string;
    deliveryType: 'DOMICILIO' | 'RECOGER_EN_LOCAL';
    address?: string;
    neighborhoodOrMunicipality?: string;
    addressDetails?: string;
  };
  items: Array<{
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
  }>;
  paymentMethod: 'EFECTIVO' | 'NEQUI';
  cashBillAmount?: number;
  nequiReference?: string;
  nequiVerified: boolean;
  status: string;
  createdAt: string;
}

export class FileOrderRepository implements IOrderRepository {
  private readonly filePath: string;

  constructor(storageDir: string = './data') {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.filePath = path.join(storageDir, 'orders.json');
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private readAll(): SerializedOrder[] {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data) as SerializedOrder[];
    } catch {
      return [];
    }
  }

  private writeAll(items: SerializedOrder[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
  }

  private deserialize(row: SerializedOrder): Order {
    const customer = new Customer(row.customer);
    const items = row.items.map(it => new OrderItem(it));
    return new Order({
      id: row.id,
      customer,
      items,
      paymentMethod: row.paymentMethod,
      cashBillAmount: row.cashBillAmount,
      nequiReference: row.nequiReference,
      nequiVerified: row.nequiVerified,
      status: new OrderStatus(row.status as any),
      createdAt: new Date(row.createdAt)
    });
  }

  public async save(order: Order): Promise<void> {
    const items = this.readAll();
    const existingIndex = items.findIndex(item => item.id === order.id);

    const record: SerializedOrder = {
      id: order.id,
      customer: {
        name: order.customer.name,
        phoneNumber: order.customer.phoneNumber,
        deliveryType: order.customer.deliveryType,
        address: order.customer.address,
        neighborhoodOrMunicipality: order.customer.neighborhoodOrMunicipality,
        addressDetails: order.customer.addressDetails
      },
      items: order.items.map(it => ({
        productId: it.productId,
        productName: it.productName,
        category: it.category,
        basePrice: it.basePrice,
        quantity: it.quantity,
        size: it.size,
        toppings: it.toppings,
        sauce: it.sauce,
        extraAdditions: it.extraAdditions,
        iceCreamFlavor: it.iceCreamFlavor,
        extraCheese: it.extraCheese
      })),
      paymentMethod: order.paymentMethod,
      cashBillAmount: order.cashBillAmount,
      nequiReference: order.nequiReference,
      nequiVerified: order.nequiVerified,
      status: order.status.value,
      createdAt: order.createdAt.toISOString()
    };

    if (existingIndex >= 0) {
      items[existingIndex] = record;
    } else {
      items.push(record);
    }

    this.writeAll(items);
  }

  public async findById(id: string): Promise<Order | null> {
    const items = this.readAll();
    const found = items.find(item => item.id === id);
    if (!found) return null;
    return this.deserialize(found);
  }

  public async findLatestByPhoneNumber(phoneNumber: string): Promise<Order | null> {
    const items = this.readAll();
    const cleanPhone = phoneNumber.trim();
    const matching = items.filter(item => item.customer.phoneNumber.trim() === cleanPhone);
    if (matching.length === 0) return null;
    // Sort descending by date
    matching.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return this.deserialize(matching[0]);
  }

  public async listAll(): Promise<Order[]> {
    const items = this.readAll();
    return items.map(it => this.deserialize(it));
  }
}
