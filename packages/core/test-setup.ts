/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

import { setSimulate429 } from './src/utils/testUtils.js';

// Surface any uncaught exceptions or unhandled rejections inside vitest worker processes.
process.on('uncaughtException', (err) => {
  console.error('[vitest][uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[vitest][unhandledRejection]', reason);
});

// Disable 429 simulation globally for all tests
setSimulate429(false);
