import { formatAge, formatDuration } from './format.ts';
import { useNow } from './useNow.ts';

/** Durée écoulée depuis `since`, mise à jour chaque seconde. */
export function Elapsed({
  since,
  mode = 'duration',
}: {
  since: string;
  mode?: 'duration' | 'age';
}) {
  const now = useNow();
  const text = mode === 'age' ? formatAge(since, now) : formatDuration(now - Date.parse(since));
  return (
    <time dateTime={since} className="fl-tabular">
      {text}
    </time>
  );
}
