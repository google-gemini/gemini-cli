/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Capability probes for tests whose outcome depends on the host rather than on
 * the code under test.
 *
 * These exist so such a test can be skipped with a reason instead of failing.
 * A suite that is red for environmental reasons teaches contributors to ignore
 * it, which costs more than the coverage the test provides.
 *
 * Prefer a capability probe to a `process.platform` check. Skipping every
 * Windows host would also skip the contributors most likely to be changing
 * Windows-specific behavior, whose machines can usually run these tests.
 */

let cachedCanCreateSymlinks: boolean | undefined;

/**
 * Whether this host can create symbolic links.
 *
 * On Windows `fs.symlinkSync` needs Developer Mode or an elevated shell and
 * otherwise throws `EPERM`, so a default developer machine cannot build a
 * symlink fixture. This creates one real link rather than inferring from the
 * platform, and caches the answer because it cannot change within a run.
 */
export function canCreateSymlinks(): boolean {
  if (cachedCanCreateSymlinks !== undefined) {
    return cachedCanCreateSymlinks;
  }

  let dir: string | undefined;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-probe-'));
    const target = path.join(dir, 'target');
    fs.writeFileSync(target, '');
    fs.symlinkSync(target, path.join(dir, 'link'));
    cachedCanCreateSymlinks = true;
  } catch {
    cachedCanCreateSymlinks = false;
  } finally {
    if (dir !== undefined) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // The probe must never fail a suite it is only there to describe.
      }
    }
  }

  return cachedCanCreateSymlinks;
}

/**
 * Whether PowerShell 7+ (`pwsh`) is resolvable on PATH.
 *
 * The Windows shell-quoting pipeline behaves differently when it falls back to
 * Windows PowerShell 5.1, which is what a default Windows install provides.
 */
export function hasPowerShell7(): boolean {
  if (os.platform() !== 'win32') {
    return false;
  }

  return (process.env['PATH'] ?? '').split(path.delimiter).some((entry) => {
    if (entry === '') {
      return false;
    }
    try {
      return fs.existsSync(path.join(entry, 'pwsh.exe'));
    } catch {
      return false;
    }
  });
}
