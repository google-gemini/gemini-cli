#!/usr/bin/env tsx

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { collectInventory } from './utils/eval-inventory.js';
import { buildToolRegistry } from './utils/tool-registry.js';
import {
  computeCoverage,
  formatCoverageReport,
} from './utils/eval-coverage.js';

async function main() {
  const rootFlagIndex = process.argv.indexOf('--root');
  const rootFlagValue =
    rootFlagIndex !== -1 ? process.argv[rootFlagIndex + 1] : undefined;

  if (rootFlagIndex !== -1 && rootFlagValue === undefined) {
    console.error(
      'Error: --root requires a directory path argument but none was provided.',
    );
    process.exit(1);
  }
  if (rootFlagValue && rootFlagValue.startsWith('--')) {
    console.error(
      `Error: --root value "${rootFlagValue}" looks like a flag. Provide a valid directory path.`,
    );
    process.exit(1);
  }

  const repoRoot = rootFlagValue ?? process.cwd();
  const inventory = await collectInventory(repoRoot);

  if (inventory.totalFiles === 0) {
    console.error('No eval files found under evals/.');
    process.exit(1);
  }

  const registry = buildToolRegistry();
  const result = computeCoverage(inventory, registry);

  console.log(formatCoverageReport(result));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
