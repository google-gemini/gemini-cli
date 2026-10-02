/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../aggregate_evals.js');

/**
 * Runs the aggregator against a directory that contains no report.json files,
 * with the given environment overrides, mirroring how CI invokes it.
 */
function runAgainstEmptyDir(env: Record<string, string>) {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-reports-'));
  try {
    return spawnSync(process.execPath, [SCRIPT, emptyDir], {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
    });
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
}

describe('aggregate_evals with no reports', () => {
  it('fails the scheduled nightly instead of reading as green', () => {
    const result = runAgainstEmptyDir({
      GITHUB_EVENT_NAME: 'schedule',
      CI: 'true',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('::error::');
  });

  it('stays green with a warning annotation for filtered manual runs', () => {
    const result = runAgainstEmptyDir({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      CI: 'true',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::warning::');
  });

  it('stays green and quiet outside of GitHub Actions', () => {
    const result = runAgainstEmptyDir({
      GITHUB_EVENT_NAME: '',
      CI: '',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('::error::');
    expect(result.stdout).not.toContain('::warning::');
  });
});
