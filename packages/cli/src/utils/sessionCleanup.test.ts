/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SESSION_FILE_PREFIX, type Config } from '@google/gemini-cli-core';
import type { Settings } from '../config/settings.js';
import { cleanupExpiredSessions } from './sessionCleanup.js';
import { type SessionInfo, getAllSessionFiles } from './sessionUtils.js';

// Mock the fs module
vi.mock('fs/promises');
vi.mock('./sessionUtils.js', () => ({
  getAllSessionFiles: vi.fn(),
}));

const mockFs = vi.mocked(fs);
const mockGetAllSessionFiles = vi.mocked(getAllSessionFiles);

// Create mock config
function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    storage: {
      getProjectTempDir: vi.fn().mockReturnValue('/tmp/test-project'),
    },
    getSessionId: vi.fn().mockReturnValue('current123'),
    getDebugMode: vi.fn().mockReturnValue(false),
    initialize: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Config;
}

// Create test session data
function createTestSessions(): SessionInfo[] {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return [
    {
      id: 'current123',
      fileName: `${SESSION_FILE_PREFIX}2025-01-20T10-30-00-current12.json`,
      lastUpdated: now.toISOString(),
      isCurrentSession: true,
    },
    {
      id: 'recent456',
      fileName: `${SESSION_FILE_PREFIX}2025-01-18T15-45-00-recent45.json`,
      lastUpdated: oneWeekAgo.toISOString(),
      isCurrentSession: false,
    },
    {
      id: 'old789abc',
      fileName: `${SESSION_FILE_PREFIX}2025-01-10T09-15-00-old789ab.json`,
      lastUpdated: twoWeeksAgo.toISOString(),
      isCurrentSession: false,
    },
    {
      id: 'ancient12',
      fileName: `${SESSION_FILE_PREFIX}2024-12-25T12-00-00-ancient1.json`,
      lastUpdated: oneMonthAgo.toISOString(),
      isCurrentSession: false,
    },
  ];
}

