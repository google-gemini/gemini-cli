/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

// --- Configuration ---
const autoBuild = process.argv.includes('--auto-build');
const packageDirs = [
  path.resolve('packages', 'core'),
  path.resolve('packages', 'cli'),
];
const cliPackageDir = path.resolve('packages', 'cli');
const buildTimestampPath = path.join(cliPackageDir, 'dist', '.last_build');
const sourceDirs = packageDirs.map((dir) => path.join(dir, 'src'));
const filesToWatch = packageDirs.flatMap((dir) => [
  path.join(dir, 'package.json'),
  path.join(dir, 'tsconfig.json'),
]);
const buildDirs = packageDirs.map((dir) => path.join(dir, 'dist'));
const warningsFilePath = path.join(os.tmpdir(), 'gemini-cli-warnings.txt');
const devBuildCommand =
  'npm run build -w @google/gemini-cli-core && npm run build -w @google/gemini-cli';
// ---------------------

function getMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    console.error(`Error getting stats for ${filePath}:`, err);
    process.exit(1);
  }
}

function isBuildDir(filePath) {
  return buildDirs.some((buildDir) => path.resolve(filePath) === buildDir);
}

function findSourceFiles(dir, allFiles = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== 'node_modules' &&
      !isBuildDir(fullPath)
    ) {
      findSourceFiles(fullPath, allFiles);
    } else if (entry.isFile()) {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

function writeWarning(message) {
  try {
    fs.writeFileSync(warningsFilePath, message);
  } catch (writeErr) {
    console.error(
      `[Check Script] Error writing build warning file: ${writeErr.message}`,
    );
  }
}

function runDevBuild(reason) {
  console.log(`Dev build needed: ${reason}`);
  console.log(`Running: ${devBuildCommand}`);
  execSync(devBuildCommand, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        '--max-old-space-size=8192',
      ]
        .filter(Boolean)
        .join(' '),
    },
  });
}

console.log('Checking build status...');

try {
  if (fs.existsSync(warningsFilePath)) {
    fs.unlinkSync(warningsFilePath);
  }
} catch (err) {
  console.warn(
    `[Check Script] Warning: Could not delete previous warnings file: ${err.message}`,
  );
}

const buildMtime = getMtime(buildTimestampPath);
if (!buildMtime) {
  const message = `Build timestamp file (${path.relative(process.cwd(), buildTimestampPath)}) not found.`;
  if (autoBuild) {
    runDevBuild(message);
    process.exit(0);
  }

  const errorMessage = `ERROR: ${message} Run \`npm run build\` first.`;
  console.error(errorMessage);
  writeWarning(errorMessage);
  process.exit(0);
}

let newerSourceFileFound = false;
const warningMessages = [];
const allSourceFiles = [];

sourceDirs.forEach((dir) => {
  const dirPath = path.resolve(dir);
  if (fs.existsSync(dirPath)) {
    findSourceFiles(dirPath, allSourceFiles);
  } else {
    console.warn(`Warning: Source directory "${dir}" not found.`);
  }
});

filesToWatch.forEach((file) => {
  const filePath = path.resolve(file);
  if (fs.existsSync(filePath)) {
    allSourceFiles.push(filePath);
  } else {
    console.warn(`Warning: Watched file "${file}" not found.`);
  }
});

for (const file of allSourceFiles) {
  const sourceMtime = getMtime(file);
  const relativePath = path.relative(process.cwd(), file);
  const isNewer = sourceMtime && sourceMtime > buildMtime;

  if (isNewer) {
    const warning = `Warning: Source file "${relativePath}" has been modified since the last build.`;
    console.warn(warning);
    warningMessages.push(warning);
    newerSourceFileFound = true;
  }
}

if (newerSourceFileFound) {
  if (autoBuild) {
    runDevBuild('source changed after the last CLI build');
    process.exit(0);
  }

  const finalWarning =
    '\nRun "npm run build" to incorporate changes before starting.';
  warningMessages.push(finalWarning);
  console.warn(finalWarning);
  writeWarning(warningMessages.join('\n'));
} else {
  console.log('Build is up-to-date.');
  try {
    if (fs.existsSync(warningsFilePath)) {
      fs.unlinkSync(warningsFilePath);
    }
  } catch (err) {
    console.warn(
      `[Check Script] Warning: Could not delete previous warnings file: ${err.message}`,
    );
  }
}

process.exit(0);
