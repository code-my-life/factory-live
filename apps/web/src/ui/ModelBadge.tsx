import type { ModelRef } from '@factory-live/contracts';
import { providerLabel } from './vocabulary.ts';
import styles from './ModelBadge.module.css';

const SOURCE_LABEL: Record<ModelRef['source'], string> = {
  live: 'observé sur le dernier appel',
  session: 'enregistré dans la session',
  override: 'forcé sur la carte',
  config: 'configuration du profil',
};

/**
 * Modèle et fournisseur. Le nom complet reste dans l'infobulle et pour les lecteurs d'écran :
 * certains noms de modèles locaux dépassent 70 caractères.
 */
export function ModelBadge({
  model,
  emphasis = false,
  prefix,
}: {
  model: ModelRef;
  emphasis?: boolean;
  prefix?: string;
}) {
  const description = `${prefix ? `${prefix} : ` : ''}${model.model} via ${providerLabel(model.provider)}, ${SOURCE_LABEL[model.source]}`;
  return (
    <span
      className={styles.badge}
      data-live={model.source === 'live' ? 'true' : undefined}
      data-emphasis={emphasis ? 'true' : undefined}
      title={description}
    >
      {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
      <span className={styles.model}>{model.model}</span>
      <span className={styles.provider}>{providerLabel(model.provider)}</span>
      <span className="fl-visually-hidden">{description}</span>
    </span>
  );
}
