#!/usr/bin/env tsx

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview CLI entry point for the eval validate command.
 *
 * Usage:
 *   npm run eval:validate
 *   npm run eval:validate -- --json
 *   npm run eval:validate -- --root /path/to/repo
 *   npm run eval:validate -- evals/some-file.eval.ts [--json]
 */

import path from 'node:path';
import { collectInventory } from './utils/eval-inventory.js';
import { buildToolRegistry } from './utils/tool-registry.js';
import {
  validateInventory,
  formatValidationReport,
  formatValidationJson,
} from './utils/eval-validate.js';

async function main() {
  const args = process.argv.slice(2);

  const rootFlagIndex = args.indexOf('--root');
  let repoRoot: string | undefined;
  if (rootFlagIndex !== -1) {
    repoRoot = args[rootFlagIndex + 1];
    if (repoRoot === undefined) {
      console.error(
        'Error: --root requires a directory path argument but none was provided.',
      );
      process.exit(1);
    }
    if (repoRoot.startsWith('--')) {
      console.error(
        `Error: --root value "${repoRoot}" looks like a flag. Provide a valid directory path.`,
      );
      process.exit(1);
    }
    args.splice(rootFlagIndex, 2);
  }

  const resolvedRoot = repoRoot ? path.resolve(repoRoot) : process.cwd();

  const jsonFlagIndex = args.indexOf('--json');
  const jsonMode = jsonFlagIndex !== -1;
  if (jsonMode) args.splice(jsonFlagIndex, 1);

  const filePaths = args.filter((a) => !a.startsWith('--'));

  const inventory = await collectInventory(resolvedRoot);

  if (inventory.totalFiles === 0) {
    console.error('No eval files found under evals/.');
    process.exit(1);
  }

  const registry = buildToolRegistry();
  const result = validateInventory(inventory, registry, {
    filePaths: filePaths.length > 0 ? filePaths : undefined,
  });

  if (result.unmatchedFilePaths && result.unmatchedFilePaths.length > 0) {
    console.error(
      'Error: The following requested file(s) were not found or did not contain any eval cases:',
    );
    for (const f of result.unmatchedFilePaths) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }

  if (jsonMode) {
    console.log(formatValidationJson(result, resolvedRoot));
  } else {
    console.log(formatValidationReport(result, resolvedRoot));
  }

  if (result.totalViolations > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
