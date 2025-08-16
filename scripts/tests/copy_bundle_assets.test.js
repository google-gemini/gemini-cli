/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
let testBundleDir;

describe('copy_bundle_assets', () => {
  beforeAll(() => {
    // Create a temporary directory for the bundle to avoid side-effects
    testBundleDir = mkdtempSync(join(tmpdir(), 'gemini-cli-test-'));
  });

  afterAll(() => {
    // Clean up the temporary directory
    if (testBundleDir) {
      rmSync(testBundleDir, { recursive: true, force: true });
    }
  });

  it('should create backwards compatibility files for old seatbelt profile names', () => {
    // Run the copy script, pointing it to our temporary bundle directory
    execSync(`node ${join(root, 'scripts/copy_bundle_assets.js')}`, {
      cwd: root,
      env: {
        ...process.env,
        TEST_BUNDLE_DIR: testBundleDir,
      },
      stdio: 'pipe', // Suppress output during tests
    });

    // Check that the backwards compatibility files were created
    expect(existsSync(join(testBundleDir, 'sandbox-macos-minimal.sb'))).toBe(
      true,
    );
    expect(existsSync(join(testBundleDir, 'sandbox-macos-strict.sb'))).toBe(
      true,
    );

    // Also check that the new files exist
    expect(
      existsSync(join(testBundleDir, 'sandbox-macos-permissive-open.sb')),
    ).toBe(true);
    expect(
      existsSync(join(testBundleDir, 'sandbox-macos-restrictive-closed.sb')),
    ).toBe(true);
  });
});
