const integer = new Intl.NumberFormat('fr-FR');
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const clock = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Durée lisible : « 38 s », « 4 min 12 s », « 2 h 05 ». */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}

export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60_000);
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

export function formatCompact(value: number): string {
  return compact.format(value);
}

export function formatUsd(value: number): string {
  return usd.format(value);
}

export function formatPercent(ratio: number): string {
  return percent.format(ratio);
}

export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso));
}

/** Âge relatif court, pour les listes : « à l'instant », « il y a 12 s », « il y a 4 min ». */
export function formatAge(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (ms < 5_000) return "à l'instant";
  return `il y a ${formatDuration(ms)}`;
}
