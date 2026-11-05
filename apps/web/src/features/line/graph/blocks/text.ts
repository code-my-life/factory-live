import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { suffixOf } from '../layout.ts';
import type { LegendEntry, SheetPlan } from '../layout.ts';

/** A dictionary's text for a key, if it has one. */
export function entry<T>(dictionary: object, key: string): T | undefined {
  return Object.hasOwn(dictionary, key) ? (dictionary as Record<string, T>)[key] : undefined;
}

/** The texts of a sheet's stations, groups and links. */
export interface SheetText {
  label: (key: string) => string;
  hint: (key: string) => string;
  type: (type: string) => string;
  vector: (entry: LegendEntry) => string;
}

/**
 * What a station, a group or a link is called on screen: the dictionary's text for its key when it
 * has one, so that a known workflow reads the same in every language, else the sheet's own label, so
 * that a new workflow shows without a change here.
 */
export function useSheetText(plan: SheetPlan): SheetText {
  const { t } = useI18n();
  const group = (key: string) => plan.sheet.groups?.find((value) => value.key === key);
  const label = (key: string): string => {
    const station = plan.station.get(key);
    return (
      entry<string>(t.station, key) ??
      (station?.group ? entry<string>(t.line.graph.lane, suffixOf(station)) : undefined) ??
      station?.label ??
      group(key)?.label ??
      key
    );
  };
  const hint = (key: string): string => {
    const owner = plan.station.get(key)?.group ?? (group(key) ? key : undefined);
    if (owner !== undefined) return entry<string>(t.line.graph.groupHint, owner) ?? label(owner);
    return entry<string>(t.stationHint, key) ?? label(key);
  };
  return {
    label,
    hint,
    type: (type) => entry<string>(t.issueType, type) ?? type,
    vector: (value) => entry<string>(t.line.graph.vector, value.key) ?? value.label ?? value.key,
  };
}
