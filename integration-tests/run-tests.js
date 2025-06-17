/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import { spawn } from 'child_process';
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

  let allTestsPassed = true;

  for (const testFile of testFiles) {
    const testFileName = basename(testFile);
    const testFileDir = join(runDir, testFileName);
    mkdirSync(testFileDir, { recursive: true });

    console.log(
      `------------- Running test file: ${testFileName} ------------------------------`,
    );

    const child = spawn('node', ['--test', testFile], {
      stdio: 'pipe',
      env: {
        ...process.env,
        GEMINI_CLI_INTEGRATION_TEST: 'true',
        INTEGRATION_TEST_FILE_DIR: testFileDir,
        KEEP_OUTPUT: keepOutput.toString(),
        TEST_FILE_NAME: testFileName,
      },
    });

    if (verbose) {
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
    }

    if (keepOutput) {
      const outputFile = join(testFileDir, 'output.log');
      const outputStream = createWriteStream(outputFile);
      child.stdout.pipe(outputStream);
      child.stderr.pipe(outputStream);
      console.log(`Output for ${testFileName} written to: ${outputFile}`);
    } else if (!verbose) {
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
    }

    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
    });

    if (exitCode !== 0) {
      console.error(`Test file failed: ${testFileName}`);
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
