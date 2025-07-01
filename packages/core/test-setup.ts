/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { setSimulate429 } from './src/utils/testUtils.js';

// Unset the GEMINI_CONFIG_DIR environment variable before tests run.
// This ensures that tests use the default config directory.
delete process.env.GEMINI_CONFIG_DIR;

// Disable 429 simulation globally for all tests
setSimulate429(false);
