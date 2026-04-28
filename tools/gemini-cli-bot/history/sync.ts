/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

const HISTORY_DIR = join(process.cwd(), 'tools', 'gemini-cli-bot', 'history');
const WORKFLOW = 'gemini-cli-bot-brain.yml';

function runCommand(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, {
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

  console.log('Searching for previous successful Brain run...');
  const runId = runCommand('gh', [
    'run',
    'list',
    '--workflow',
    WORKFLOW,
    '--status',
    'success',
    '--limit',
    '1',
    '--json',
    'databaseId',
    '--jq',
    '.[0].databaseId',
  ]);

  if (!runId) {
    console.log('No previous successful run found.');
    return;
  }

  console.log(`Found run ${runId}. Downloading brain-data artifact...`);

  const tempDir = join(HISTORY_DIR, 'temp_dl');
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  mkdirSync(tempDir, { recursive: true });

  // Download brain-data artifact
  try {
    execFileSync(
      'gh',
      ['run', 'download', runId, '-n', 'brain-data', '-D', tempDir],
      {
        stdio: 'ignore',
      },
    );

    // Sync metrics-timeseries.csv
    const tsFile = join(
      tempDir,
      'tools',
      'gemini-cli-bot',
      'history',
      'metrics-timeseries.csv',
    );
    if (existsSync(tsFile)) {
      writeFileSync(
        join(HISTORY_DIR, 'metrics-timeseries.csv'),
        readFileSync(tsFile),
      );
      console.log('Synchronized metrics-timeseries.csv');
    }

    // Sync previous metrics-before.csv as metrics-before-prev.csv
    const mbFile = join(
      tempDir,
      'tools',
      'gemini-cli-bot',
      'history',
      'metrics-before.csv',
    );
    if (existsSync(mbFile)) {
      writeFileSync(
        join(HISTORY_DIR, 'metrics-before-prev.csv'),
        readFileSync(mbFile),
      );
      console.log(
        'Synchronized previous metrics-before.csv as metrics-before-prev.csv',
      );
    }
  } catch (error) {
    console.log('Failed to sync from brain-data:', error);
  }

  // Clean up
  rmSync(tempDir, { recursive: true, force: true });
}

sync().catch((error) => {
  console.error('Error syncing history:', error);
  // Don't fail the whole process if sync fails
  process.exit(0);
});
