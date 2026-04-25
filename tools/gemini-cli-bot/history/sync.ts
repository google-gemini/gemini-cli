/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

const HISTORY_DIR = join(process.cwd(), 'tools', 'gemini-cli-bot', 'history');
const WORKFLOW = 'gemini-cli-bot-pulse.yml';

function runCommand(command: string): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function sync() {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true });
  }

  console.log('Searching for previous successful Pulse run...');
  const runId = runCommand(
    `gh run list --workflow ${WORKFLOW} --status success --limit 1 --json databaseId --jq '.[0].databaseId'`,
  );

  if (!runId) {
    console.log('No previous successful run found.');
    return;
  }

  console.log(`Found run ${runId}. Downloading artifacts...`);

  const tempDir = join(HISTORY_DIR, 'temp_dl');
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  mkdirSync(tempDir, { recursive: true });

  // Download metrics-timeseries if it exists
  try {
    execSync(`gh run download ${runId} -n metrics-timeseries -D ${tempDir}`, {
      stdio: 'ignore',
    });
    const tsFile = join(tempDir, 'metrics-timeseries.csv');
    if (existsSync(tsFile)) {
      writeFileSync(
        join(HISTORY_DIR, 'metrics-timeseries.csv'),
        readFileSync(tsFile),
      );
      console.log('Downloaded metrics-timeseries.csv');
    }
  } catch {
    console.log('metrics-timeseries artifact not found in previous run.');
  }

  // Download previous metrics-before.csv
  try {
    execSync(`gh run download ${runId} -n metrics-before -D ${tempDir}`, {
      stdio: 'ignore',
    });
    const mbFile = join(tempDir, 'metrics-before.csv');
    if (existsSync(mbFile)) {
      writeFileSync(
        join(HISTORY_DIR, 'metrics-before-prev.csv'),
        readFileSync(mbFile),
      );
      console.log(
        'Downloaded previous metrics-before.csv as metrics-before-prev.csv',
      );
    }
  } catch {
    console.log('metrics-before artifact not found in previous run.');
  }

  // Clean up
  rmSync(tempDir, { recursive: true, force: true });
}

sync().catch((error) => {
  console.error('Error syncing history:', error);
  // Don't fail the whole process if sync fails
  process.exit(0);
});
