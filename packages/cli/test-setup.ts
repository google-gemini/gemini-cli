/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

// Initialize i18n for tests
import i18n from './src/i18n/index.js';

// Ensure i18n is ready before tests start
await i18n.init();

import './src/test-utils/customMatchers.js';
