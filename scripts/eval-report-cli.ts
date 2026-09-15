#!/usr/bin/env tsx

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview CLI entry point to summarize eval report.json files.
 *
 * Scans a directory for report.json files, groups them by model name,
 * and prints pass rate summaries. Integrates with static inventory data
 * to display static policies.
 *
 * Usage:
 *   npm run eval:report
 *   npm run eval:report -- <reports-directory> [--json] [--root <repo-root>]
 */

import path from 'node:path';
import fs from 'node:fs';
import { collectInventory } from './utils/eval-inventory.js';
import {
  summarizeReports,
  formatReportSummary,
  formatReportSummaryJson,
} from './utils/eval-report.js';

async function main() {
  const args = process.argv.slice(2);

  const jsonFlagIndex = args.indexOf('--json');
  const jsonMode = jsonFlagIndex !== -1;
  if (jsonMode) args.splice(jsonFlagIndex, 1);

  const rootFlagIndex = args.indexOf('--root');
  let repoRoot: string | undefined;
  if (rootFlagIndex !== -1) {
    repoRoot = args[rootFlagIndex + 1];
    if (repoRoot === undefined || repoRoot.startsWith('--')) {
      console.error('Error: --root requires a valid directory path.');
      process.exit(1);
    }
    args.splice(rootFlagIndex, 2);
  }

  const resolvedRoot = repoRoot ? path.resolve(repoRoot) : process.cwd();

  // The first positional argument is the directory of reports
  const reportsDirArg = args.find((a) => !a.startsWith('--'));
  const reportsDir = reportsDirArg
    ? path.resolve(reportsDirArg)
    : path.join(resolvedRoot, 'evals', 'logs');

  if (!fs.existsSync(reportsDir)) {
    console.error(`Error: Reports directory does not exist: ${reportsDir}`);
    process.exit(1);
  }

  // Try to load inventory if available to match policies
  let inventory;
  try {
    inventory = await collectInventory(resolvedRoot);
  } catch {
    // If inventory fails to load (e.g. running outside repo), proceed without it
  }

  const summary = await summarizeReports(reportsDir, inventory);

  if (jsonMode) {
    console.log(formatReportSummaryJson(summary, resolvedRoot));
  } else {
    console.log(formatReportSummary(summary, resolvedRoot));
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
