#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runs a behavioral eval against multiple Gemini models and outputs a
 * comparison table. Uses the same GEMINI_MODEL env var mechanism as
 * the evals-nightly.yml workflow.
 *
 * Usage:
 *   node scripts/compare-eval-models.js <eval-file> [--models model1,model2]
 *
 * Examples:
 *   node scripts/compare-eval-models.js evals/read-before-edit.eval.ts
 *   node scripts/compare-eval-models.js evals/answer-vs-act.eval.ts --models gemini-2.5-flash,gemini-2.5-pro
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let evalFile = null;
  let models = DEFAULT_MODELS;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--models' && args[i + 1]) {
      models = args[i + 1].split(',').map((m) => m.trim());
      i++;
    } else if (!args[i].startsWith('--')) {
      evalFile = args[i];
    }
  }

  if (!evalFile) {
    console.error(
      'Usage: node scripts/compare-eval-models.js <eval-file> [--models model1,model2]',
    );
    process.exit(1);
  }

  if (!fs.existsSync(evalFile)) {
    console.error(`eval file not found: ${evalFile}`);
    process.exit(1);
  }

  return { evalFile, models };
}

function runEvalOnModel(evalFile, model) {
  const reportPath = 'evals/logs/report.json';

  try {
    fs.unlinkSync(reportPath);
  } catch {
    // ignore
  }

  const startTime = Date.now();
  let exitOk = false;
  let error = null;

  try {
    execFileSync(
      'npx',
      ['vitest', 'run', '--config', 'evals/vitest.config.ts', evalFile],
      {
        env: {
          ...process.env,
          GEMINI_MODEL: model,
          RUN_EVALS: '1',
          VITEST_RETRY: '0',
        },
        stdio: 'pipe',
        timeout: 600000,
      },
    );
    exitOk = true;
  } catch (err) {
    error = err.stderr?.toString().split('\n').slice(-3).join(' ').trim();
  }

  const duration = Date.now() - startTime;

  // a run is only successful if vitest exited cleanly AND a valid report
  // exists with at least one test AND all tests passed.
  let tests = [];
  let reportExists = false;
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    for (const testResult of report.testResults || []) {
      for (const assertion of testResult.assertionResults || []) {
        tests.push({
          name: assertion.title,
          status: assertion.status,
        });
      }
    }
    reportExists = true;
  } catch {
    // report doesn't exist — vitest crashed or config issue
  }

  const passed =
    exitOk &&
    reportExists &&
    tests.length > 0 &&
    tests.every((t) => t.status === 'passed');

  return {
    model,
    passed,
    duration_ms: duration,
    testCount: tests.length,
    tests,
    error,
  };
}

function printReport(evalFile, results) {
  const name = path.basename(evalFile, '.eval.ts');
  console.log(`\neval: ${name}`);
  console.log('\u2500'.repeat(70));
  console.log(
    `${'model'.padEnd(30)} | ${'result'.padEnd(8)} | ${'duration'.padEnd(10)} | tests`,
  );
  console.log('\u2500'.repeat(70));

  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    const duration = (r.duration_ms / 1000).toFixed(1) + 's';
    console.log(
      `${r.model.padEnd(30)} | ${status.padEnd(8)} | ${duration.padEnd(10)} | ${r.testCount}`,
    );
  }

  console.log('\u2500'.repeat(70));

  const passedModels = results.filter((r) => r.passed).map((r) => r.model);
  const failedModels = results.filter((r) => !r.passed).map((r) => r.model);
  const fastest = results.reduce((a, b) =>
    a.duration_ms < b.duration_ms ? a : b,
  );

  console.log(`\npassed: ${passedModels.length}/${results.length} models`);
  if (failedModels.length > 0) {
    console.log(`failed on: ${failedModels.join(', ')}`);
  }
  console.log(
    `fastest: ${fastest.model} (${(fastest.duration_ms / 1000).toFixed(1)}s)`,
  );

  const jsonPath = `evals/logs/comparison-${name}.json`;
  const report = {
    evalName: name,
    evalFile,
    timestamp: new Date().toISOString(),
    results: results.map((r) => ({
      model: r.model,
      passed: r.passed,
      duration_ms: r.duration_ms,
      tests: r.tests,
      error: r.error,
    })),
    summary: {
      passedModels,
      failedModels,
      fastestModel: fastest.model,
    },
  };

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nfull report saved to: ${jsonPath}`);
}

// --- main ---

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY env var is required');
  process.exit(1);
}

const { evalFile, models } = parseArgs();

console.log(
  `running ${path.basename(evalFile)} across ${models.length} models...`,
);

const results = [];
for (const model of models) {
  process.stdout.write(`  ${model}...`);
  const result = runEvalOnModel(evalFile, model);
  const status = result.passed ? 'pass' : 'FAIL';
  const duration = (result.duration_ms / 1000).toFixed(1) + 's';
  console.log(` ${status} (${duration})`);
  results.push(result);
}

printReport(evalFile, results);
