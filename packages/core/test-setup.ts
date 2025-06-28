/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { setSimulate429 } from './src/utils/testUtils.js';
import { createRequire } from 'module';

// Disable 429 simulation globally for all tests
setSimulate429(false);

// Polyfill require for tests
if (typeof global.require === 'undefined') {
  global.require = createRequire(import.meta.url);
}
