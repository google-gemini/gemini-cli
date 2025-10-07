/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const NUM_RUNS = 50;
const LOG_FILE = path.join(
  __dirname,
  `deflake_results_${new Date().toISOString().replace(/:/g, '-')}.log`,
);

const COMMAND = 'npm run test:integration:deflake';

let failures = 0;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
  const line = `${message}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

// 2. Loop Tests
log(`--- Starting Deflake Run (${NUM_RUNS} iterations) ---`);
for (let i = 1; i <= NUM_RUNS; i++) {
  log(`\n[RUN ${i}/${NUM_RUNS}]`);
  try {
    // The 'ignore' option prevents child_process from throwing on non-zero exit code
    // The output is still piped to the stream
    const output = execSync(COMMAND, { encoding: 'utf-8', stdio: 'pipe' });

    logStream.write(output);
    log('✅ Run PASS');
  } catch (error) {
    // Vitest failing throws an error, but the output property contains the test details
    const output = error.output ? error.output.toString() : error.message;
    logStream.write(output);
    log('❌ Run FAIL');
    failures++;
    // Optional: break on first failure
    // if (failures > 0) break;
  }
}

// 3. Print Summary
log('\n--- FINAL DEFLAKE SUMMARY ---');
log(`Total Runs: ${NUM_RUNS}`);
log(`Total Failures: ${failures}`);
log(`Results logged to: ${LOG_FILE}`);

logStream.close();
process.exit(failures > 0 ? 1 : 0);
