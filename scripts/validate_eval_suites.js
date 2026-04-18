/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const SUITES_PATH = 'evals/suites.json';
const EVALS_DIR = 'evals';

/**
 * Validates that all eval files are mapped in suites.json and that there are no overlaps.
 */
function main() {
  if (!fs.existsSync(SUITES_PATH)) {
    console.error(`❌ Error: ${SUITES_PATH} not found.`);
    process.exit(1);
  }

  const suitesConfig = JSON.parse(fs.readFileSync(SUITES_PATH, 'utf-8'));
  const allowedOverlaps = new Set(suitesConfig.allowedOverlaps || []);
  const evalFilesOnDisk = fs
    .readdirSync(EVALS_DIR)
    .filter((f) => f.endsWith('.eval.ts'))
    .map((f) => path.join(EVALS_DIR, f));

  const evalToSuiteMap = new Map();
  const errors = [];

  // 1. Map evals to suites and check for overlaps/trigger-coverage
  for (const [suiteName, suite] of Object.entries(suitesConfig)) {
    if (suiteName === 'allowedOverlaps' || !suite.evals) continue;

    for (const evalFile of suite.evals) {
      if (evalFile === 'ALL_ALWAYS_PASSING') continue;

      if (!fs.existsSync(evalFile)) {
        errors.push(
          `Suite **${suiteName}** references non-existent file: **${evalFile}**`,
        );
        continue;
      }

      // Check if the eval file itself is in the suite's trigger patterns
      if (!suite.patterns || !suite.patterns.includes(evalFile)) {
        errors.push(
          `Trigger coverage missing: **${evalFile}** is in the **${suiteName}** suite but is missing from its **patterns** array. (Changes to the test won't trigger itself correctly).`,
        );
      }

      if (evalToSuiteMap.has(evalFile) && !allowedOverlaps.has(evalFile)) {
        errors.push(
          `Overlap detected: **${evalFile}** is present in both **${evalToSuiteMap.get(evalFile)}** and **${suiteName}** suites.`,
        );
      } else {
        const existingSuites = evalToSuiteMap.get(evalFile) || [];
        evalToSuiteMap.set(
          evalFile,
          Array.isArray(existingSuites)
            ? [...existingSuites, suiteName]
            : [existingSuites, suiteName],
        );
      }
    }
  }

  // 2. Check for orphaned evals (on disk but not in suites.json)
  for (const diskFile of evalFilesOnDisk) {
    if (!evalToSuiteMap.has(diskFile)) {
      errors.push(
        `Orphaned eval detected: **${diskFile}** is not mapped to any suite in ${SUITES_PATH}.`,
      );
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Eval Suite Validation Failed:');
    errors.forEach((err) => console.error(`  - ${err}`));

    const hasOverlap = errors.some((err) => err.includes('Overlap detected'));
    if (hasOverlap) {
      console.error(
        `\n💡 Tip: If this overlap is intentional, add the file path to the 'allowedOverlaps' list in ${SUITES_PATH}.`,
      );
    } else {
      console.error(`\n💡 Tip: Update ${SUITES_PATH} to resolve these issues.`);
    }
    process.exit(1);
  }

  console.log(
    '✅ Eval Suite Validation Passed: All files mapped and no overlaps found.',
  );
}

main();
