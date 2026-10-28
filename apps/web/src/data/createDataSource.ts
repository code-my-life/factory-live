import { DemoSource } from '../demo/DemoSource.ts';
import { LiveSource } from './LiveSource.ts';
import type { FactoryDataSource } from './source.ts';

/**
 * Choisit la source de données au build : `VITE_DATA_SOURCE=live` branche la PWA sur l'API de
 * factory-live (SSE + REST) ; sinon la démo, qui sert à la maquette et aux tests de bout en bout.
 */
export function createDataSource(): FactoryDataSource {
  return import.meta.env.VITE_DATA_SOURCE === 'live' ? new LiveSource() : new DemoSource();
}
