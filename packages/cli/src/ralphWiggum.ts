/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  runNonInteractive,
  type RunNonInteractiveParams,
} from './nonInteractiveCli.js';

interface IterationResult {
  iteration: number;
  status: 'Success' | 'Failed';
  testsPassed?: number;
  testsFailed?: number;
  testsTotal?: number;
}

function extractTestStats(output: string): {
  passed?: number;
  failed?: number;
  total?: number;
} {
  // Common patterns for test runners (Vitest, Jest, Mocha, etc.)
  const patterns = [
    // Vitest/Jest: "Tests:       3 passed, 1 failed, 4 total"
    /Tests:\s*(?:(\d+)\s+passed)?(?:,\s*)?(?:(\d+)\s+failed)?(?:,\s*)?(?:(\d+)\s+total)?/i,
    // Mocha: "3 passing (10ms)"
    /(\d+)\s+passing/i,
    // Mocha: "1 failing"
    /(\d+)\s+failing/i,
    // Generic: "Passed: 3, Failed: 1"
    /Passed:\s*(\d+)/i,
    /Failed:\s*(\d+)/i,
  ];

  let passed: number | undefined;
  let failed: number | undefined;
  let total: number | undefined;

  // Try Vitest/Jest pattern first as it is most comprehensive
  const vitestMatch = output.match(patterns[0]);
  if (vitestMatch && (vitestMatch[1] || vitestMatch[2] || vitestMatch[3])) {
    passed = vitestMatch[1] ? parseInt(vitestMatch[1], 10) : 0;
    failed = vitestMatch[2] ? parseInt(vitestMatch[2], 10) : 0;
    total = vitestMatch[3] ? parseInt(vitestMatch[3], 10) : 0;
    return { passed, failed, total };
  }

  // Fallback to individual patterns
  const passingMatch = output.match(patterns[1]);
  if (passingMatch) {
    passed = parseInt(passingMatch[1], 10);
  } else {
    const passedMatch = output.match(patterns[3]);
    if (passedMatch) passed = parseInt(passedMatch[1], 10);
  }

  const failingMatch = output.match(patterns[2]);
  if (failingMatch) {
    failed = parseInt(failingMatch[1], 10);
  } else {
    const failedMatch = output.match(patterns[4]);
    if (failedMatch) failed = parseInt(failedMatch[1], 10);
  }

  return { passed, failed, total };
}

function printSummary(results: IterationResult[]) {
  process.stderr.write('\n--- Ralph Wiggum Mode Summary ---\n');
  process.stderr.write(
    '| Iteration | Status  | Tests Passed | Tests Failed |\n',
  );
  process.stderr.write(
    '|-----------|---------|--------------|--------------|\n',
  );
  for (const result of results) {
    const passed = result.testsPassed !== undefined ? result.testsPassed : '-';
    const failed = result.testsFailed !== undefined ? result.testsFailed : '-';
    process.stderr.write(
      `| ${result.iteration.toString().padEnd(9)} | ${result.status.padEnd(7)} | ${passed.toString().padEnd(12)} | ${failed.toString().padEnd(12)} |\n`,
    );
  }
  process.stderr.write('---------------------------------\n\n');
}

export async function runRalphWiggum({
  config,
  settings,
  input,
  prompt_id,
  resumedSessionData,
  completionPromise,
  maxIterations,
  memoryFile,
}: RunNonInteractiveParams & {
  completionPromise?: string;
  maxIterations?: number;
  memoryFile?: string;
}): Promise<void> {
  const effectiveMaxIterations = maxIterations ?? 10;
  let iterations = 0;
  const currentResumedSessionData = resumedSessionData;
  const results: IterationResult[] = [];
  const effectiveMemoryFile = memoryFile || 'memories.md';
  const memoriesPath = path.join(process.cwd(), effectiveMemoryFile);

  if (!fs.existsSync(memoriesPath)) {
    fs.writeFileSync(
      memoriesPath,
      `# Ralph Wiggum Memories\n\nTask: ${input}\n\nUse this file (${effectiveMemoryFile}) to store notes on what worked and what didn't work across iterations. The agent will read this at the start of each run.\n\n`,
    );
  }

  process.stderr.write(
    `[Ralph Wiggum] Starting loop. Max iterations: ${effectiveMaxIterations}\n`,
  );

  while (iterations < effectiveMaxIterations) {
    iterations++;
    process.stderr.write(
      `[Ralph Wiggum] Iteration ${iterations}/${effectiveMaxIterations}\n`,
    );

    let currentInput = input;
    try {
      if (fs.existsSync(memoriesPath)) {
        const memories = fs.readFileSync(memoriesPath, 'utf-8');
        if (memories.trim()) {
          currentInput = `Context from previous iterations (${effectiveMemoryFile}):\n${memories}\n\nTask:\n${input}`;
          process.stderr.write(
            `[Ralph Wiggum] Loaded context from ${effectiveMemoryFile}\n`,
          );
        }
      }
    } catch (error) {
      process.stderr.write(
        `[Ralph Wiggum] Failed to read ${effectiveMemoryFile}: ${error}\n`,
      );
    }

    const output = await runNonInteractive({
      config,
      settings,
      input: currentInput,
      prompt_id,
      resumedSessionData: currentResumedSessionData,
    });

    const stats = extractTestStats(output);
    const success =
      completionPromise && output.includes(completionPromise) ? true : false;

    results.push({
      iteration: iterations,
      status: success ? 'Success' : 'Failed',
      testsPassed: stats.passed,
      testsFailed: stats.failed,
      testsTotal: stats.total,
    });

    if (success) {
      process.stderr.write(
        `[Ralph Wiggum] Completion promise "${completionPromise}" met. Exiting.\n`,
      );
      printSummary(results);
      return;
    }

    // currentResumedSessionData = undefined; // Fixed: Keep resumedSessionData for subsequent iterations
  }
  process.stderr.write(
    `[Ralph Wiggum] Max iterations reached without meeting completion promise.\n`,
  );
  printSummary(results);
}
