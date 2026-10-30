import type { ModelRef } from '@factory-live/contracts';
import { SparkleFillIcon } from '@primer/octicons-react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { Badge } from './badge/Badge.tsx';
import { hueOf } from './badge/hues.ts';
import { isBrand, laneMark, modelEditor, providerMark } from './badge/marks.ts';
import { providerLabel } from './vocabulary.ts';

/** Un modèle, avec ce qu'on en sait : un `ModelRef` complet, ou un simple nom (fil d'activité, stats). */
export interface ModelName {
  model: string;
  provider?: string | null;
  source?: ModelRef['source'] | null;
}

/**
 * The model, the same badge everywhere: the provider as the label (« lane » for the delegated CLI),
 * with its icon, painted in the brand colors when it is a brand (NVIDIA API, Claude); the model
 * name as the value, with the logo of its publisher (Qwen, Mistral…), in the hue of its provider.
 * Without a provider: the « modèle » label and the `sparkle-fill` icon, the hue drawn from the name.
 * Where the information comes from (observed on the last call, configuration…) is read in the
 * tooltip and the screen reader text, not in a hue. Always on one line: the name, cut in the middle
 * when room is short, stays whole in the tooltip and for screen readers (some local model names
 * exceed 70 characters).
 */
export function ModelBadge({
  model,
  lane = false,
}: {
  model: ModelName;
  /** Modèle de la lane CLI (Claude Code, OpenCode) que pilote l'agent. */
  lane?: boolean;
}) {
  const { t } = useI18n();
  const provider = model.provider ? providerLabel(model.provider) : null;
  const label = lane ? t.common.lane : (provider ?? t.badge.model);
  const mark = lane
    ? laneMark(model.provider ?? null)
    : model.provider
      ? providerMark(model.provider)
      : SparkleFillIcon;
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
      label={label}
      labelIcon={mark}
      brand={brand}
      value={model.model}
      hue={model.provider ? hueOf('provider', model.provider) : hueOf('model', model.model)}
      // Le logo de l'éditeur, sauf s'il vient d'être peint en étiquette (Nemotron sur l'API NVIDIA).
      icon={editor && editor !== brand ? editor : null}
      code
      description={description}
    />
  );
}
