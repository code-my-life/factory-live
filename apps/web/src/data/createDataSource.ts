import { DemoSource } from '../demo/DemoSource.ts';
import type { FactoryDataSource } from './source.ts';

/**
 * Choisit la source de données. La maquette et les tests de bout en bout tournent sur la démo ;
 * la source branchée sur l'API de factory-live (REST + SSE) s'ajoute avec le serveur.
 */
export function createDataSource(): FactoryDataSource {
  return new DemoSource();
}
