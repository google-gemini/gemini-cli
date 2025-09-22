/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

try {
  // Get repository root
  const root = execSync('git rev-parse --show-toplevel').toString().trim();

  // Run lint-staged from the root directory
  execSync('npx lint-staged', { cwd: root, stdio: 'inherit' });
} catch (error) {
  // Exit with the same code as lint-staged
  process.exit(error.status || 1);
}
