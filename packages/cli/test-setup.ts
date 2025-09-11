/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

// Force English locale for yargs in all tests
// This ensures consistent error messages regardless of system locale
process.env['LC_ALL'] = 'C';
process.env['LANG'] = 'en_US.UTF-8';

import './src/test-utils/customMatchers.js';
