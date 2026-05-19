/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import eslintConfig from '../../eslint.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// ESLint normalizes string severities to numbers when computing the effective
// config, so we accept either form to keep assertions resilient.
const ERROR_SEVERITIES = ['error', 2];
const OFF_SEVERITIES = ['off', 0];

let eslint;
beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot });
});

function flatten(config) {
  const out = [];
  const visit = (entry) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    out.push(entry);
  };
  visit(config);
  return out;
}

const blocks = flatten(eslintConfig);

function findBlocksTargeting(filePattern) {
  return blocks.filter(
    (b) => Array.isArray(b.files) && b.files.includes(filePattern),
  );
}

function findRuleAcrossBlocks(matchedBlocks, ruleName) {
  for (const block of matchedBlocks) {
    const rule = block.rules?.[ruleName];
    if (rule) return { block, rule };
  }
  return null;
}

async function effectiveConfigFor(relativePath) {
  return eslint.calculateConfigForFile(path.resolve(repoRoot, relativePath));
}

describe('eslint.config: security boundary source rule', () => {
  // This block asserts the *source* rule definition for packages/*/src/**.
  // It guarantees that whoever edits eslint.config.js cannot silently drop
  // the node:os / os homedir+tmpdir restriction from the canonical block.
  // Note: per-package self-import blocks (core/cli/sdk) currently OVERRIDE
  // this rule because ESLint flat config replaces (not merges) rule values.
  // See the effective-config tests below for what is actually enforced.
  it('the canonical packages/*/src block forbids homedir/tmpdir from node:os and os', () => {
    const matched = findBlocksTargeting('packages/*/src/**/*.{ts,tsx}');
    expect(matched.length).toBeGreaterThan(0);

    const found = findRuleAcrossBlocks(matched, 'no-restricted-imports');
    expect(found).not.toBeNull();

    const [severity, options] = found.rule;
    expect(severity).toBe('error');
    expect(options.paths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'node:os',
          importNames: expect.arrayContaining(['homedir', 'tmpdir']),
        }),
        expect.objectContaining({
          name: 'os',
          importNames: expect.arrayContaining(['homedir', 'tmpdir']),
        }),
      ]),
    );
  });
});

describe('eslint.config: effective no-restricted-imports', () => {
  // We verify the effective rule that ESLint actually enforces, so the test
  // catches regressions even if a later block overrides an earlier one.
  it('packages/a2a-server/src product code enforces the node:os homedir+tmpdir restriction', async () => {
    const cfg = await effectiveConfigFor('packages/a2a-server/src/foo.ts');
    const rule = cfg.rules?.['no-restricted-imports'];
    expect(rule).toBeDefined();
    const [severity, options] = rule;
    expect(ERROR_SEVERITIES).toContain(severity);
    expect(options.paths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'node:os',
          importNames: expect.arrayContaining(['homedir', 'tmpdir']),
        }),
        expect.objectContaining({
          name: 'os',
          importNames: expect.arrayContaining(['homedir', 'tmpdir']),
        }),
      ]),
    );
  });

  // Known limitation: packages/core, packages/cli, and packages/sdk each have
  // a self-import block that ESLint applies AFTER the canonical block. Because
  // flat config replaces (does not merge) rule values, the effective
  // no-restricted-imports for those product sources currently contains only
  // the self-import restriction; the node:os/os homedir+tmpdir paths are lost.
  //
  // The assertions below document that observed effective behavior so any
  // attempt to fix the override (e.g. merging paths into the self-import
  // blocks) will flip them red and force the contributor to extend coverage
  // here. Once the override is fixed, switch these to the same arrayContaining
  // assertion used for a2a-server above.
  const selfImportOnlyCases = [
    {
      file: 'packages/core/src/foo.ts',
      selfImport: '@google/gemini-cli-core',
    },
    { file: 'packages/cli/src/foo.ts', selfImport: '@google/gemini-cli' },
    { file: 'packages/sdk/src/foo.ts', selfImport: '@google/gemini-cli-sdk' },
  ];

  it.each(selfImportOnlyCases)(
    '$file effective rule is currently overridden to only the self-import restriction (known bug)',
    async ({ file, selfImport }) => {
      const cfg = await effectiveConfigFor(file);
      const rule = cfg.rules?.['no-restricted-imports'];
      expect(rule).toBeDefined();
      const [severity, options] = rule;
      expect(ERROR_SEVERITIES).toContain(severity);
      // The override block doesn't wrap its single entry in a `paths` array,
      // so the options object is the entry itself.
      expect(options.name).toBe(selfImport);
    },
  );

  // Test files that don't sit inside packages/core/cli/sdk/src keep their
  // 'off' override, since no later self-import block re-touches them. Files
  // inside core/cli/sdk product source (including their tests and paths.ts)
  // are silently re-restricted by the self-import block — see the known-bug
  // cases above.
  const offCases = ['packages/a2a-server/src/foo.test.ts'];

  it.each(offCases)(
    '%s relaxes no-restricted-imports so helpers and tests can call os.homedir()',
    async (file) => {
      const cfg = await effectiveConfigFor(file);
      const rule = cfg.rules?.['no-restricted-imports'];
      const severity = Array.isArray(rule) ? rule[0] : rule;
      expect(OFF_SEVERITIES).toContain(severity);
    },
  );
});

