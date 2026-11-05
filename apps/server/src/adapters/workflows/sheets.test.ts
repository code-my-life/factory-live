import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../test/hermes-fixtures.ts';
import { STUDIO_SHEET } from '../../test/workflow-fixtures.ts';
import { publishedSheet } from './sheets.ts';

/** Why the embedded copy is drawn, or `null` when the published sheet is. */
function embedded(path: string | null): string | null {
  const read = publishedSheet(path);
  return read.source === 'embedded' ? read.reason : null;
}

describe('publishedSheet', () => {
  it('la ligne du code vient de la fiche publiée par la factory, la copie embarquée en repli', () => {
    const dir = tempDir();
    try {
      const path = join(dir.path, 'config', 'workflow.json');
      mkdirSync(join(dir.path, 'config'));
      writeFileSync(path, JSON.stringify(STUDIO_SHEET));
      expect(publishedSheet(path)).toEqual({ source: 'published', sheet: STUDIO_SHEET });

      // Absent, invalid, unreadable or too big: the embedded copy, and why.
      expect(embedded(null)).toContain('absent');
      writeFileSync(path, JSON.stringify({ ...STUDIO_SHEET, models: ['nulle-part'] }));
      expect(embedded(path)).toContain('invalide');
      writeFileSync(path, '{ pas du json');
      expect(embedded(path)).toContain('illisible');
      writeFileSync(path, ' '.repeat(300 * 1024));
      expect(embedded(path)).toContain('trop gros');
    } finally {
      dir.remove();
    }
  });
});
