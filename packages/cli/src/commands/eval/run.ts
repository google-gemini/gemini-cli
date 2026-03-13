/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { debugLogger } from '@google/gemini-cli-core';
import type { TestCase, EvalResult, CheckResult } from './types.js';

function validateTestCase(data: unknown): TestCase {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Test case must be a JSON object.');
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const obj = data as Record<string, unknown>;
  if (typeof obj['name'] !== 'string' || !obj['name']) {
    throw new Error('Test case must have a non-empty "name" string field.');
  }
  if (typeof obj['input'] !== 'string' || !obj['input']) {
    throw new Error('Test case must have a non-empty "input" string field.');
  }
  if (
    typeof obj['expected_behavior'] !== 'object' ||
    obj['expected_behavior'] === null
  ) {
    throw new Error('Test case must have an "expected_behavior" object.');
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const eb = obj['expected_behavior'] as Record<string, unknown>;
  if (eb['must_include'] !== undefined) {
    if (!Array.isArray(eb['must_include'])) {
      throw new Error('"must_include" must be an array of strings.');
    }
    if (
      !eb['must_include'].every((item: unknown) => typeof item === 'string')
    ) {
      throw new Error('"must_include" array must contain only strings.');
    }
  }
  if (eb['must_not_include'] !== undefined) {
    if (!Array.isArray(eb['must_not_include'])) {
      throw new Error('"must_not_include" must be an array of strings.');
    }
    if (
      !eb['must_not_include'].every((item: unknown) => typeof item === 'string')
    ) {
      throw new Error('"must_not_include" array must contain only strings.');
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return data as TestCase;
}

function getModelResponse(input: string): Promise<string> {
  const entryScript = process.argv[1];
  if (!entryScript) {
    return Promise.reject(
      new Error('Could not determine CLI entry script from process.argv.'),
    );
  }
  return new Promise((resolvePromise, reject) => {
    execFile(
      process.execPath,
      [entryScript, '-p', input],
      { timeout: 120_000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(new Error(`Model invocation failed: ${error.message}`));
          return;
        }
        resolvePromise(stdout.trim());
      },
    );
  });
}

function evaluateResponse(response: string, testCase: TestCase): EvalResult {
  const checks: CheckResult[] = [];
  const responseLower = response.toLowerCase();

  for (const token of testCase.expected_behavior.must_include ?? []) {
    checks.push({
      label: `must_include: "${token}"`,
      passed: responseLower.includes(token.toLowerCase()),
    });
  }

  for (const token of testCase.expected_behavior.must_not_include ?? []) {
    checks.push({
      label: `must_not_include: "${token}"`,
      passed: !responseLower.includes(token.toLowerCase()),
    });
  }

  const passed = checks.filter((c) => c.passed).length;
  return {
    name: testCase.name,
    passed,
    total: checks.length,
    status: passed === checks.length ? 'PASS' : 'FAIL',
    details: checks,
  };
}

/**
 * Runs behavioral evaluation test cases from a JSON file.
 * Returns true if all tests passed, false otherwise.
 */
export async function runEval(filePath: string): Promise<boolean> {
  const resolvedPath = resolve(filePath);

  let rawContent: string;
  try {
    rawContent = await readFile(resolvedPath, 'utf-8');
  } catch {
    debugLogger.error(`Failed to read file: ${resolvedPath}`);
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    debugLogger.error(`Invalid JSON in file: ${resolvedPath}`);
    return false;
  }

  const cases: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const testCases: TestCase[] = [];
  for (const c of cases) {
    try {
      testCases.push(validateTestCase(c));
    } catch (e) {
      debugLogger.error(
        `Validation error: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  }

  if (testCases.length === 0) {
    debugLogger.error('No test cases found in file.');
    return false;
  }

  debugLogger.log(chalk.bold('\nRunning Behavioral Evaluation...\n'));

  let allPassed = true;
  for (const testCase of testCases) {
    debugLogger.log(chalk.bold(`  Test: ${testCase.name}`));

    let response: string;
    try {
      response = await getModelResponse(testCase.input);
    } catch (e) {
      debugLogger.error(
        `    ${chalk.red('Error')}: ${e instanceof Error ? e.message : String(e)}`,
      );
      allPassed = false;
      continue;
    }

    const result = evaluateResponse(response, testCase);

    for (const detail of result.details) {
      const icon = detail.passed ? chalk.green('✓') : chalk.red('✗');
      debugLogger.log(`    ${icon} ${detail.label}`);
    }

    debugLogger.log(`  Score: ${result.passed}/${result.total}`);
    const statusColor = result.status === 'PASS' ? chalk.green : chalk.red;
    debugLogger.log(`  Status: ${statusColor(result.status)}\n`);

    if (result.status === 'FAIL') {
      allPassed = false;
    }
  }

  return allPassed;
}
