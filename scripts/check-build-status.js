/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os'; // Import os module

// --- Configuration ---
const cliPackageDir = path.resolve('packages', 'cli'); // Base directory for the CLI package
const buildTimestampPath = path.join(cliPackageDir, 'dist', '.last_build'); // Path to the timestamp file within the CLI package
const sourceDirs = [path.join(cliPackageDir, 'src')]; // Source directory within the CLI package
const filesToWatch = [
  path.join(cliPackageDir, 'package.json'),
  path.join(cliPackageDir, 'tsconfig.json'),
]; // Specific files within the CLI package
const buildDir = path.join(cliPackageDir, 'dist'); // Build output directory within the CLI package
const warningsFilePath = path.join(os.tmpdir(), 'gemini-cli-warnings.txt'); // Temp file for warnings
// ---------------------

function getMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs; // Use mtimeMs for higher precision
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    console.error(`Error getting stats for ${filePath}:`, err);
    process.exit(1); // Exit on unexpected errors getting stats
  }
}

function findSourceFiles(dir, allFiles = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    // Simple check to avoid recursing into node_modules or build dir itself
    if (
      entry.isDirectory() &&
      entry.name !== 'node_modules' &&
      fullPath !== buildDir
    ) {
      findSourceFiles(fullPath, allFiles);
    } else if (entry.isFile()) {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

console.log('Checking build status...');

// Clean up old warnings file before check
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
  // If build is missing, write that as a warning and exit(0) so app can display it
  const errorMessage = `ERROR: Build timestamp file (${path.relative(process.cwd(), buildTimestampPath)}) not found. Run \`npm run build\` first.`;
  console.error(errorMessage); // Still log error here
  try {
    fs.writeFileSync(warningsFilePath, errorMessage);
  } catch (writeErr) {
    console.error(
      `[Check Script] Error writing missing build warning file: ${writeErr.message}`,
    );
  }
  process.exit(0); // Allow app to start and show the error
}

let newerSourceFileFound = false;
const warningMessages = []; // Collect warnings here
const allSourceFiles = [];

// Collect files from specified directories
sourceDirs.forEach((dir) => {
  const dirPath = path.resolve(dir);
  if (fs.existsSync(dirPath)) {
    findSourceFiles(dirPath, allSourceFiles);
  } else {
    console.warn(`Warning: Source directory "${dir}" not found.`);
  }
});

// Add specific files
filesToWatch.forEach((file) => {
  const filePath = path.resolve(file);
  if (fs.existsSync(filePath)) {
    allSourceFiles.push(filePath);
  } else {
    console.warn(`Warning: Watched file "${file}" not found.`);
  }
});

// Check modification times
for (const file of allSourceFiles) {
  const sourceMtime = getMtime(file);
  const relativePath = path.relative(process.cwd(), file);
  const isNewer = sourceMtime && sourceMtime > buildMtime;

  if (isNewer) {
    const warning = `Warning: Source file "${relativePath}" has been modified since the last build.`;
    console.warn(warning); // Keep console warning for script debugging
    warningMessages.push(warning);
    newerSourceFileFound = true;
    // break; // Uncomment to stop checking after the first newer file
  }
}

if (newerSourceFileFound) {
  const finalWarning =
    '\nRun "npm run build" to incorporate changes before starting.';
  warningMessages.push(finalWarning);
  console.warn(finalWarning);

  // Write warnings to the temp file
  try {
    fs.writeFileSync(warningsFilePath, warningMessages.join('\n'));
    // Removed debug log
  } catch (err) {
    console.error(`[Check Script] Error writing warnings file: ${err.message}`);
    // Proceed without writing, app won't show warnings
  }
} else {
  console.log('Build is up-to-date.');
  // Ensure no stale warning file exists if build is ok
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

process.exit(0); // Always exit successfully so the app starts
