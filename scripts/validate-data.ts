/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Scenario } from '../packages/core/src/evals/schema.ts';

const MANIFEST_FILE = 'data/manifest.json';
const DEFAULT_DATA_DIR = 'data';

async function validateFile(
  filePath: string,
  manifest: {
    data_inventory: {
      file_descriptions: Record<string, string>;
      tools: Record<string, unknown>;
      target_samples_per_tool: number;
      overrides: Record<string, number>;
    };
    optimization_constraints: { immutable_tokens: string[] };
  },
): Promise<{ success: boolean; counts: Record<string, number> }> {
  const description =
    manifest.data_inventory.file_descriptions?.[filePath] ||
    'No description available.';
  console.log(`\n🔍 Validating: ${filePath}`);
  console.log(`   Purpose: ${description}`);

  const immutableTools = new Set(
    manifest.optimization_constraints.immutable_tokens,
  );
  const toolCounts: Record<string, number> = {};

  // Initialize counts for all known tools
  Object.keys(manifest.data_inventory.tools).forEach((tool) => {
    toolCounts[tool] = 0;
  });

  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  let hasErrors = false;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    try {
      const scenario: Scenario = JSON.parse(line) as Scenario;

      if (
        !scenario.id ||
        !scenario.input ||
        !scenario.expected ||
        !scenario.negatives
      ) {
        throw new Error(
          `Missing required fields in scenario ${scenario.id || 'at line ' + lineNum}`,
        );
      }

      scenario.expected.tool_calls.forEach((tc) => {
        if (!immutableTools.has(tc.name)) {
          console.error(
            `  ❌ Line ${lineNum}: Unknown tool "${tc.name}" in expected output.`,
          );
          hasErrors = true;
        } else {
          toolCounts[tc.name]++;
        }
      });

      scenario.negatives.forEach((neg) => {
        neg.tool_calls.forEach((tc) => {
          if (!immutableTools.has(tc.name)) {
            console.error(
              `  ❌ Line ${lineNum}: Unknown tool "${tc.name}" in negative example.`,
            );
            hasErrors = true;
          }
        });
      });
    } catch (e) {
      console.error(
        `  ❌ Line ${lineNum}: Invalid JSON or Schema.`,
        e instanceof Error ? e.message : e,
      );
      hasErrors = true;
    }
  });

  if (!hasErrors) {
    console.log(`  ✅ ${lines.length} scenarios validated successfully.`);
  }

  return { success: !hasErrors, counts: toolCounts };
}

async function run() {
  console.log('📊 Starting Data Layer Validation...');

  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error(`❌ Manifest not found: ${MANIFEST_FILE}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  const targetFiles = process.argv.slice(2);

  const filesToValidate =
    targetFiles.length > 0
      ? targetFiles
      : [path.join(DEFAULT_DATA_DIR, 'tool_alignment.jsonl')];

  const globalToolCounts: Record<string, number> = {};
  let allSuccess = true;

  for (const file of filesToValidate) {
    if (!fs.existsSync(file)) {
      console.warn(`⚠️ File not found: ${file}`);
      continue;
    }
    const result = await validateFile(file, manifest);
    if (!result.success) {
      allSuccess = false;
    }

    // Aggregate counts
    Object.entries(result.counts).forEach(([tool, count]) => {
      globalToolCounts[tool] = (globalToolCounts[tool] || 0) + count;
    });
  }

  // Final Coverage Report
  console.log('\n📈 Global Tool Coverage Report (Aggregated):');
  console.log('-------------------------');

  const targetInventory = manifest.data_inventory.tools;
  const overrides = manifest.data_inventory.overrides || {};
  let totalScenarios = 0;

  Object.keys(targetInventory)
    .sort()
    .forEach((tool) => {
      const count = globalToolCounts[tool] || 0;
      const target =
        overrides[tool] || manifest.data_inventory.target_samples_per_tool;
      const status = count >= target ? '✅' : '⚠️';
      console.log(`${status} ${tool.padEnd(25)}: ${count}/${target}`);
      totalScenarios += count;
    });

  console.log('-------------------------');
  console.log(`Total Valid Scenarios: ${totalScenarios}`);

  if (!allSuccess) {
    console.error('\n❌ Validation completed with errors.');
    process.exit(1);
  } else {
    console.log('\n✅ Data integrity check passed.');
  }
}

run().catch((err) => {
  console.error('Fatal validation error:', err);
  process.exit(1);
});
