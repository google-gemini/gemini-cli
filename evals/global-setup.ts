/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

let usageLogPath: string;

export function setup() {
  const tmpDir = os.tmpdir();
  usageLogPath = path.join(tmpDir, `gemini-usage-${randomUUID()}.jsonl`);
  process.env['GEMINI_EVAL_USAGE_LOG'] = usageLogPath;
}

export function teardown() {
  if (usageLogPath && fs.existsSync(usageLogPath)) {
    try {
      generateAndPrintReport(usageLogPath);
    } catch (e) {
      console.error('Failed to generate usage report', e);
    } finally {
      try {
        fs.unlinkSync(usageLogPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Formats a number with human-readable suffixes (K, M).
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

function generateAndPrintReport(logPath: string) {
  const lines = fs
    .readFileSync(logPath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean);
  if (lines.length === 0) return;
  const entries = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const stats: Record<
    string,
    {
      turns: number;
      input: number;
      output: number;
      cached: number;
      total: number;
      passed: boolean;
    }
  > = {};
  let totalTurns = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  let grandTotal = 0;

  for (const entry of entries) {
    const key = `${entry.testName} (${entry.model})`;
    if (!stats[key]) {
      stats[key] = {
        turns: 0,
        input: 0,
        output: 0,
        cached: 0,
        total: 0,
        passed: true,
      };
    }
    stats[key].turns += entry.turns || 0;
    stats[key].input += entry.input || 0;
    stats[key].output += entry.output || 0;
    stats[key].cached += entry.cached || 0;
    stats[key].total += entry.total || 0;
    // If any attempt failed for this test/model combo in this run, mark as failed
    if (entry.passed === false) {
      stats[key].passed = false;
    }

    totalTurns += entry.turns || 0;
    totalInput += entry.input || 0;
    totalOutput += entry.output || 0;
    totalCached += entry.cached || 0;
    grandTotal += entry.total || 0;
  }

  console.log('\n📊 Behavioral Eval Usage Report');
  console.log('===============================');

  const sortedKeys = Object.keys(stats).sort();
  for (const key of sortedKeys) {
    const s = stats[key];
    const status = s.passed ? '✅' : '❌';
    console.log(`${status} ${key}`);
    console.log(
      `  > turns: ${s.turns}, input: ${formatNumber(s.input)}, output: ${formatNumber(s.output)}, cached: ${formatNumber(s.cached)}, total: ${formatNumber(s.total)}`,
    );
  }

  console.log('\n📈 Suite Totals');
  console.log('--------------');
  console.log(`Total Turns:   ${totalTurns}`);
  console.log(`Input Tokens:  ${formatNumber(totalInput)}`);
  console.log(`Output Tokens: ${formatNumber(totalOutput)}`);
  console.log(`Cached Tokens: ${formatNumber(totalCached)}`);
  console.log(`Total Tokens:  ${formatNumber(grandTotal)}`);
  console.log('');
}
