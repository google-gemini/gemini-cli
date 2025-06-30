/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import fs from 'fs';

/**
 * Finds the project root by searching upwards from the current directory
 * for a package.json file with a "workspaces" field.
 * @param startDir The directory to start searching from.
 * @returns The project root directory.
 */
function findProjectRoot(startDir: string): string {
  let currentDir = startDir;
  while (true) {
    const pkgPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.workspaces) {
        return currentDir;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached the filesystem root
      return process.cwd();
    }
    currentDir = parentDir;
  }
}

const binaryName = process.platform === 'win32' ? 'fd.exe' : 'fd';

let resolvedFdPath: string;

if (process.env.VITEST) {
  // For tests, find the project root and point to the binary in the root bundle dir.
  const projectRoot = findProjectRoot(__dirname);
  resolvedFdPath = path.join(projectRoot, 'bundle', binaryName);
} else {
  // In the bundled app, the binary is in the same directory as the script.
  resolvedFdPath = path.join(__dirname, binaryName);
}

export const fdPath = resolvedFdPath;
