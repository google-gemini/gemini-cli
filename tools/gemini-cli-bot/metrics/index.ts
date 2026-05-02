/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getHistoricalAverage } from './history-helper.js';

const SCRIPTS_DIR = join(
  process.cwd(),
  'tools',
  'gemini-cli-bot',
  'metrics',
  'scripts',
);
const SYNC_SCRIPT = join(
  process.cwd(),
  'tools',
  'gemini-cli-bot',
  'history',
  'sync.ts',
);
const OUTPUT_FILE = join(
  process.cwd(),
  'tools',
  'gemini-cli-bot',
  'history',
  'metrics-before.csv',
);
const TIMESERIES_FILE = join(
  process.cwd(),
  'tools',
  'gemini-cli-bot',
  'history',
  'metrics-timeseries.csv',
);

function processOutputLine(line: string, results: string[]) {
  const trimmedLine = line.trim();
  if (!trimmedLine) return;

  let metricName = '';
  let metricValue = 0;

  try {
    const parsed = JSON.parse(trimmedLine);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'metric' in parsed &&
      'value' in parsed
    ) {
      metricName = parsed.metric;
      metricValue = parseFloat(parsed.value);
      results.push(`${metricName},${metricValue}`);
    } else {
      const parts = trimmedLine.split(',');
      if (parts.length === 2) {
        metricName = parts[0];
        metricValue = parseFloat(parts[1]);
        results.push(trimmedLine);
      } else {
        results.push(trimmedLine);
        return; // Unable to parse for deltas
      }
    }
  } catch {
    const parts = trimmedLine.split(',');
    if (parts.length === 2) {
      metricName = parts[0];
      metricValue = parseFloat(parts[1]);
      results.push(trimmedLine);
    } else {
      results.push(trimmedLine);
      return; // Unable to parse for deltas
    }
  }

  // Calculate and append deltas if the metric is a valid number
  if (metricName && !isNaN(metricValue)) {
    const avg7d = getHistoricalAverage(metricName, 7);
    if (avg7d !== null) {
      results.push(
        `${metricName}_delta_7d,${(metricValue - avg7d).toFixed(2)}`,
      );
    }

    const avg30d = getHistoricalAverage(metricName, 30);
    if (avg30d !== null) {
      results.push(
        `${metricName}_delta_30d,${(metricValue - avg30d).toFixed(2)}`,
      );
    }
  }
}

async function run() {
  // Sync history first
  console.log('Syncing history...');
  try {
    execFileSync('npx', ['tsx', SYNC_SCRIPT], { stdio: 'inherit' });
  } catch (error) {
    console.error('History sync failed, continuing without history:', error);
  }

  const scripts = readdirSync(SCRIPTS_DIR).filter(
    (file) => file.endsWith('.ts') || file.endsWith('.js'),
  );

  const results: string[] = ['metric,value'];

  for (const script of scripts) {
    console.log(`Running metric script: ${script}`);
    try {
      const scriptPath = join(SCRIPTS_DIR, script);
      const output = execFileSync('npx', ['tsx', scriptPath], {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      });

      const lines = output.trim().split('\n');
      for (const line of lines) {
        processOutputLine(line, results);
      }
    } catch (error) {
      console.error(`Error running ${script}:`, error);
    }
  }

  writeFileSync(OUTPUT_FILE, results.join('\n'));
  console.log(`Saved metrics to ${OUTPUT_FILE}`);

  // Update timeseries with rolling window (keep last 5000 lines)
  const timestamp = new Date().toISOString();
  let timeseriesLines: string[] = [];
  if (existsSync(TIMESERIES_FILE)) {
    timeseriesLines = readFileSync(TIMESERIES_FILE, 'utf-8').trim().split('\n');
  } else {
    timeseriesLines = ['timestamp,metric,value'];
  }

  const newRows = results.slice(1).map((row) => `${timestamp},${row}`);
  if (newRows.length > 0) {
    timeseriesLines.push(...newRows);

    // Keep header + last 5000 data rows
    if (timeseriesLines.length > 5001) {
      const header = timeseriesLines[0];
      timeseriesLines = [header, ...timeseriesLines.slice(-5000)];
    }

    writeFileSync(TIMESERIES_FILE, timeseriesLines.join('\n') + '\n');
    console.log(`Updated timeseries at ${TIMESERIES_FILE} (rolling window)`);
  }
}

run().catch(console.error);
