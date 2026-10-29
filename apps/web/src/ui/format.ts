import { LOCALE_TAG } from '../i18n/locale.ts';
import type { Locale } from '../i18n/locale.ts';

/** Nombres, dates, durées et pluriels, écrits comme le veut la langue de l'interface. */
export interface Formatters {
  /** Durée : « 38 s », « 4 min 12 s », « 2 h 05 » ; « 38s », « 4m 12s », « 2h 5m ». */
  duration: (ms: number) => string;
  /** Depuis combien de temps, à la minute : « moins d'une minute », « 11 min », « 2 h 05 », « 9 j ». */
  stay: (ms: number) => string;
  minutes: (minutes: number) => string;
  /** Âge relatif court, pour les listes : « à l'instant », « il y a 12 s », « il y a 4 min ». */
  age: (iso: string, now: number) => string;
  /** Âge en secondes arrondi à la manière du serveur (santé) : « il y a 9 s », « il y a 4 min », « il y a 2 h ». */
  ago: (seconds: number) => string;
  /** La même durée sans « il y a » : « 4 min ». */
  span: (seconds: number) => string;
  integer: (value: number) => string;
  compact: (value: number) => string;
  usd: (value: number) => string;
  percent: (ratio: number) => string;
  clock: (iso: string) => string;
  dayMonth: (iso: string) => string;
  /** Singulier ou pluriel selon les règles de la langue (Intl.PluralRules) : zéro est singulier en français. */
  plural: (count: number, one: string, other: string) => string;
}

interface Words {
  seconds(seconds: number): string;
  minutes(minutes: number): string;
  minutesSeconds(minutes: number, seconds: number): string;
  hours(hours: number): string;
  hoursMinutes(hours: number, minutes: number): string;
  days(days: number): string;
  underAMinute: string;
  justNow: string;
  ago(span: string): string;
}

const WORDS: Readonly<Record<Locale, Words>> = {
  fr: {
    seconds: (seconds) => `${seconds} s`,
    minutes: (minutes) => `${minutes} min`,
    minutesSeconds: (minutes, seconds) => `${minutes} min ${seconds} s`,
    hours: (hours) => `${hours} h`,
    hoursMinutes: (hours, minutes) => `${hours} h ${String(minutes).padStart(2, '0')}`,
    days: (days) => `${days} j`,
    underAMinute: "moins d'une minute",
    justNow: "à l'instant",
    ago: (span) => `il y a ${span}`,
  },
  en: {
    seconds: (seconds) => `${seconds}s`,
    minutes: (minutes) => `${minutes}m`,
    minutesSeconds: (minutes, seconds) => `${minutes}m ${seconds}s`,
    hours: (hours) => `${hours}h`,
    hoursMinutes: (hours, minutes) => (minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`),
    days: (days) => `${days}d`,
    underAMinute: 'less than a minute',
    justNow: 'just now',
    ago: (span) => `${span} ago`,
  },
};

/** Heure d'une ligne de timeline : 24 h en français, 12 h en anglais américain. */
const CLOCK: Readonly<Record<Locale, Intl.DateTimeFormatOptions>> = {
  fr: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
  en: { hour: 'numeric', minute: '2-digit', second: '2-digit' },
};

function create(locale: Locale): Formatters {
  const tag = LOCALE_TAG[locale];
  const words = WORDS[locale];
  const integer = new Intl.NumberFormat(tag);
  const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 });
  const usd = new Intl.NumberFormat(tag, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
  const percent = new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 });
  const clock = new Intl.DateTimeFormat(tag, CLOCK[locale]);
  const dayMonth = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short' });
  const plurals = new Intl.PluralRules(tag);

  const duration = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    if (totalSeconds < 60) return words.seconds(totalSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60)
      return seconds === 0 ? words.minutes(minutes) : words.minutesSeconds(minutes, seconds);
    return words.hoursMinutes(Math.floor(minutes / 60), minutes % 60);
  };
  const span = (seconds: number): string => {
    const whole = Math.max(0, Math.round(seconds));
    if (whole < 90) return words.seconds(whole);
    const minutes = Math.round(whole / 60);
    if (minutes < 90) return words.minutes(minutes);
    return words.hours(Math.round(minutes / 60));
  };

  return {
    duration,
    stay: (ms) => {
      if (ms < 60_000) return words.underAMinute;
      const minutes = Math.floor(ms / 60_000);
      if (minutes < 60) return words.minutes(minutes);
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return words.hoursMinutes(hours, minutes % 60);
      return words.days(Math.floor(hours / 24));
    },
    minutes: (minutes) => duration(minutes * 60_000),
    age: (iso, now) => {
      const ms = now - Date.parse(iso);
      return ms < 5_000 ? words.justNow : words.ago(duration(ms));
    },
    ago: (seconds) => words.ago(span(seconds)),
    span,
    integer: (value) => integer.format(value),
    compact: (value) => compact.format(value),
    usd: (value) => usd.format(value),
    percent: (ratio) => percent.format(ratio),
    clock: (iso) => clock.format(new Date(iso)),
    dayMonth: (iso) => dayMonth.format(new Date(iso)),
    plural: (count, one, other) => (plurals.select(count) === 'one' ? one : other),
  };
}

const cache = new Map<Locale, Formatters>();

/** Les formateurs d'une langue, créés une fois. */
export function formatters(locale: Locale): Formatters {
  let found = cache.get(locale);
  if (!found) {
    found = create(locale);
    cache.set(locale, found);
  }
  return found;
}
