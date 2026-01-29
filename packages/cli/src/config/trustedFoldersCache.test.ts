/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  loadTrustedFolders,
  TrustLevel,
  resetTrustedFoldersForTesting,
} from './trustedFolders.js';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof fs>();
  return {
    ...actualFs,
    existsSync: vi.fn(),
    realpathSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('Trusted Folders realpath caching', () => {
  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should only call fs.realpathSync once for the same path', () => {
    const mockPath = '/some/path';
    const mockRealPath = '/real/path';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockReturnValue(mockRealPath);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        [mockPath]: TrustLevel.TRUST_FOLDER,
        '/another/path': TrustLevel.TRUST_FOLDER,
      }),
    );

    const folders = loadTrustedFolders();

    // Call isPathTrusted multiple times with the same path
    folders.isPathTrusted(mockPath);
    folders.isPathTrusted(mockPath);
    folders.isPathTrusted(mockPath);

    // fs.realpathSync should only be called once for mockPath (at the start of isPathTrusted)
    // And once for each rule in the config (if they are different)

    // Let's check calls for mockPath
    const realpathCalls = vi.mocked(fs.realpathSync).mock.calls;
    const mockPathCalls = realpathCalls.filter((call) => call[0] === mockPath);

    expect(mockPathCalls.length).toBe(1);
  });

  it('should cache results for rule paths in the loop', () => {
    const rulePath = '/rule/path';
    const locationPath = '/location/path';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p as string); // identity for simplicity
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        [rulePath]: TrustLevel.TRUST_FOLDER,
      }),
    );

    const folders = loadTrustedFolders();

    // First call
    folders.isPathTrusted(locationPath);
    const firstCallCount = vi.mocked(fs.realpathSync).mock.calls.length;
    expect(firstCallCount).toBe(2); // locationPath and rulePath

    // Second call with same location and same config
    folders.isPathTrusted(locationPath);
    const secondCallCount = vi.mocked(fs.realpathSync).mock.calls.length;

    // Should still be 2 because both were cached
    expect(secondCallCount).toBe(2);
  });
});
