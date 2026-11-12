import { describe, expect, it } from 'vitest';
import * as values from './workflow-core/generated/schemas.ts';
import { coreItems, coreSheetResponse } from './workflowCore.ts';

// The files are read as text by Vite's `import.meta.glob` (the contracts depend on zod only: no node:fs
// here, and only the one signature this test uses is declared).
declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string,
      options: { query: '?raw'; import: 'default'; eager: true },
    ): Record<string, T>;
  }
}
const copies = import.meta.glob<string>('./workflow-core/schema/*.schema.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const generated = import.meta.glob<string>('./workflow-core/generated/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const source = import.meta.glob<string>('./workflow-core/source.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const adapter = import.meta.glob<string>('../../../apps/server/src/adapters/workflow-core/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const nameOf = (path: string) => /([\w-]+)\.schema\.json$/.exec(path)?.[1] ?? '';
const camel = (name: string) => name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

describe('types du socle (workflow-core)', () => {
  it('les types du socle sont ceux que génère son JSON Schema', () => {
    // The copies carry the commit of the core they come from.
    const from = JSON.parse(Object.values(source)[0] ?? '{}') as {
      repository?: string;
      commit?: string;
      schemas?: string[];
    };
    expect(from.repository).toBe('code-my-life/workflow-core');
    expect(from.commit).toMatch(/^[0-9a-f]{40}$/);
    const names = Object.keys(copies).map(nameOf).sort();
    expect(names).toEqual([...(from.schemas ?? [])].sort());

    for (const [path, text] of Object.entries(copies)) {
      const name = nameOf(path);
      // Each copy has its generated types, which name it; regenerating them identically is checked by
      // `npm run types:core -- --check` (verify:fast), which needs json-schema-to-typescript.
      const types = generated[`./workflow-core/generated/${name}.ts`];
      expect(types, name).toContain(
        `from schema/${name}.schema.json of workflow-core: do not edit.`,
      );
      // The runtime check is built from the very same schema.
      expect((values as Record<string, unknown>)[`${camel(name)}Schema`], name).toEqual(
        JSON.parse(text),
      );
    }

    // The adapter of the core declares no type of response by hand: they all come from the generated ones.
    expect(Object.keys(adapter).length).toBeGreaterThan(0);
    for (const [file, code] of Object.entries(adapter)) {
      if (file.endsWith('.test.ts')) continue;
      expect(code, file).not.toMatch(/(interface|type) \w*(Response|Item|Event|Sheet)\b/);
      expect(code, file).not.toMatch(/z\.object\(/);
    }
  });

  it('la validation à l’exécution vient du même JSON Schema', () => {
    expect(coreItems.safeParse({ schema_version: 1, workflow: 'factory', items: [] }).success).toBe(
      true,
    );
    expect(coreItems.safeParse({ schema_version: 2, workflow: 'factory', items: [] }).success).toBe(
      false,
    );
    expect(
      coreItems.safeParse({ schema_version: 1, workflow: 'factory', items: [{ id: 't' }] }).success,
    ).toBe(false);
    expect(coreSheetResponse.safeParse({ schema_version: 1, workflow: 'factory' }).success).toBe(
      false,
    );
  });
});
