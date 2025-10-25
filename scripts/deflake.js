/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Script to deflake tests
// Ex. npm run deflake -- --command="npm run test:e2e -- --test-name-pattern 'extension'" --runs=3
// Ex. npm run deflake -- --command="npm run test:e2e" --runs=5 --output=deflake-results.json

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dockerIgnorePath = path.join(projectRoot, '.dockerignore');

const DOCKERIGNORE_CONTENT = `.integration-tests`.trim();

/**
 * Runs a command and streams its output to the console.
 * @param {string} command The command string to execute (e.g., 'npm run test:e2e -- --watch').
 * @returns {Promise<{exitCode: number, startTime: Date, endTime: Date}>} A Promise that resolves with run details.
 */
function runCommand(cmd, args = []) {
  if (!cmd) {
    const now = new Date();
    return Promise.resolve({ exitCode: 1, startTime: now, endTime: now });
  }

  return new Promise((resolve, reject) => {
    const startTime = new Date();
    
    const child = spawn(cmd, args, {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('close', (code) => {
      const endTime = new Date();
      resolve({ exitCode: code ?? 1, startTime, endTime }); // code can be null if the process was killed
    });

    child.on('error', (err) => {
      // An error occurred in spawning the process (e.g., command not found).
      console.error(`Failed to start command: ${err.message}`);
      const endTime = new Date();
      reject({ error: err, startTime, endTime });
    });
  });
}

/**
 * Gets system environment information for the JSON output
 */
function getEnvironmentInfo() {
  return {
    nodeVersion: process.version,
    npmVersion: process.env.npm_version || 'unknown',
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    cpuCores: os.cpus().length,
    memoryMB: Math.round(os.totalmem() / 1024 / 1024)
  };
}

/**
 * Saves deflake results to a JSON file
 */
async function saveResults(outputPath, results) {
  try {
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results saved to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Failed to save results to ${outputPath}:`, error.message);
  }
}

// -------------------------------------------------------------------

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('command', {
      type: 'string',
      demandOption: true,
      description: 'The command to run',
    })
    .option('runs', {
      type: 'number',
      default: 5,
      description: 'The number of runs to perform',
    })
    .option('output', {
      type: 'string',
      description: 'Path to save JSON results (optional)',
    })
    .help()
    .argv;

  const NUM_RUNS = argv.runs;
  const COMMAND = argv.command;
  const ARGS = argv._;
  const OUTPUT_PATH = argv.output;
  
  let failures = 0;
  const runDetails = [];
  const overallStartTime = new Date();

  const backupDockerIgnorePath = dockerIgnorePath + '.bak';
  let originalDockerIgnoreRenamed = false;

  console.log(`--- Starting Deflake Run (${NUM_RUNS} iterations) ---`);
  if (OUTPUT_PATH) {
    console.log(`📝 Results will be saved to: ${OUTPUT_PATH}`);
  }

  try {
    try {
      // Try to rename to back up an existing .dockerignore
      await fs.rename(dockerIgnorePath, backupDockerIgnorePath);
      originalDockerIgnoreRenamed = true;
    } catch (err) {
      // If the file doesn't exist, that's fine. Otherwise, rethrow.
      if (err.code !== 'ENOENT') throw err;
    }

    // Create the temporary .dockerignore for this run.
    await fs.writeFile(dockerIgnorePath, DOCKERIGNORE_CONTENT);

    for (let i = 1; i <= NUM_RUNS; i++) {
      console.log(`\n[RUN ${i}/${NUM_RUNS}]`);

      try {
        const { exitCode, startTime, endTime } = await runCommand(COMMAND, ARGS);
        const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
        
        const runDetail = {
          run: i,
          status: exitCode === 0 ? 'PASS' : 'FAIL',
          exitCode,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          durationSeconds: Number(durationSeconds.toFixed(3))
        };
        
        runDetails.push(runDetail);

        if (exitCode === 0) {
          console.log('✅ Run PASS');
        } else {
          console.log(`❌ Run FAIL (Exit Code: ${exitCode})`);
          failures++;
        }
      } catch (error) {
        console.error('❌ Run FAIL (Execution Error)', error);
        
        const runDetail = {
          run: i,
          status: 'FAIL',
          exitCode: 1,
          startTime: error.startTime?.toISOString() || new Date().toISOString(),
          endTime: error.endTime?.toISOString() || new Date().toISOString(),
          durationSeconds: 0,
          error: error.error?.message || 'Unknown execution error'
        };
        
        runDetails.push(runDetail);
        failures++;
      }
    }
  } finally {
    try {
      // Clean up the temporary .dockerignore
      await fs.unlink(dockerIgnorePath);
    } catch (err) {
      console.error('Failed to remove temporary .dockerignore:', err);
    }

    if (originalDockerIgnoreRenamed) {
      try {
        // Restore the original .dockerignore if it was backed up.
        await fs.rename(backupDockerIgnorePath, dockerIgnorePath);
      } catch (err) {
        console.error('Failed to restore original .dockerignore:', err);
      }
    }
  }

  const overallEndTime = new Date();
  const passRuns = runDetails.filter(r => r.status === 'PASS').map(r => r.run);
  const failRuns = runDetails.filter(r => r.status === 'FAIL').map(r => r.run);
  const durations = runDetails.map(r => r.durationSeconds);
  const fastestRun = Math.min(...durations);
  const slowestRun = Math.max(...durations);
  const averageRun = (durations.reduce((a, b) => a + b, 0) / durations.length);
  
  console.log('\n--- FINAL DEFLAKE SUMMARY ---');
  console.log(`Total Runs: ${NUM_RUNS}`);
  console.log(`Total Failures: ${failures}`);
  console.log(`Pass Rate: ${((NUM_RUNS - failures) / NUM_RUNS * 100).toFixed(2)}%`);
  
  if (durations.length > 0) {
    console.log(`Fastest Run: ${fastestRun.toFixed(3)}s`);
    console.log(`Slowest Run: ${slowestRun.toFixed(3)}s`);
    console.log(`Average Run: ${averageRun.toFixed(2)}s`);
  }

  // Save JSON results if output path is specified
  if (OUTPUT_PATH) {
    const results = {
      timestamp: overallStartTime.toISOString(),
      command: COMMAND,
      runs: NUM_RUNS,
      failures,
      passRate: `${((NUM_RUNS - failures) / NUM_RUNS * 100).toFixed(2)}%`,
      runDetails,
      summary: {
        fastestRunSeconds: durations.length > 0 ? fastestRun : 0,
        slowestRunSeconds: durations.length > 0 ? slowestRun : 0,
        averageRunSeconds: durations.length > 0 ? averageRun.toFixed(2) : '0.00',
        passRuns,
        failRuns
      },
      env: getEnvironmentInfo()
    };
    
    await saveResults(OUTPUT_PATH, results);
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Error in deflake:', error);
  process.exit(1);
});