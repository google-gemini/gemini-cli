/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync, spawn } from 'child_process';
import { mkdirSync, rmSync, createWriteStream } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const rootDir = join(__dirname, '..');
  const integrationTestsDir = join(rootDir, '.integration-tests');

  if (process.env.GEMINI_SANDBOX === 'docker' && !process.env.IS_DOCKER) {
    console.log('Building sandbox for Docker...');
    const buildResult = spawnSync('npm', ['run', 'build:all'], {
      stdio: 'inherit',
    });
    if (buildResult.status !== 0) {
      console.error('Sandbox build failed.');
      process.exit(1);
    }
  }

  const runId = `${Date.now()}`;
  const runDir = join(integrationTestsDir, runId);

  mkdirSync(runDir, { recursive: true });

  const args = process.argv.slice(2);
  const keepOutput =
    process.env.KEEP_OUTPUT === 'true' || args.includes('--keep-output');
  if (keepOutput) {
    const keepOutputIndex = args.indexOf('--keep-output');
    if (keepOutputIndex > -1) {
      args.splice(keepOutputIndex, 1);
    }
    console.log(`Keeping output for test run in: ${runDir}`);
  }

  const verbose = args.includes('--verbose');
  if (verbose) {
    const verboseIndex = args.indexOf('--verbose');
    if (verboseIndex > -1) {
      args.splice(verboseIndex, 1);
    }
  }

  const testPatterns =
    args.length > 0
      ? args.map((arg) => `integration-tests/${arg}.test.js`)
      : ['integration-tests/*.test.js'];
  const testFiles = glob.sync(testPatterns, { cwd: rootDir, absolute: true });

  for (const testFile of testFiles) {
    const testFileName = basename(testFile);
    console.log(`\tFound test file: ${testFileName}`);
  }

  const MAX_RETRIES = 3;
  let allTestsPassed = true;

  for (const testFile of testFiles) {
    const testFileName = basename(testFile);
    const testFileDir = join(runDir, testFileName);
    mkdirSync(testFileDir, { recursive: true });

    console.log(
      `------------- Running test file: ${testFileName} ------------------------------`,
    );

    let attempt = 0;
    let testFilePassed = false;
    let lastStdout = [];
    let lastStderr = [];

    while (attempt < MAX_RETRIES && !testFilePassed) {
      attempt++;
      if (attempt > 1) {
        console.log(
          `--- Retrying ${testFileName} (attempt ${attempt} of ${MAX_RETRIES}) ---`,
        );
      }

      const nodeArgs = ['--test'];
      if (verbose) {
        nodeArgs.push('--test-reporter=spec');
      }
      nodeArgs.push(testFile);

      const child = spawn('node', nodeArgs, {
        stdio: 'pipe',
        env: {
          ...process.env,
          GEMINI_CLI_INTEGRATION_TEST: 'true',
          INTEGRATION_TEST_FILE_DIR: testFileDir,
          KEEP_OUTPUT: keepOutput.toString(),
          VERBOSE: verbose.toString(),
          TEST_FILE_NAME: testFileName,
        },
      });

      let outputStream;
      if (keepOutput) {
        const outputFile = join(testFileDir, `output-attempt-${attempt}.log`);
        outputStream = createWriteStream(outputFile);
        console.log(`Output for ${testFileName} written to: ${outputFile}`);
      }

      const stdout = [];
      const stderr = [];

      child.stdout.on('data', (data) => {
        if (verbose) {
          process.stdout.write(data);
        } else {
          stdout.push(data);
        }
        if (outputStream) {
          outputStream.write(data);
        }
      });

      child.stderr.on('data', (data) => {
        if (verbose) {
          process.stderr.write(data);
        } else {
          stderr.push(data);
        }
        if (outputStream) {
          outputStream.write(data);
        }
      });

      const exitCode = await new Promise((resolve) => {
        child.on('close', (code) => {
          if (outputStream) {
            outputStream.end(() => {
              resolve(code);
            });
          } else {
            resolve(code);
          }
        });
      });

      if (exitCode === 0) {
        testFilePassed = true;
      } else {
        lastStdout = stdout;
        lastStderr = stderr;
      }
    }

    if (!testFilePassed) {
      console.error(
        `Test file failed after ${MAX_RETRIES} attempts: ${testFileName}`,
      );
      if (!verbose) {
        process.stdout.write(Buffer.concat(lastStdout).toString('utf8'));
        process.stderr.write(Buffer.concat(lastStderr).toString('utf8'));
      }
      allTestsPassed = false;
    }
  }

  if (!keepOutput) {
    rmSync(runDir, { recursive: true, force: true });
  }

  if (!allTestsPassed) {
    console.error('One or more test files failed.');
    process.exit(1);
  }
}

main();
