import type { ModelRef } from '@factory-live/contracts';
import { Badge } from './badge/Badge.tsx';
import type { BadgeOverflow } from './badge/Badge.tsx';
import { LANE_LABEL, providerLabel } from './vocabulary.ts';

const SOURCE_LABEL: Record<ModelRef['source'], string> = {
  live: 'observé sur le dernier appel',
  session: 'enregistré dans la session',
  override: 'forcé sur la carte',
  config: 'configuration de l’agent',
};

/** Un modèle, avec ce qu'on en sait : un `ModelRef` complet, ou un simple nom (fil d'activité, stats). */
export interface ModelName {
  model: string;
  provider?: string | null;
  source?: ModelRef['source'] | null;
}

/**
 * Le modèle, partout le même badge : le fournisseur en étiquette (« lane » pour le CLI délégué), le
 * nom du modèle en valeur, teinté quand il est observé sur le dernier appel. Le nom complet reste dans
 * l'infobulle et pour les lecteurs d'écran : certains noms de modèles locaux dépassent 70 caractères.
 */
export function ModelBadge({
  model,
  lane = false,
  overflow = 'truncate',
}: {
  model: ModelName;
  /** Modèle de la lane CLI (Claude Code, OpenCode) que pilote l'agent. */
  lane?: boolean;
  /** Nom trop long : tronqué (défaut), entier sur plusieurs lignes (détail), deux lignes (tableau). */
  overflow?: BadgeOverflow;
}) {
  const provider = model.provider ? providerLabel(model.provider) : null;
  const label = lane ? LANE_LABEL : provider;
  const description = [
    `${lane ? `${LANE_LABEL} : ` : ''}${model.model}${provider ? ` via ${provider}` : ''}`,
    model.source ? SOURCE_LABEL[model.source] : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <Badge
      {...(label ? { label } : {})}
      value={model.model}
      code
      tone={lane ? 'done' : model.source === 'live' ? 'accent' : 'neutral'}
      description={description}
      overflow={overflow}
    />
  );
}
