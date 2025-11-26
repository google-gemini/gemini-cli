/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { FatalSandboxError } from '../../utils/errors.js';
import { debugLogger } from '../../utils/debugLogger.js';

// __dirname shim for ESM
const __dirname = path.dirname(new URL(import.meta.url).pathname);

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function ensureLandlockRunner(): string {
  // Try a few plausible locations (dist vs src, repo root vs package).
  const candidates = [
    path.resolve(__dirname, '..', '..', 'bin', 'landlock-runner'), // dist runtime
    path.resolve(__dirname, '..', '..', '..', 'dist', 'bin', 'landlock-runner'), // src runtime
    path.resolve(process.cwd(), 'dist', 'bin', 'landlock-runner'), // running from pkg cwd
    path.resolve(
      process.cwd(),
      'packages',
      'core',
      'dist',
      'bin',
      'landlock-runner',
    ), // repo root
  ];

  const runnerPath = firstExisting(candidates);
  if (!runnerPath) {
    throw new FatalSandboxError(
      'Landlock runner missing. Please build core (npm run build --workspace @google/gemini-cli-core) so dist/bin/landlock-runner exists, then retry.',
    );
  }

  try {
    fs.chmodSync(runnerPath, 0o755);
  } catch (err) {
    debugLogger.warn(
      `[sandbox] Unable to chmod landlock runner: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return runnerPath;
}
