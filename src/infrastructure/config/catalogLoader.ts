import fs from 'fs';
import path from 'path';

export interface CatalogProductOptionSize {
  nombre: string;
  adicional: number;
}

export interface CatalogProductToppings {
  max_seleccion: number;
  lista: string[];
}

export interface CatalogProductAddition {
  nombre: string;
  adicional: number;
}

export interface CatalogProduct {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  precio_base: number;
  opciones?: {
    tamaño?: CatalogProductOptionSize[];
    toppings?: CatalogProductToppings;
    salsa?: string[];
    adiciones_extra?: CatalogProductAddition[];
    sabor_helado?: string[];
    extra_queso?: CatalogProductOptionSize[];
    [key: string]: any;
  };
}

export interface CatalogData {
  comercio: string;
  telefono_contacto: string;
  numero_nequi: string;
  metodos_pago: string[];
  productos: CatalogProduct[];
}

export class CatalogLoader {
  private static cachedCatalog: CatalogData | null = null;

  public static load(): CatalogData {
    if (this.cachedCatalog) {
      return this.cachedCatalog;
    }

    const possiblePaths = [
      path.resolve(process.cwd(), 'data', 'catalog.json'),
      path.resolve(process.cwd(), '..', 'data', 'catalog.json'),
      new URL('../../../data/catalog.json', import.meta.url).pathname
    ];

    let foundPath: string | null = null;
    for (const p of possiblePaths) {
      // Normalizar rutas en Windows (eliminar leading slash en file URL si existe)
      const cleanPath = process.platform === 'win32' && p.startsWith('/') ? p.slice(1) : p;
      if (fs.existsSync(cleanPath)) {
        foundPath = cleanPath;
        break;
      }
    }

    if (!foundPath) {
      throw new Error('No se pudo encontrar el archivo catalog.json en data/catalog.json');
    }

    const raw = fs.readFileSync(foundPath, 'utf-8');
    this.cachedCatalog = JSON.parse(raw) as CatalogData;
    return this.cachedCatalog;
  }
}
