#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const models = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const artifactsDir = path.resolve('artifacts');
const logsDir = path.resolve('evals/logs');

// Parse arguments
const args = process.argv.slice(2);
let testPattern = '';
let attempts = 1;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--attempts') {
    attempts = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith('-')) {
    testPattern = args[i];
  }
}

// Ensure GEMINI_API_KEY is set
if (!process.env.GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set.');
  process.exit(1);
}

// Prepare artifacts directory
if (fs.existsSync(artifactsDir)) {
  console.log(`Cleaning artifacts directory: ${artifactsDir}`);
  fs.rmSync(artifactsDir, { recursive: true, force: true });
}
fs.mkdirSync(artifactsDir);

// Build project
console.log('Building project...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (e) {
  console.error('Build failed.');
  process.exit(1);
}

console.log(`
Starting evals with ${attempts} attempt(s) per model.`);

for (const model of models) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    console.log(`
--------------------------------------------------`);
    console.log(`Running evals for ${model} (Attempt ${attempt}/${attempts})`);
    console.log(`--------------------------------------------------
`);

    // Clean logs directory for this run
    if (fs.existsSync(logsDir)) {
      fs.rmSync(logsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(logsDir, { recursive: true });

    try {
      // Construct command
      let cmd = 'npm run test:all_evals';
      if (testPattern) {
        if (
          testPattern.endsWith('.ts') ||
          testPattern.endsWith('.js') ||
          testPattern.includes('/')
        ) {
          cmd += ` -- "${testPattern}"`;
        } else {
          cmd += ` -- -t "${testPattern}"`;
        }
      }

      // Run evals
      execSync(cmd, {
        stdio: 'inherit',
        env: {
          ...process.env,
          GEMINI_MODEL: model,
          RUN_EVALS: 'true',
        },
      });
    } catch (e) {
      console.log(
        `
Evals for ${model} (Attempt ${attempt}) finished with failures.`,
      );
    }

    // Copy logs to artifacts
    // Format: eval-logs-<model>-<attempt>
    const artifactName = `eval-logs-${model}-${attempt}`;
    const artifactPath = path.join(artifactsDir, artifactName);
    
    // Ensure parent dir exists (though artifactsDir should exist)
    if (fs.existsSync(logsDir)) {
       console.log(`Copying logs to ${artifactPath}`);
       fs.cpSync(logsDir, artifactPath, { recursive: true });
    } else {
       console.error(`Warning: No logs found in ${logsDir}`);
    }
  }
}

console.log('\n--------------------------------------------------');
console.log('Aggregating results...');
console.log('--------------------------------------------------\n');

try {
  const summaryFile = 'local_evals_summary.md';
  execSync(`node scripts/aggregate_evals.js "${artifactsDir}" "${summaryFile}"`, {
    stdio: 'inherit',
    env: {
      ...process.env,
    },
  });

  console.log(`\nSummary written to ${summaryFile}`);
  console.log('\nPreview:\n');
  console.log(fs.readFileSync(summaryFile, 'utf-8'));
} catch (e) {
  console.error('Aggregation failed:', e);
}
