/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import eslintConfig from '../../eslint.config.js';

// ── helpers ──────────────────────────────────────────────────────────────────

type FlatConfigEntry = {
  files?: string[];
  ignores?: string[];
  rules?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  languageOptions?: Record<string, unknown>;
};

const configArray = eslintConfig as FlatConfigEntry[];

/** Return every config entry whose `files` array contains `pattern`. */
function findByFile(pattern: string): FlatConfigEntry[] {
  return configArray.filter((entry) =>
    entry.files?.some((f) => f === pattern || f.includes(pattern)),
  );
}

/** Return entries whose `files` match *and* that carry a specific rule key. */
function findRuleForFile(
  filePattern: string,
  ruleName: string,
): FlatConfigEntry | undefined {
  return findByFile(filePattern).find(
    (entry) => entry.rules && ruleName in entry.rules,
  );
}

/** Collect all entries that have the given rule defined, regardless of files. */
function findAllWithRule(ruleName: string): FlatConfigEntry[] {
  return configArray.filter((entry) => entry.rules && ruleName in entry.rules);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('eslint configuration', () => {
  // ── 1. Security: node:os import restrictions ────────────────────────────
  describe('node:os import restrictions', () => {
    const entry = findRuleForFile(
      'packages/*/src/**/*.{ts,tsx}',
      'no-restricted-imports',
    );

    it('has a no-restricted-imports rule for source files', () => {
      expect(entry).toBeDefined();
    });

    it('blocks homedir and tmpdir from node:os', () => {
      const rule = entry!.rules!['no-restricted-imports'] as [
        string,
        { paths: Array<{ name: string; importNames?: string[] }> },
      ];
      const nodeOsPath = rule[1].paths.find((p) => p.name === 'node:os');

      expect(nodeOsPath).toBeDefined();
      expect(nodeOsPath).toHaveProperty('importNames');
      expect(nodeOsPath!.importNames).toContain('homedir');
      expect(nodeOsPath!.importNames).toContain('tmpdir');
    });

    it('blocks homedir and tmpdir from bare os specifier', () => {
      const rule = entry!.rules!['no-restricted-imports'] as [
        string,
        { paths: Array<{ name: string; importNames?: string[] }> },
      ];
      const osPath = rule[1].paths.find((p) => p.name === 'os');

      expect(osPath).toBeDefined();
      expect(osPath).toHaveProperty('importNames');
      expect(osPath!.importNames).toContain('homedir');
      expect(osPath!.importNames).toContain('tmpdir');
    });

    it('provides a helpful message directing to the core helpers', () => {
      const rule = entry!.rules!['no-restricted-imports'] as [
        string,
        { paths: Array<{ name: string; message?: string }> },
      ];
      for (const pathEntry of rule[1].paths) {
        expect(pathEntry).toHaveProperty('message');
        expect(typeof pathEntry.message).toBe('string');
        expect(pathEntry.message).toContain('@google/gemini-cli-core');
      }
    });
  });

  // ── 2. Security exceptions for tests & paths.ts ─────────────────────────
  describe('no-restricted-imports exceptions', () => {
    // The exception block turns off no-restricted-imports for specific files
    const exceptionEntries = configArray.filter(
      (entry) =>
        entry.rules?.['no-restricted-imports'] === 'off' && entry.files,
    );

    it('has an exception config that turns off the restriction', () => {
      expect(exceptionEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('allows os imports in test files', () => {
      const files = exceptionEntries.flatMap((e) => e.files ?? []);
      expect(files).toContain('**/*.test.ts');
      expect(files).toContain('**/*.test.tsx');
    });

    it('allows os imports in paths.ts helper', () => {
      const files = exceptionEntries.flatMap((e) => e.files ?? []);
      expect(files).toContain('packages/core/src/utils/paths.ts');
    });

    it('allows os imports in scripts', () => {
      const files = exceptionEntries.flatMap((e) => e.files ?? []);
      expect(files).toContain('scripts/**/*.js');
    });
  });

  // ── 3. License header enforcement ──────────────────────────────────────
  describe('license header enforcement', () => {
    const headerEntries = findAllWithRule('headers/header-format');

    it('has the headers/header-format rule configured', () => {
      expect(headerEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('enforces the Apache-2.0 license content', () => {
      const entry = headerEntries[0];
      const rule = entry.rules!['headers/header-format'] as [
        string,
        { source?: string; content?: string },
      ];

      expect(rule[0]).toBe('error');
      expect(rule[1]).toHaveProperty('source', 'string');
      expect(rule[1]).toHaveProperty(
        'content',
        [
          '@license',
          'Copyright (year) Google LLC',
          'SPDX-License-Identifier: Apache-2.0',
        ].join('\n'),
      );
    });

    it('has a year pattern covering 2025 through the current year', () => {
      const currentYear = new Date().getFullYear();
      const entry = headerEntries[0];
      const rule = entry.rules!['headers/header-format'] as [
        string,
        {
          patterns?: {
            year?: { pattern?: string; defaultValue?: string };
          };
        },
      ];

      expect(rule[1]).toHaveProperty('patterns');
      expect(rule[1].patterns).toHaveProperty('year');
      expect(rule[1].patterns!.year).toHaveProperty(
        'pattern',
        `202[5-${currentYear.toString().slice(-1)}]`,
      );
      expect(rule[1].patterns!.year).toHaveProperty(
        'defaultValue',
        currentYear.toString(),
      );
    });

    it('applies to ts, tsx, js, and cjs files', () => {
      const entry = headerEntries[0];
      expect(entry).toHaveProperty('files');
      expect(entry.files!.length).toBeGreaterThan(0);

      const filePattern = entry.files!.join(',');
      expect(filePattern).toContain('ts');
      expect(filePattern).toContain('js');
      expect(filePattern).toContain('cjs');
    });
  });

  // ── 4. Self-import prevention ──────────────────────────────────────────
  describe('self-import prevention', () => {
    /**
     * Find a config entry for self-import prevention. Uses two strategies:
     * 1. By exact file pattern (catches when name/rules are broken)
     * 2. By restricted package name (catches when files is broken)
     * If neither finds anything, the whole block is missing.
     */
    function findSelfImportEntry(
      filePattern: string,
      pkgName: string,
    ): FlatConfigEntry | undefined {
      // Strategy 1: match by exact file pattern
      const byFiles = configArray.find((entry) =>
        entry.files?.includes(filePattern),
      );
      if (byFiles) return byFiles;

      // Strategy 2: match by restricted package name inside the rule
      return configArray.find((entry) => {
        const rule = entry.rules?.['no-restricted-imports'];
        return (
          Array.isArray(rule) &&
          (rule as [string, { name?: string }])[1]?.name === pkgName
        );
      });
    }

    it('prevents @google/gemini-cli-core self-imports in core package', () => {
      const entry = findSelfImportEntry(
        'packages/core/src/**/*.{ts,tsx}',
        '@google/gemini-cli-core',
      );
      expect(
        entry,
        'Expected a config block with files: ["packages/core/src/**/*.{ts,tsx}"] and no-restricted-imports for "@google/gemini-cli-core"',
      ).toBeDefined();
      expect(entry).toHaveProperty('files', [
        'packages/core/src/**/*.{ts,tsx}',
      ]);
      expect(entry).toHaveProperty('rules');
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports'],
        [
          'error',
          {
            name: '@google/gemini-cli-core',
            message:
              'Please use relative imports within the @google/gemini-cli-core package.',
          },
        ],
      );
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 0],
        'error',
      );
      expect(entry).toHaveProperty(['rules', 'no-restricted-imports', 1], {
        name: '@google/gemini-cli-core',
        message:
          'Please use relative imports within the @google/gemini-cli-core package.',
      });
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 1, 'name'],
        '@google/gemini-cli-core',
      );
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 1, 'message'],
        'Please use relative imports within the @google/gemini-cli-core package.',
      );
    });

    it('prevents @google/gemini-cli self-imports in cli package', () => {
      const entry = findSelfImportEntry(
        'packages/cli/src/**/*.{ts,tsx}',
        '@google/gemini-cli',
      );
      expect(
        entry,
        'Expected a config block with files: ["packages/cli/src/**/*.{ts,tsx}"] and no-restricted-imports for "@google/gemini-cli"',
      ).toBeDefined();
      expect(entry).toHaveProperty('files', ['packages/cli/src/**/*.{ts,tsx}']);
      expect(entry).toHaveProperty('rules');
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports'],
        [
          'error',
          {
            name: '@google/gemini-cli',
            message:
              'Please use relative imports within the @google/gemini-cli package.',
          },
        ],
      );
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 0],
        'error',
      );
      expect(entry).toHaveProperty(['rules', 'no-restricted-imports', 1], {
        name: '@google/gemini-cli',
        message:
          'Please use relative imports within the @google/gemini-cli package.',
      });
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 1, 'name'],
        '@google/gemini-cli',
      );
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 1, 'message'],
        'Please use relative imports within the @google/gemini-cli package.',
      );
    });

    it('prevents @google/gemini-cli-sdk self-imports in sdk package', () => {
      const entry = findSelfImportEntry(
        'packages/sdk/src/**/*.{ts,tsx}',
        '@google/gemini-cli-sdk',
      );
      expect(
        entry,
        'Expected a config block with files: ["packages/sdk/src/**/*.{ts,tsx}"] and no-restricted-imports for "@google/gemini-cli-sdk"',
      ).toBeDefined();
      expect(entry).toHaveProperty('files', ['packages/sdk/src/**/*.{ts,tsx}']);
      expect(entry).toHaveProperty('rules');
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports'],
        [
          'error',
          {
            name: '@google/gemini-cli-sdk',
            message:
              'Please use relative imports within the @google/gemini-cli-sdk package.',
          },
        ],
      );
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 0],
        'error',
      );
      expect(entry).toHaveProperty(['rules', 'no-restricted-imports', 1], {
        name: '@google/gemini-cli-sdk',
        message:
          'Please use relative imports within the @google/gemini-cli-sdk package.',
      });
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 1, 'name'],
        '@google/gemini-cli-sdk',
      );
      expect(entry).toHaveProperty(
        ['rules', 'no-restricted-imports', 1, 'message'],
        'Please use relative imports within the @google/gemini-cli-sdk package.',
      );
    });
  });

  // ── 5. Node protocol enforcement ───────────────────────────────────────
  describe('node protocol enforcement', () => {
    // Find the config block that provides the import plugin
    const entry = configArray.find(
      (entry) => entry.plugins && 'import' in entry.plugins,
    );

    it('has the enforce-node-protocol-usage rule', () => {
      expect(
        entry,
        'Expected a config block that defines the import plugin',
      ).toBeDefined();
      expect(entry).toHaveProperty('rules');
      expect(entry).toHaveProperty([
        'rules',
        'import/enforce-node-protocol-usage',
      ]);
    });

    it('requires node: protocol always', () => {
      expect(
        entry,
        'Expected a config block that defines the import plugin',
      ).toBeDefined();
      expect(entry).toHaveProperty(
        ['rules', 'import/enforce-node-protocol-usage'],
        ['error', 'always'],
      );
    });
  });

  // ── 6. Production-only safety rules ────────────────────────────────────
  describe('production-only safety rules', () => {
    // Find the config block that targets source files and contains
    // production-only safety rules like no-unsafe-assignment
    const productionEntry = configArray.find(
      (entry) =>
        entry.files?.some((f) => f.includes('packages/*/src/**')) &&
        (entry.rules?.['@typescript-eslint/no-unsafe-assignment'] ||
          entry.rules?.['@typescript-eslint/no-unsafe-type-assertion']),
    );

    it('has a production-only config block excluding test files', () => {
      expect(
        productionEntry,
        'Expected a config block that targets source files but ignores test files',
      ).toBeDefined();
      expect(productionEntry).toHaveProperty('ignores');
      expect(productionEntry!.ignores).toContain('**/*.test.ts');
      expect(productionEntry!.ignores).toContain('**/*.test.tsx');
    });

    it('enforces no-unsafe-type-assertion as error', () => {
      expect(
        productionEntry,
        'Expected a config block that targets source files but ignores test files',
      ).toBeDefined();
      expect(productionEntry).toHaveProperty(
        ['rules', '@typescript-eslint/no-unsafe-type-assertion'],
        'error',
      );
    });

    it('enforces no-unsafe-assignment as error', () => {
      expect(
        productionEntry,
        'Expected a config block that targets source files but ignores test files',
      ).toBeDefined();
      expect(productionEntry).toHaveProperty(
        ['rules', '@typescript-eslint/no-unsafe-assignment'],
        'error',
      );
    });
  });

  // ── 7. Configuration structure ──────────────────────────────────────────
  describe('configuration structure', () => {
    it('exports a non-empty flat config array', () => {
      expect(Array.isArray(eslintConfig)).toBe(true);
      expect(configArray.length).toBeGreaterThan(0);
    });

    it('has global ignores for build artifacts and node_modules', () => {
      const ignoreEntries = configArray.filter(
        (entry) =>
          entry.ignores &&
          !entry.files &&
          entry.ignores.some((i) => i.includes('node_modules')),
      );
      expect(ignoreEntries.length).toBeGreaterThanOrEqual(1);

      const ignores = ignoreEntries.flatMap((e) => e.ignores ?? []);
      expect(ignores).toContain('node_modules/*');
      expect(ignores.some((i) => i.includes('dist'))).toBe(true);
      expect(ignores.some((i) => i.includes('bundle'))).toBe(true);
    });
  });
});
