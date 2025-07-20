/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// esbuild-banner.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.__filename = require('url').fileURLToPath(import.meta.url);
globalThis.__dirname = require('path').dirname(globalThis.__filename);
