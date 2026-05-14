/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';

// eslint.config.js imports a large dependency graph (typescript-eslint,
// eslint-plugin-react, headers, etc.) and parses TS projectService-aware
// settings. We deliberately `await import` the real module so the tests
// validate the actual shipped configuration, not a stub.
type FlatConfigEntry = {
  files?: string[];
  ignores?: string[];
  rules?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
  languageOptions?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  name?: string;
};

let config: FlatConfigEntry[];

beforeAll(async () => {
  const mod = (await import('../../eslint.config.js')) as {
    default: FlatConfigEntry[];
  };
  config = mod.default;
});

function findEntries(
  predicate: (entry: FlatConfigEntry) => boolean,
): FlatConfigEntry[] {
  return config.filter(predicate);
}

describe('eslint.config shape', () => {
  it('is a non-empty flat-config array', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('declares a global-ignores entry covering build output directories', () => {
    const globalIgnoreEntry = config.find(
      (entry) =>
        Array.isArray(entry.ignores) &&
        !entry.files &&
        !entry.rules &&
        !entry.plugins,
    );
    expect(globalIgnoreEntry).toBeDefined();
    const ignores = globalIgnoreEntry!.ignores!;
    expect(ignores).toContain('**/node_modules/**');
    expect(ignores).toContain('bundle/**');
    expect(ignores).toContain('dist/**');
    expect(ignores).toContain('**/coverage/**');
  });
});

describe('eslint.config security rules', () => {
  it('blocks node:os homedir/tmpdir via no-restricted-imports', () => {
    const hit = findEntries((entry) => {
      const rule = entry.rules?.['no-restricted-imports'];
      if (!Array.isArray(rule)) return false;
      const [level, options] = rule as [
        string,
        { paths?: unknown[] } | undefined,
      ];
      if (level !== 'error') return false;
      const paths = (options?.paths ?? []) as Array<{
        name?: string;
        importNames?: string[];
      }>;
      return paths.some(
        (p) =>
          p.name === 'node:os' &&
          Array.isArray(p.importNames) &&
          p.importNames.includes('homedir') &&
          p.importNames.includes('tmpdir'),
      );
    });
    expect(hit.length).toBeGreaterThan(0);
  });

  it('also blocks the bare "os" specifier for the same imports (defense in depth)', () => {
    const hit = findEntries((entry) => {
      const rule = entry.rules?.['no-restricted-imports'];
      if (!Array.isArray(rule)) return false;
      const [, options] = rule as [string, { paths?: unknown[] } | undefined];
      const paths = (options?.paths ?? []) as Array<{
        name?: string;
        importNames?: string[];
      }>;
      return paths.some(
        (p) =>
          p.name === 'os' &&
          Array.isArray(p.importNames) &&
          p.importNames.includes('homedir') &&
          p.importNames.includes('tmpdir'),
      );
    });
    expect(hit.length).toBeGreaterThan(0);
  });
});

describe('eslint.config production safety rules', () => {
  it('enforces no-debugger as an error somewhere in the config', () => {
    const hit = findEntries(
      (entry) => entry.rules?.['no-debugger'] === 'error',
    );
    expect(hit.length).toBeGreaterThan(0);
  });

  it('enforces no-console as an error somewhere in the config', () => {
    const hit = findEntries((entry) => entry.rules?.['no-console'] === 'error');
    expect(hit.length).toBeGreaterThan(0);
  });
});

describe('eslint.config license header rule', () => {
  it('requires Apache-2.0 license headers via headers/header-format', () => {
    const hit = findEntries((entry) => {
      const rule = entry.rules?.['headers/header-format'];
      if (!Array.isArray(rule)) return false;
      const [level, options] = rule as [
        string,
        { content?: string } | undefined,
      ];
      if (level !== 'error') return false;
      return (
        typeof options?.content === 'string' &&
        options.content.includes('SPDX-License-Identifier: Apache-2.0')
      );
    });
    expect(hit.length).toBeGreaterThan(0);
  });
});

describe('eslint.config node: protocol rule', () => {
  it('enforces import/enforce-node-protocol-usage as an error', () => {
    const hit = findEntries((entry) => {
      const rule = entry.rules?.['import/enforce-node-protocol-usage'];
      if (!Array.isArray(rule)) return false;
      const [level, mode] = rule as [string, string | undefined];
      return level === 'error' && mode === 'always';
    });
    expect(hit.length).toBeGreaterThan(0);
  });
});