describe('Session Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default, return all test sessions as valid
    const sessions = createTestSessions();
    mockGetAllSessionFiles.mockResolvedValue(
      sessions.map((session) => ({
        fileName: session.fileName,
        sessionInfo: session,
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cleanupExpiredSessions', () => {
    it('should return early when cleanup is disabled', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: false } },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should return early when sessionRetention is not configured', async () => {
      const config = createMockConfig();
      const settings: Settings = {};

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should handle invalid maxAge configuration', async () => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: 'invalid-format',
          },
        },
      };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Session cleanup disabled: Error: Invalid retention period format',
        ),
      );

      errorSpy.mockRestore();
    });

    it('should delete sessions older than maxAge', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '10d', // 10 days
          },
        },
      };

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(2); // Should delete the 2-week-old and 1-month-old sessions
      expect(result.skipped).toBe(2); // Current session + recent session should be skipped
      expect(result.failed).toBe(0);
    });

    it('should never delete current session', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '1d', // Very short retention
          },
        },
      };

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      // Should delete all sessions except the current one
      expect(result.disabled).toBe(false);
      expect(result.deleted).toBe(3);

      // Verify that unlink was never called with the current session file
      const unlinkCalls = mockFs.unlink.mock.calls;
      const currentSessionPath = path.join(
        '/tmp/test-project',
        'chats',
        `${SESSION_FILE_PREFIX}2025-01-20T10-30-00-current12.json`,
      );
      expect(
        unlinkCalls.find((call) => call[0] === currentSessionPath),
      ).toBeUndefined();
    });

    it('should handle count-based retention', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxCount: 2, // Keep only 2 most recent sessions
          },
        },
      };

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(2); // Should delete 2 oldest sessions (after skipping the current one)
      expect(result.skipped).toBe(2); // Current session + 1 recent session should be kept
    });

    it('should handle file system errors gracefully', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '1d',
          },
        },
      };

      // Mock file operations to succeed for access and readFile but fail for unlink
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockRejectedValue(new Error('Permission denied'));

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(0);
      expect(result.failed).toBeGreaterThan(0);
    });

    it('should handle empty sessions directory', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '30d',
          },
        },
      };

      mockGetAllSessionFiles.mockResolvedValue([]);

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle global errors gracefully', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '30d',
          },
        },
      };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock getSessionFiles to throw an error
      mockGetAllSessionFiles.mockRejectedValue(
        new Error('Directory access failed'),
      );

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(false);
      expect(result.failed).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        'Session cleanup failed: Directory access failed',
      );

      errorSpy.mockRestore();
    });

    it('should respect minRetention configuration', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '12h', // Less than 1 day minimum
            minRetention: '1d',
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);

      // Should disable cleanup due to minRetention violation
      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should log debug information when enabled', async () => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '10d',
          },
        },
      };

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockResolvedValue(undefined);

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      await cleanupExpiredSessions(config, settings);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session cleanup: deleted'),
      );
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deleted expired session:'),
      );

      debugSpy.mockRestore();
    });
  });

  describe('Specific cleanup scenarios', () => {
    it('should delete sessions that exceed the cutoff date', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '7d', // Keep sessions for 7 days
          },
        },
      };

      // Create sessions with specific dates
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
      const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

      const testSessions: SessionInfo[] = [
        {
          id: 'current',
          fileName: `${SESSION_FILE_PREFIX}current.json`,
          lastUpdated: now.toISOString(),
          isCurrentSession: true,
        },
        {
          id: 'session5d',
          fileName: `${SESSION_FILE_PREFIX}5d.json`,
          lastUpdated: fiveDaysAgo.toISOString(),
          isCurrentSession: false,
        },
        {
          id: 'session8d',
          fileName: `${SESSION_FILE_PREFIX}8d.json`,
          lastUpdated: eightDaysAgo.toISOString(),
          isCurrentSession: false,
        },
        {
          id: 'session15d',
          fileName: `${SESSION_FILE_PREFIX}15d.json`,
          lastUpdated: fifteenDaysAgo.toISOString(),
          isCurrentSession: false,
        },
      ];

      mockGetAllSessionFiles.mockResolvedValue(
        testSessions.map((session) => ({
          fileName: session.fileName,
          sessionInfo: session,
        })),
      );

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      // Should delete sessions older than 7 days (8d and 15d sessions)
      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(2);
      expect(result.skipped).toBe(2); // Current + 5d session

      // Verify which files were deleted
      const unlinkCalls = mockFs.unlink.mock.calls.map((call) => call[0]);
      expect(unlinkCalls).toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}8d.json`,
        ),
      );
      expect(unlinkCalls).toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}15d.json`,
        ),
      );
      expect(unlinkCalls).not.toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}5d.json`,
        ),
      );
    });

    it('should NOT delete sessions within the cutoff date', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '14d', // Keep sessions for 14 days
          },
        },
      };

      // Create sessions all within the retention period
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirteenDaysAgo = new Date(
        now.getTime() - 13 * 24 * 60 * 60 * 1000,
      );

      const testSessions: SessionInfo[] = [
        {
          id: 'current',
          fileName: `${SESSION_FILE_PREFIX}current.json`,
          lastUpdated: now.toISOString(),
          isCurrentSession: true,
        },
        {
          id: 'session1d',
          fileName: `${SESSION_FILE_PREFIX}1d.json`,
          lastUpdated: oneDayAgo.toISOString(),
          isCurrentSession: false,
        },
        {
          id: 'session7d',
          fileName: `${SESSION_FILE_PREFIX}7d.json`,
          lastUpdated: sevenDaysAgo.toISOString(),
          isCurrentSession: false,
        },
        {
          id: 'session13d',
          fileName: `${SESSION_FILE_PREFIX}13d.json`,
          lastUpdated: thirteenDaysAgo.toISOString(),
          isCurrentSession: false,
        },
      ];

      mockGetAllSessionFiles.mockResolvedValue(
        testSessions.map((session) => ({
          fileName: session.fileName,
          sessionInfo: session,
        })),
      );

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      // Should NOT delete any sessions as all are within 14 days
      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(4);
      expect(result.failed).toBe(0);

      // Verify no files were deleted
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should keep N most recent deletable sessions', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxCount: 3, // Keep only 3 most recent sessions
          },
        },
      };

      // Create 6 sessions with different timestamps
      const now = new Date();
      const sessions: SessionInfo[] = [
        {
          id: 'current',
          fileName: `${SESSION_FILE_PREFIX}current.json`,
          lastUpdated: now.toISOString(),
          isCurrentSession: true,
        },
      ];

      // Add 5 more sessions with decreasing timestamps
      for (let i = 1; i <= 5; i++) {
        const daysAgo = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        sessions.push({
          id: `session${i}`,
          fileName: `${SESSION_FILE_PREFIX}${i}d.json`,
          lastUpdated: daysAgo.toISOString(),
          isCurrentSession: false,
        });
      }

      mockGetAllSessionFiles.mockResolvedValue(
        sessions.map((session) => ({
          fileName: session.fileName,
          sessionInfo: session,
        })),
      );

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      // Should keep current + 2 most recent (1d and 2d), delete 3d, 4d, 5d
      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(6);
      expect(result.deleted).toBe(3);
      expect(result.skipped).toBe(3);

      // Verify which files were deleted (should be the 3 oldest)
      const unlinkCalls = mockFs.unlink.mock.calls.map((call) => call[0]);
      expect(unlinkCalls).toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}3d.json`,
        ),
      );
      expect(unlinkCalls).toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}4d.json`,
        ),
      );
      expect(unlinkCalls).toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}5d.json`,
        ),
      );

      // Verify which files were NOT deleted
      expect(unlinkCalls).not.toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}current.json`,
        ),
      );
      expect(unlinkCalls).not.toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}1d.json`,
        ),
      );
      expect(unlinkCalls).not.toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}2d.json`,
        ),
      );
    });

    it('should handle combined maxAge and maxCount retention (most restrictive wins)', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '10d', // Keep sessions for 10 days
            maxCount: 2, // But also keep only 2 most recent
          },
        },
      };

      // Create sessions where maxCount is more restrictive
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twelveDaysAgo = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);

      const testSessions: SessionInfo[] = [
        {
          id: 'current',
          fileName: `${SESSION_FILE_PREFIX}current.json`,
          lastUpdated: now.toISOString(),
          isCurrentSession: true,
        },
        {
          id: 'session3d',
          fileName: `${SESSION_FILE_PREFIX}3d.json`,
          lastUpdated: threeDaysAgo.toISOString(),
          isCurrentSession: false,
        },
        {
          id: 'session5d',
          fileName: `${SESSION_FILE_PREFIX}5d.json`,
          lastUpdated: fiveDaysAgo.toISOString(),
          isCurrentSession: false,
        },
        {
          id: 'session7d',
          fileName: `${SESSION_FILE_PREFIX}7d.json`,
          lastUpdated: sevenDaysAgo.toISOString(),
          isCurrentSession: false,
        },
        {
          id: 'session12d',
          fileName: `${SESSION_FILE_PREFIX}12d.json`,
          lastUpdated: twelveDaysAgo.toISOString(),
          isCurrentSession: false,
        },
      ];

      mockGetAllSessionFiles.mockResolvedValue(
        testSessions.map((session) => ({
          fileName: session.fileName,
          sessionInfo: session,
        })),
      );

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          sessionId: 'test',
          messages: [],
          startTime: '2025-01-01T00:00:00Z',
          lastUpdated: '2025-01-01T00:00:00Z',
        }),
      );
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      // Should delete:
      // - session12d (exceeds maxAge of 10d)
      // - session7d and session5d (exceed maxCount of 2, keeping current + 3d)
      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(5);
      expect(result.deleted).toBe(3);
      expect(result.skipped).toBe(2); // Current + 3d session

      // Verify which files were deleted
      const unlinkCalls = mockFs.unlink.mock.calls.map((call) => call[0]);
      expect(unlinkCalls).toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}5d.json`,
        ),
      );
      expect(unlinkCalls).toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}7d.json`,
        ),
      );
      expect(unlinkCalls).toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}12d.json`,
        ),
      );

      // Verify which files were NOT deleted
      expect(unlinkCalls).not.toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}current.json`,
        ),
      );
      expect(unlinkCalls).not.toContain(
        path.join(
          '/tmp/test-project',
          'chats',
          `${SESSION_FILE_PREFIX}3d.json`,
        ),
      );
    });
  });

  describe('parseRetentionPeriod format validation', () => {
    // Test all supported formats
    it.each([
      ['1h', 60 * 60 * 1000],
      ['24h', 24 * 60 * 60 * 1000],
      ['168h', 168 * 60 * 60 * 1000],
      ['1d', 24 * 60 * 60 * 1000],
      ['7d', 7 * 24 * 60 * 60 * 1000],
      ['30d', 30 * 24 * 60 * 60 * 1000],
      ['365d', 365 * 24 * 60 * 60 * 1000],
      ['1w', 7 * 24 * 60 * 60 * 1000],
      ['2w', 14 * 24 * 60 * 60 * 1000],
      ['4w', 28 * 24 * 60 * 60 * 1000],
      ['52w', 364 * 24 * 60 * 60 * 1000],
      ['1m', 30 * 24 * 60 * 60 * 1000],
      ['3m', 90 * 24 * 60 * 60 * 1000],
      ['6m', 180 * 24 * 60 * 60 * 1000],
      ['12m', 360 * 24 * 60 * 60 * 1000],
    ])('should correctly parse valid format %s', async (input) => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: input,
            // Set minRetention to 1h to allow testing of hour-based maxAge values
            minRetention: '1h',
          },
        },
      };

      mockGetAllSessionFiles.mockResolvedValue([]);

      // If it parses correctly, cleanup should proceed without error
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(false);
      expect(result.failed).toBe(0);
    });

    // Test invalid formats
    it.each([
      '30', // Missing unit
      '30x', // Invalid unit
      'd', // No number
      '1.5d', // Decimal not supported
      '-5d', // Negative number
      '1 d', // Space in format
      '1dd', // Double unit
      'abc', // Non-numeric
      '30s', // Unsupported unit (seconds)
      '30y', // Unsupported unit (years)
      '0d', // Zero value (technically valid regex but semantically invalid)
    ])('should reject invalid format %s', async (input) => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: input,
          },
        },
      };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          input === '0d'
            ? 'Invalid retention period: 0d. Value must be greater than 0'
            : `Invalid retention period format: ${input}`,
        ),
      );

      errorSpy.mockRestore();
    });

    // Test special case - empty string
    it('should reject empty string', async () => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '',
          },
        },
      };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      // Empty string means no valid retention method specified
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Either maxAge or maxCount must be specified'),
      );

      errorSpy.mockRestore();
    });

    // Test edge cases
    it('should handle very large numbers', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '9999d', // Very large number
          },
        },
      };

      mockGetAllSessionFiles.mockResolvedValue([]);

      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(false);
      expect(result.failed).toBe(0);
    });

    it('should validate minRetention format', async () => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '5d',
            minRetention: 'invalid-format', // Invalid minRetention
          },
        },
      };

      mockGetAllSessionFiles.mockResolvedValue([]);

      // Should fall back to default minRetention and proceed
      const result = await cleanupExpiredSessions(config, settings);

      // Since maxAge (5d) > default minRetention (1d), this should succeed
      expect(result.disabled).toBe(false);
      expect(result.failed).toBe(0);
    });
  });

  describe('Configuration validation', () => {
    it('should require either maxAge or maxCount', async () => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            // Neither maxAge nor maxCount specified
          },
        },
      };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Either maxAge or maxCount must be specified'),
      );

      errorSpy.mockRestore();
    });

    it('should validate maxCount range', async () => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxCount: 0, // Invalid count
          },
        },
      };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxCount must be at least 1'),
      );

      errorSpy.mockRestore();
    });

    describe('maxAge format validation', () => {
      it('should reject invalid maxAge format - no unit', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '30', // Missing unit
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid retention period format: 30'),
        );

        errorSpy.mockRestore();
      });

      it('should reject invalid maxAge format - invalid unit', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '30x', // Invalid unit 'x'
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid retention period format: 30x'),
        );

        errorSpy.mockRestore();
      });

      it('should reject invalid maxAge format - no number', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: 'd', // No number
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid retention period format: d'),
        );

        errorSpy.mockRestore();
      });

      it('should reject invalid maxAge format - decimal number', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '1.5d', // Decimal not supported
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid retention period format: 1.5d'),
        );

        errorSpy.mockRestore();
      });

      it('should reject invalid maxAge format - negative number', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '-5d', // Negative not allowed
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid retention period format: -5d'),
        );

        errorSpy.mockRestore();
      });

      it('should accept valid maxAge format - hours', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '48h', // Valid: 48 hours
              maxCount: 10, // Need at least one valid retention method
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should not reject the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });

      it('should accept valid maxAge format - days', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '7d', // Valid: 7 days
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should not reject the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });

      it('should accept valid maxAge format - weeks', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '2w', // Valid: 2 weeks
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should not reject the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });

      it('should accept valid maxAge format - months', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '3m', // Valid: 3 months
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should not reject the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });
    });

    describe('minRetention validation', () => {
      it('should reject maxAge less than default minRetention (1d)', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '12h', // Less than default 1d minRetention
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            'maxAge cannot be less than minRetention (1d)',
          ),
        );

        errorSpy.mockRestore();
      });

      it('should reject maxAge less than custom minRetention', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '2d',
              minRetention: '3d', // maxAge < minRetention
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            'maxAge cannot be less than minRetention (3d)',
          ),
        );

        errorSpy.mockRestore();
      });

      it('should accept maxAge equal to minRetention', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '2d',
              minRetention: '2d', // maxAge == minRetention (edge case)
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should not reject the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });

      it('should accept maxAge greater than minRetention', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '7d',
              minRetention: '2d', // maxAge > minRetention
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should not reject the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });

      it('should handle invalid minRetention format gracefully', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '5d',
              minRetention: 'invalid', // Invalid format
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        // When minRetention is invalid, it should default to 1d
        // Since maxAge (5d) > default minRetention (1d), this should be valid
        const result = await cleanupExpiredSessions(config, settings);

        // Should not reject due to minRetention (falls back to default)
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });
    });

    describe('maxCount boundary validation', () => {
      it('should accept maxCount = 1 (minimum valid)', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxCount: 1, // Minimum valid value
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should accept the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });

      it('should accept maxCount = 1000 (maximum valid)', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxCount: 1000, // Maximum valid value
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should accept the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });

      it('should reject negative maxCount', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxCount: -1, // Negative value
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('maxCount must be at least 1'),
        );

        errorSpy.mockRestore();
      });

      it('should accept valid maxCount in normal range', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxCount: 50, // Normal valid value
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should accept the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });
    });

    describe('combined configuration validation', () => {
      it('should accept valid maxAge and maxCount together', async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: '30d',
              maxCount: 10,
            },
          },
        };

        mockGetAllSessionFiles.mockResolvedValue([]);

        const result = await cleanupExpiredSessions(config, settings);

        // Should accept the configuration
        expect(result.disabled).toBe(false);
        expect(result.scanned).toBe(0);
        expect(result.failed).toBe(0);
      });

      it('should reject if both maxAge and maxCount are invalid', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: 'invalid',
              maxCount: 0,
            },
          },
        };

        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        // Should fail on first validation error (maxAge format)
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid retention period format'),
        );

        errorSpy.mockRestore();
      });

      it('should reject if maxAge is invalid even when maxCount is valid', async () => {
        const config = createMockConfig({
          getDebugMode: vi.fn().mockReturnValue(true),
        });
        const settings: Settings = {
          general: {
            sessionRetention: {
              enabled: true,
              maxAge: 'invalid', // Invalid format
              maxCount: 5, // Valid count
            },
          },
        };

        // The validation logic rejects invalid maxAge format even if maxCount is valid
        const errorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await cleanupExpiredSessions(config, settings);

        // Should reject due to invalid maxAge format
        expect(result.disabled).toBe(true);
        expect(result.scanned).toBe(0);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid retention period format'),
        );

        errorSpy.mockRestore();
      });
    });

    it('should never throw an exception, always returning a result', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '7d',
          },
        },
      };

      // Mock getSessionFiles to throw an error
      mockGetAllSessionFiles.mockRejectedValue(
        new Error('Failed to read directory'),
      );

      // Should not throw, should return a result with errors
      const result = await cleanupExpiredSessions(config, settings);

      expect(result).toBeDefined();
      expect(result.disabled).toBe(false);
      expect(result.failed).toBe(1);
    });

    it('should delete corrupted session files', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '30d',
          },
        },
      };

      // Mock getAllSessionFiles to return both valid and corrupted files
      const validSession = createTestSessions()[0];
      mockGetAllSessionFiles.mockResolvedValue([
        { fileName: validSession.fileName, sessionInfo: validSession },
        {
          fileName: `${SESSION_FILE_PREFIX}2025-01-02T10-00-00-corrupt1.json`,
          sessionInfo: null,
        },
        {
          fileName: `${SESSION_FILE_PREFIX}2025-01-03T10-00-00-corrupt2.json`,
          sessionInfo: null,
        },
      ]);

      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(3); // 1 valid + 2 corrupted
      expect(result.deleted).toBe(2); // Should delete the 2 corrupted files
      expect(result.skipped).toBe(1); // The valid session is kept

      // Verify corrupted files were deleted
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('corrupt1.json'),
      );
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('corrupt2.json'),
      );
    });

    it('should handle unexpected errors without throwing', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '7d',
          },
        },
      };

      // Mock getSessionFiles to throw a non-Error object
      mockGetAllSessionFiles.mockRejectedValue('String error');

      // Should not throw, should return a result with errors
      const result = await cleanupExpiredSessions(config, settings);

      expect(result).toBeDefined();
      expect(result.disabled).toBe(false);
      expect(result.failed).toBe(1);
    });
  });
});
