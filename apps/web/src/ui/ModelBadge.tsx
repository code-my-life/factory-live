import type { ModelRef } from '@factory-live/contracts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { Badge } from './badge/Badge.tsx';
import type { BadgeOverflow } from './badge/Badge.tsx';
import { providerLabel } from './vocabulary.ts';

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
  const { t } = useI18n();
  const provider = model.provider ? providerLabel(model.provider) : null;
  const label = lane ? t.common.lane : provider;
  const description = t.model.description(
    lane ? t.common.lane : null,
    model.model,
    provider,
    model.source ? t.modelSource[model.source] : null,
  );
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
