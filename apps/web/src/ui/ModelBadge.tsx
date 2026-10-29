import type { ModelRef } from '@factory-live/contracts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { Badge } from './badge/Badge.tsx';
import type { BadgeOverflow } from './badge/Badge.tsx';
import { isBrand, laneMark, modelEditor, providerMark } from './badge/marks.ts';
import { providerLabel } from './vocabulary.ts';

/** Un modèle, avec ce qu'on en sait : un `ModelRef` complet, ou un simple nom (fil d'activité, stats). */
export interface ModelName {
  model: string;
  provider?: string | null;
  source?: ModelRef['source'] | null;
}

/**
 * Le modèle, partout le même badge : le fournisseur en étiquette (« lane » pour le CLI délégué), avec
 * son icône, peinte aux couleurs de la marque quand c'en est une (API NVIDIA, Claude) ; le nom du
 * modèle en valeur, avec le logo de son éditeur (Qwen, Mistral…), teinté quand il est observé sur le
 * dernier appel. Le nom complet reste dans l'infobulle et pour les lecteurs d'écran : certains noms de
 * modèles locaux dépassent 70 caractères.
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
  const mark = lane
    ? laneMark(model.provider ?? null)
    : model.provider
      ? providerMark(model.provider)
      : null;
  const brand = mark && isBrand(mark) ? mark : null;
  const editor = modelEditor(model.model);
  const description = t.model.description(
    lane ? t.common.lane : null,
    model.model,
    provider,
    model.source ? t.modelSource[model.source] : null,
  );
  return (
    <Badge
      {...(label ? { label } : {})}
      {...(label && mark ? { labelIcon: mark } : {})}
      brand={brand}
      value={model.model}
      // Le logo de l'éditeur, sauf s'il vient d'être peint en étiquette (Nemotron sur l'API NVIDIA).
      icon={editor && editor !== brand ? editor : null}
      code
      tone={lane ? 'done' : model.source === 'live' ? 'accent' : 'neutral'}
      description={description}
      overflow={overflow}
    />
  );
}
