/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetCleanupForTesting } from './cleanup.js';

/**
 * This test verifies the fix for issue #18019 by checking the actual code paths
 * that register SessionEnd cleanup functions.
 *
 * Before fix:
 * - gemini.tsx:529 always registered SessionEnd cleanup
 * - AppContainer.tsx:447 also registered SessionEnd cleanup (interactive mode)
 * - gemini.tsx:704 also registered SessionEnd cleanup (non-interactive mode)
 * Result: SessionEnd fired twice
 *
 * After fix:
 * - gemini.tsx:529 removed
 * - AppContainer.tsx:447 registers SessionEnd cleanup (interactive mode only)
 * - gemini.tsx:704 registers SessionEnd cleanup (non-interactive mode only)
 * Result: SessionEnd fires once
 */
describe('SessionEnd registration paths - Issue #18019', () => {
  beforeEach(() => {
    resetCleanupForTesting();
  });

  afterEach(() => {
    resetCleanupForTesting();
    vi.restoreAllMocks();
  });

  it('should verify gemini.tsx has only one SessionEnd registration', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const geminiPath = path.join(import.meta.dirname, '..', 'gemini.tsx');
    const content = await fs.readFile(geminiPath, 'utf-8');

    // Count SessionEnd registrations in registerCleanup blocks
    const sessionEndRegistrations = content.match(
      /registerCleanup\s*\(\s*async\s*\(\s*\)\s*=>\s*\{[^}]*fireSessionEndEvent/g,
    );

    // Should only find 1 registration (for non-interactive mode)
    expect(sessionEndRegistrations?.length ?? 0).toBe(1);
  });

  it('should verify AppContainer.tsx has SessionEnd registration for interactive mode', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const appContainerPath = path.join(
      import.meta.dirname,
      '..',
      'ui',
      'AppContainer.tsx',
    );

    const content = await fs.readFile(appContainerPath, 'utf-8');

    // AppContainer should have the SessionEnd registration for interactive mode
    expect(content).toContain('fireSessionEndEvent');
    expect(content).toContain('SessionEndReason.Exit');
  });
});
