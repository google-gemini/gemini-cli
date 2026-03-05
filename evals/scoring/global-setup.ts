/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vitest global setup: clears the eval registry file before each run so that
 * stale entries from previous runs do not pollute the current run's report.
 */

import fs from 'node:fs';
import path from 'node:path';

export function setup() {
  const registryPath = path.resolve(
    process.cwd(),
    'evals/logs/.eval-registry.ndjson',
  );
  // Ensure the logs dir exists and start with a clean registry.
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, '');
}
