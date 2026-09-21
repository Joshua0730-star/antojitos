export type DeliveryType = 'DOMICILIO' | 'RECOGER_EN_LOCAL';

export interface CustomerProps {
  name: string;
  phoneNumber: string;
  deliveryType: DeliveryType;
  address?: string;
  neighborhoodOrMunicipality?: string;
  addressDetails?: string; // Apto, Piso, Referencia
}

export class Customer {
  public readonly name: string;
  public readonly phoneNumber: string;
  public readonly deliveryType: DeliveryType;
  public readonly address?: string;
  public readonly neighborhoodOrMunicipality?: string;
  public readonly addressDetails?: string;

  constructor(props: CustomerProps) {
    this.name = props.name.trim();
    this.phoneNumber = props.phoneNumber.trim();
    this.deliveryType = props.deliveryType;
    this.address = props.address?.trim();
    this.neighborhoodOrMunicipality = props.neighborhoodOrMunicipality?.trim();
    this.addressDetails = props.addressDetails?.trim();
  }

  public getFullAddress(): string {
    if (this.deliveryType === 'RECOGER_EN_LOCAL') {
      return 'Recoger en local';
    }

    const parts = [
      this.address,
      this.neighborhoodOrMunicipality ? `(${this.neighborhoodOrMunicipality})` : null,
      this.addressDetails ? `- ${this.addressDetails}` : null
    ].filter(Boolean);

    return parts.join(' ') || 'Dirección no especificada';
  }
}
