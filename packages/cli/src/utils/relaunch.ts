/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import process from 'node:process';

export function relaunch() {
  const child = spawn(process.argv[0], process.argv.slice(1), {
    env: process.env,
    detached: true,
    stdio: 'inherit',
  });

  child.unref();
  process.exit(0);
}
