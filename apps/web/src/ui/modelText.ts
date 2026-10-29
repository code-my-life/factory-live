import type { AgentActivity, ModelRef } from '@factory-live/contracts';
import type { ModelName } from './ModelBadge.tsx';

const LINK = /^(.+) \(([^()]+)\)$/;

/**
 * Les modèles d'un écart de configuration (champs « modèle » et « fallbacks »), tels que le serveur
 * les écrit (`apps/server/src/application/drift.ts`) : « modèle (fournisseur) », séparés par des
 * virgules. `null` quand la valeur n'a pas cette forme : elle s'affiche alors telle quelle.
 */
export function parseModelLinks(value: string): ModelName[] | null {
  if (!value) return null;
  const links = value.split(', ').map((part) => LINK.exec(part));
  if (links.some((link) => !link)) return null;
  return links.map((link) => ({ model: link?.[1] ?? '', provider: link?.[2] ?? '' }));
}

/**
 * Le modèle qu'un agent appelle, quand son action en cours n'en dit pas plus que le nom du modèle (le
 * cas des vrais appels, dont le détail est ce nom) : il s'affiche alors en badge, pas en texte.
 */
export function actionModel(agent: AgentActivity): ModelRef | null {
  const { action, model } = agent;
  return action?.kind === 'llm' && model && action.detail === model.model ? model : null;
}
