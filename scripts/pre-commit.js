/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import lintStaged from 'lint-staged';

try {
  // Get repository root
  const root = execSync('git rev-parse --show-toplevel').toString().trim();

  // Run lint-staged with API directly
  const passed = await lintStaged({ cwd: root });

  // Exit with appropriate code
  process.exit(passed ? 0 : 1);
} catch {
  // Exit with error code
  process.exit(1);
}
