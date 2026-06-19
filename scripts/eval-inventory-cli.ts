#!/usr/bin/env tsx

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview CLI entry point for the eval inventory command.
 *
 * Scans all eval source files, runs the static analyzer on each,
 * and prints a human-readable inventory report grouped by policy,
 * file, and suite.
 *
 * Usage:
 *   npm run eval:inventory
 *   npm run eval:inventory -- --root /path/to/repo
 */

import {
  collectInventory,
  formatInventoryReport,
} from './utils/eval-inventory.js';

async function main() {
  const rootFlagIndex = process.argv.indexOf('--root');
  const repoRoot =
    rootFlagIndex !== -1 && process.argv[rootFlagIndex + 1]
      ? process.argv[rootFlagIndex + 1]
      : process.cwd();

  const result = await collectInventory(repoRoot);

  if (result.totalFiles === 0) {
    console.error('No eval files found under evals/.');
    process.exit(1);
  }

  console.log(formatInventoryReport(result));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
