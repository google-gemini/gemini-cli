/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Script to deflake tests
// Ex. npm run deflake -- --command="npm run test:e2e -- --test-name-pattern 'replace'" --runs=3

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('command', {
      type: 'string',
      demandOption: true,
      description: 'The command to run',
    })
    .option('runs', {
      type: 'number',
      default: 50,
      description: 'The number of runs to perform',
    }).argv;

  const NUM_RUNS = argv.runs;

  const COMMAND = argv.command;

  let failures = 0;

  console.log(`--- Starting Deflake Run (${NUM_RUNS} iterations) ---`);
  for (let i = 1; i <= NUM_RUNS; i++) {
    console.log(`\n[RUN ${i}/${NUM_RUNS}]`);
    try {
      const output = execSync(COMMAND, { encoding: 'utf-8', stdio: 'pipe' });

      console.log(output);
      console.log('✅ Run PASS');
    } catch (error) {
      const output = error.output ? error.output.toString() : error.message;
      console.log(output);
      console.log('❌ Run FAIL');
      failures++;
    }
  }

  console.log('\n--- FINAL DEFLAKE SUMMARY ---');
  console.log(`Total Runs: ${NUM_RUNS}`);
  console.log(`Total Failures: ${failures}`);

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Error in deflake:', error);
  process.exit(1);
});
