/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../test-utils/render.js';
import { useSessionRetentionCheck } from './useSessionRetentionCheck.js';
import { type Config } from '@google/gemini-cli-core';
import type { Settings } from '../config/settingsSchema.js';
import { waitFor } from '../test-utils/async.js';

// Mock getAllSessionFiles
const mockGetAllSessionFiles = vi.fn();
vi.mock('../utils/sessionUtils.js', () => ({
  getAllSessionFiles: () => mockGetAllSessionFiles(),
}));

describe('useSessionRetentionCheck', () => {
  const mockConfig = {
    storage: {
      getProjectTempDir: () => '/mock/project/temp/dir',
    },
    getSessionId: () => 'mock-session-id',
  } as unknown as Config;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not show warning if warningAcknowledged is true', async () => {
    const settings = {
      general: {
        sessionRetention: {
          warningAcknowledged: true,
        },
      },
    } as unknown as Settings;

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(false);
      expect(mockGetAllSessionFiles).not.toHaveBeenCalled();
    });
  });

  it('should not show warning if retention is already enabled', async () => {
    const settings = {
      general: {
        sessionRetention: {
          enabled: true,
        },
      },
    } as unknown as Settings;

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(false);
      expect(mockGetAllSessionFiles).not.toHaveBeenCalled();
    });
  });

  it('should show warning if sessions exist and not acknowledged/enabled', async () => {
    const settings = {
      general: {
        sessionRetention: {
          enabled: false,
          warningAcknowledged: false,
        },
      },
    } as unknown as Settings;

    mockGetAllSessionFiles.mockResolvedValue([
      'session1.json',
      'session2.json',
    ]);

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(true);
      expect(mockGetAllSessionFiles).toHaveBeenCalled();
    });
  });

  it('should not show warning if no sessions exist', async () => {
    const settings = {
      general: {
        sessionRetention: {
          enabled: false,
          warningAcknowledged: false,
        },
      },
    } as unknown as Settings;

    mockGetAllSessionFiles.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(false);
      expect(mockGetAllSessionFiles).toHaveBeenCalled();
    });
  });

  it('should handle errors gracefully (assume no warning)', async () => {
    const settings = {
      general: {
        sessionRetention: {
          enabled: false,
          warningAcknowledged: false,
        },
      },
    } as unknown as Settings;

    mockGetAllSessionFiles.mockRejectedValue(new Error('FS Error'));

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(false);
    });
  });
});
