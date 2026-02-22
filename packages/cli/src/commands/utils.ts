/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { runExitCleanup } from '../utils/cleanup.js';

export async function exitCli(exitCode = 0) {
  await runExitCleanup();
  process.exit(exitCode);
}
