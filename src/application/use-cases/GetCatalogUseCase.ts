import { CatalogData, CatalogLoader } from '../../infrastructure/config/catalogLoader.js';

export class GetCatalogUseCase {
  public execute(): CatalogData {
    return CatalogLoader.load();
  }
}