describe('eslint.config: license header enforcement', () => {
  it('enforces an Apache-2.0 Google license header on every TS/JS/CJS source file', () => {
    const headerBlock = blocks.find(
      (b) =>
        Array.isArray(b.files) &&
        b.files.includes('./**/*.{tsx,ts,js,cjs}') &&
        b.rules?.['headers/header-format'],
    );
    expect(headerBlock).toBeDefined();

    const [severity, options] = headerBlock.rules['headers/header-format'];
    expect(severity).toBe('error');
    expect(options.source).toBe('string');
    expect(options.content).toContain('@license');
    expect(options.content).toContain('Google LLC');
    expect(options.content).toContain('SPDX-License-Identifier: Apache-2.0');
  });

  it('the header rule is active in the effective config for product source', async () => {
    const cfg = await effectiveConfigFor('packages/core/src/foo.ts');
    const rule = cfg.rules?.['headers/header-format'];
    expect(rule).toBeDefined();
    expect(ERROR_SEVERITIES).toContain(rule[0]);
  });

  it('enforces node: protocol usage on built-in module imports', async () => {
    const cfg = await effectiveConfigFor('packages/core/src/foo.ts');
    const rule = cfg.rules?.['import/enforce-node-protocol-usage'];
    expect(rule).toBeDefined();
    const [severity, mode] = rule;
    expect(ERROR_SEVERITIES).toContain(severity);
    expect(mode).toBe('always');
  });
});

describe('eslint.config: common restricted-syntax rules', () => {
  it('forbids require(), throwing literals, and underscored catch identifiers in product source', async () => {
    const cfg = await effectiveConfigFor('packages/core/src/foo.ts');
    const rule = cfg.rules?.['no-restricted-syntax'];
    expect(rule).toBeDefined();
    const [, ...selectors] = rule;
    expect(selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: 'CallExpression[callee.name="require"]',
        }),
        expect.objectContaining({
          selector: 'CatchClause > Identifier[name=/^_/]',
        }),
      ]),
    );
    expect(
      selectors.some((s) => s.selector?.startsWith('ThrowStatement')),
    ).toBe(true);
  });
});

describe('eslint.config: typescript safety in product code', () => {
  it.each([
    '@typescript-eslint/no-unsafe-type-assertion',
    '@typescript-eslint/no-unsafe-assignment',
    '@typescript-eslint/no-unsafe-return',
  ])('%s is enforced in non-test product code', async (ruleName) => {
    const cfg = await effectiveConfigFor('packages/core/src/foo.ts');
    const rule = cfg.rules?.[ruleName];
    expect(rule).toBeDefined();
    const severity = Array.isArray(rule) ? rule[0] : rule;
    expect(ERROR_SEVERITIES).toContain(severity);
  });
});
