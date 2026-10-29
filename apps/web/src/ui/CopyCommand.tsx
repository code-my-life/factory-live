import { CheckIcon, CopyIcon } from '@primer/octicons-react';
import { Button } from '@primer/react';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import styles from './CopyCommand.module.css';

/**
 * Une commande exacte à lancer, et le bouton qui la copie. Sans presse-papiers (page non sécurisée,
 * refus du navigateur), la commande est sélectionnée pour un copier à la main.
 */
export function CopyCommand({
  command,
  label = null,
  compact = false,
}: {
  command: string;
  label?: string | null;
  /** Dans une étape : la commande sous son texte, sans titre. */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const commandId = useId();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const element = document.getElementById(commandId);
      if (element) window.getSelection()?.selectAllChildren(element);
    }
  };
  return (
    <div className={styles.copy} data-compact={compact ? 'true' : undefined}>
      {label ? <p className={styles.label}>{label}</p> : null}
      <pre className={styles.command} id={commandId}>
        {command}
      </pre>
      <Button
        size="small"
        leadingVisual={copied ? CheckIcon : CopyIcon}
        onClick={() => void copy()}
        aria-describedby={commandId}
      >
        {copied ? t.interventions.copied : compact ? t.diagnosis.copyCommand : t.interventions.copy}
      </Button>
    </div>
  );
}
