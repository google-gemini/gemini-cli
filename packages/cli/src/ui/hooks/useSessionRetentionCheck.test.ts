/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useSessionRetentionCheck } from './useSessionRetentionCheck.js';
import { type Config } from '@google/gemini-cli-core';
import type { Settings } from '../../config/settingsSchema.js';
import { waitFor } from '../../test-utils/async.js';

// Mock utils
const mockGetAllSessionFiles = vi.fn();
const mockIdentifySessionsToDelete = vi.fn();

vi.mock('../../utils/sessionUtils.js', () => ({
  getAllSessionFiles: () => mockGetAllSessionFiles(),
}));

vi.mock('../../utils/sessionCleanup.js', () => ({
  identifySessionsToDelete: () => mockIdentifySessionsToDelete(),
  DEFAULT_MIN_RETENTION: '30d',
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

  it('should show warning if enabled is true but maxAge is undefined', async () => {
    const settings = {
      general: {
        sessionRetention: {
          enabled: true,
          maxAge: undefined,
          warningAcknowledged: false,
        },
      },
    } as unknown as Settings;

    mockGetAllSessionFiles.mockResolvedValue(['session1.json']);
    mockIdentifySessionsToDelete.mockResolvedValue(['session1.json']);

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(true);
      expect(mockGetAllSessionFiles).toHaveBeenCalled();
      expect(mockIdentifySessionsToDelete).toHaveBeenCalled();
    });
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
      expect(mockIdentifySessionsToDelete).not.toHaveBeenCalled();
    });
  });

  it('should not show warning if retention is already enabled', async () => {
    const settings = {
      general: {
        sessionRetention: {
          enabled: true,
          maxAge: '30d', // Explicitly enabled with non-default
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
      expect(mockIdentifySessionsToDelete).not.toHaveBeenCalled();
    });
  });

  it('should show warning if sessions to delete exist', async () => {
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
    mockIdentifySessionsToDelete.mockResolvedValue(['session1.json']); // 1 session to delete

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(true);
      expect(result.current.sessionsToDeleteCount).toBe(1);
      expect(mockGetAllSessionFiles).toHaveBeenCalled();
      expect(mockIdentifySessionsToDelete).toHaveBeenCalled();
    });
  });

  it('should call onAutoEnable if no sessions to delete and currently disabled', async () => {
    const settings = {
      general: {
        sessionRetention: {
          enabled: false,
          warningAcknowledged: false,
        },
      },
    } as unknown as Settings;

    mockGetAllSessionFiles.mockResolvedValue(['session1.json']);
    mockIdentifySessionsToDelete.mockResolvedValue([]); // 0 sessions to delete

    const onAutoEnable = vi.fn();

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings, onAutoEnable),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(false);
      expect(onAutoEnable).toHaveBeenCalled();
    });
  });

  it('should not show warning if no sessions to delete', async () => {
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
    mockIdentifySessionsToDelete.mockResolvedValue([]); // 0 sessions to delete

    const { result } = renderHook(() =>
      useSessionRetentionCheck(mockConfig, settings),
    );

    await waitFor(() => {
      expect(result.current.checkComplete).toBe(true);
      expect(result.current.shouldShowWarning).toBe(false);
      expect(result.current.sessionsToDeleteCount).toBe(0);
      expect(mockGetAllSessionFiles).toHaveBeenCalled();
      expect(mockIdentifySessionsToDelete).toHaveBeenCalled();
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
