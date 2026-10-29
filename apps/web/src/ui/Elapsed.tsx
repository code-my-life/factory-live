import { useI18n } from '../i18n/I18nProvider.tsx';
import { useNow } from './useNow.ts';

/** Durée écoulée depuis `since`, mise à jour chaque seconde. */
export function Elapsed({
  since,
  mode = 'duration',
}: {
  since: string;
  mode?: 'duration' | 'age';
}) {
  const { fmt } = useI18n();
  const now = useNow();
  const text = mode === 'age' ? fmt.age(since, now) : fmt.duration(now - Date.parse(since));
  return <time dateTime={since}>{text}</time>;
}
