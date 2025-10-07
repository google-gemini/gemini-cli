/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function main() {
  const argv = yargs(hideBin(process.argv)).option('command', {
    type: 'string',
    demandOption: true,
    description: 'The command to run',
  }).argv;

  const NUM_RUNS = 50;

  const COMMAND = argv.command;

  let failures = 0;

  // 2. Loop Tests
  console.log(`--- Starting Deflake Run (${NUM_RUNS} iterations) ---`);
  for (let i = 1; i <= NUM_RUNS; i++) {
    console.log(`\n[RUN ${i}/${NUM_RUNS}]`);
    try {
      // The 'ignore' option prevents child_process from throwing on non-zero exit code
      // The output is still piped to the stream
      const output = execSync(COMMAND, { encoding: 'utf-8', stdio: 'pipe' });

      console.log(output);
      console.log('✅ Run PASS');
    } catch (error) {
      // Vitest failing throws an error, but the output property contains the test details
      const output = error.output ? error.output.toString() : error.message;
      console.log(output);
      console.log('❌ Run FAIL');
      failures++;
      // Optional: break on first failure
      // if (failures > 0) break;
    }
  }

  // 3. Print Summary
  console.log('\n--- FINAL DEFLAKE SUMMARY ---');
  console.log(`Total Runs: ${NUM_RUNS}`);
  console.log(`Total Failures: ${failures}`);

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Error in deflake:', error);
  process.exit(1);
});
