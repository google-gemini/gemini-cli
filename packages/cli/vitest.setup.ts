/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset the GEMINI_CONFIG_DIR environment variable before tests run.
// This ensures that tests use the default config directory.
process.env.GEMINI_CONFIG_DIR = '';
