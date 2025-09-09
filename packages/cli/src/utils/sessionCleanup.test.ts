/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '@google/gemini-cli-core';
import type { Settings } from '../config/settings.js';
import { cleanupExpiredSessions } from './sessionCleanup.js';
import { type SessionInfo, getSessionFiles } from './sessionUtils.js';

// Mock the fs module
vi.mock('fs/promises');
vi.mock('./sessionUtils.js', () => ({
  getSessionFiles: vi.fn(),
}));

const mockFs = vi.mocked(fs);
const mockGetSessionFiles = vi.mocked(getSessionFiles);

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
      fileName: 'session-2025-01-20T10-30-00-current12.json',
      lastUpdated: now.toISOString(),
      isCurrentSession: true,
    },
    {
      id: 'recent456',
      fileName: 'session-2025-01-18T15-45-00-recent45.json',
      lastUpdated: oneWeekAgo.toISOString(),
      isCurrentSession: false,
    },
    {
      id: 'old789abc',
      fileName: 'session-2025-01-10T09-15-00-old789ab.json',
      lastUpdated: twoWeeksAgo.toISOString(),
      isCurrentSession: false,
    },
    {
      id: 'ancient12',
      fileName: 'session-2024-12-25T12-00-00-ancient1.json',
      lastUpdated: oneMonthAgo.toISOString(),
      isCurrentSession: false,
    },
  ];
}

describe('Session Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionFiles.mockResolvedValue(createTestSessions());
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

      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should return early when sessionRetention is not configured', async () => {
      const config = createMockConfig();
      const settings: Settings = {};

      const result = await cleanupExpiredSessions(config, settings);

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

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Session cleanup disabled: Invalid maxAge format',
        ),
      );

      debugSpy.mockRestore();
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

      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(2); // Should delete the 2-week-old and 1-month-old sessions
      expect(result.skipped).toBe(2); // Current session + recent session should be skipped
      expect(result.errors).toHaveLength(0);
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
      expect(result.deleted).toBe(3);

      // Verify that unlink was never called with the current session file
      const unlinkCalls = mockFs.unlink.mock.calls;
      const currentSessionPath = path.join(
        '/tmp/test-project',
        'chats',
        'session-2025-01-20T10-30-00-current12.json',
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

      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Permission denied');
    });

    it('should validate session file structure before deletion', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '1d',
          },
        },
      };

      // Mock file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          // Missing required fields
          wrongField: 'value',
        }),
      );

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain(
        'Invalid session file structure',
      );
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

      mockGetSessionFiles.mockResolvedValue([]);

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle global errors gracefully', async () => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '30d',
          },
        },
      };

      // Mock getSessionFiles to throw an error
      mockGetSessionFiles.mockRejectedValue(
        new Error('Directory access failed'),
      );

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].sessionId).toBe('global');
      expect(result.errors[0].error).toContain('Directory access failed');
      expect(debugSpy).toHaveBeenCalledWith(
        'Session cleanup failed:',
        expect.any(Error),
      );

      debugSpy.mockRestore();
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
          file: 'session-current',
          fileName: 'session-current.json',
          startTime: now.toISOString(),
          lastUpdated: now.toISOString(),
          messageCount: 1,
          displayName: 'Current',
          firstUserMessage: 'Current',
          isCurrentSession: true,
          index: 1,
        },
        {
          id: 'session5d',
          file: 'session-5d',
          fileName: 'session-5d.json',
          startTime: fiveDaysAgo.toISOString(),
          lastUpdated: fiveDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '5 days old',
          firstUserMessage: '5 days',
          isCurrentSession: false,
          index: 2,
        },
        {
          id: 'session8d',
          file: 'session-8d',
          fileName: 'session-8d.json',
          startTime: eightDaysAgo.toISOString(),
          lastUpdated: eightDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '8 days old',
          firstUserMessage: '8 days',
          isCurrentSession: false,
          index: 3,
        },
        {
          id: 'session15d',
          file: 'session-15d',
          fileName: 'session-15d.json',
          startTime: fifteenDaysAgo.toISOString(),
          lastUpdated: fifteenDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '15 days old',
          firstUserMessage: '15 days',
          isCurrentSession: false,
          index: 4,
        },
      ];

      mockGetSessionFiles.mockResolvedValue(testSessions);

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
      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(2);
      expect(result.skipped).toBe(2); // Current + 5d session

      // Verify which files were deleted
      const unlinkCalls = mockFs.unlink.mock.calls.map((call) => call[0]);
      expect(unlinkCalls).toContain(
        path.join('/tmp/test-project', 'chats', 'session-8d.json'),
      );
      expect(unlinkCalls).toContain(
        path.join('/tmp/test-project', 'chats', 'session-15d.json'),
      );
      expect(unlinkCalls).not.toContain(
        path.join('/tmp/test-project', 'chats', 'session-5d.json'),
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
      const thirteenDaysAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000);

      const testSessions: SessionInfo[] = [
        {
          id: 'current',
          file: 'session-current',
          fileName: 'session-current.json',
          startTime: now.toISOString(),
          lastUpdated: now.toISOString(),
          messageCount: 1,
          displayName: 'Current',
          firstUserMessage: 'Current',
          isCurrentSession: true,
          index: 1,
        },
        {
          id: 'session1d',
          file: 'session-1d',
          fileName: 'session-1d.json',
          startTime: oneDayAgo.toISOString(),
          lastUpdated: oneDayAgo.toISOString(),
          messageCount: 1,
          displayName: '1 day old',
          firstUserMessage: '1 day',
          isCurrentSession: false,
          index: 2,
        },
        {
          id: 'session7d',
          file: 'session-7d',
          fileName: 'session-7d.json',
          startTime: sevenDaysAgo.toISOString(),
          lastUpdated: sevenDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '7 days old',
          firstUserMessage: '7 days',
          isCurrentSession: false,
          index: 3,
        },
        {
          id: 'session13d',
          file: 'session-13d',
          fileName: 'session-13d.json',
          startTime: thirteenDaysAgo.toISOString(),
          lastUpdated: thirteenDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '13 days old',
          firstUserMessage: '13 days',
          isCurrentSession: false,
          index: 4,
        },
      ];

      mockGetSessionFiles.mockResolvedValue(testSessions);

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
      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(4);
      expect(result.errors).toHaveLength(0);

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
          file: 'session-current',
          fileName: 'session-current.json',
          startTime: now.toISOString(),
          lastUpdated: now.toISOString(),
          messageCount: 1,
          displayName: 'Current (newest)',
          firstUserMessage: 'Current',
          isCurrentSession: true,
          index: 1,
        },
      ];

      // Add 5 more sessions with decreasing timestamps
      for (let i = 1; i <= 5; i++) {
        const daysAgo = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        sessions.push({
          id: `session${i}`,
          file: `session-${i}d`,
          fileName: `session-${i}d.json`,
          startTime: daysAgo.toISOString(),
          lastUpdated: daysAgo.toISOString(),
          messageCount: 1,
          displayName: `${i} days old`,
          firstUserMessage: `${i} days`,
          isCurrentSession: false,
          index: i + 1,
        });
      }

      mockGetSessionFiles.mockResolvedValue(sessions);

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
      expect(result.scanned).toBe(6);
      expect(result.deleted).toBe(3);
      expect(result.skipped).toBe(3);

      // Verify which files were deleted (should be the 3 oldest)
      const unlinkCalls = mockFs.unlink.mock.calls.map((call) => call[0]);
      expect(unlinkCalls).toContain(
        path.join('/tmp/test-project', 'chats', 'session-3d.json'),
      );
      expect(unlinkCalls).toContain(
        path.join('/tmp/test-project', 'chats', 'session-4d.json'),
      );
      expect(unlinkCalls).toContain(
        path.join('/tmp/test-project', 'chats', 'session-5d.json'),
      );

      // Verify which files were NOT deleted
      expect(unlinkCalls).not.toContain(
        path.join('/tmp/test-project', 'chats', 'session-current.json'),
      );
      expect(unlinkCalls).not.toContain(
        path.join('/tmp/test-project', 'chats', 'session-1d.json'),
      );
      expect(unlinkCalls).not.toContain(
        path.join('/tmp/test-project', 'chats', 'session-2d.json'),
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
          file: 'session-current',
          fileName: 'session-current.json',
          startTime: now.toISOString(),
          lastUpdated: now.toISOString(),
          messageCount: 1,
          displayName: 'Current',
          firstUserMessage: 'Current',
          isCurrentSession: true,
          index: 1,
        },
        {
          id: 'session3d',
          file: 'session-3d',
          fileName: 'session-3d.json',
          startTime: threeDaysAgo.toISOString(),
          lastUpdated: threeDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '3 days old',
          firstUserMessage: '3 days',
          isCurrentSession: false,
          index: 2,
        },
        {
          id: 'session5d',
          file: 'session-5d',
          fileName: 'session-5d.json',
          startTime: fiveDaysAgo.toISOString(),
          lastUpdated: fiveDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '5 days old',
          firstUserMessage: '5 days',
          isCurrentSession: false,
          index: 3,
        },
        {
          id: 'session7d',
          file: 'session-7d',
          fileName: 'session-7d.json',
          startTime: sevenDaysAgo.toISOString(),
          lastUpdated: sevenDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '7 days old',
          firstUserMessage: '7 days',
          isCurrentSession: false,
          index: 4,
        },
        {
          id: 'session12d',
          file: 'session-12d',
          fileName: 'session-12d.json',
          startTime: twelveDaysAgo.toISOString(),
          lastUpdated: twelveDaysAgo.toISOString(),
          messageCount: 1,
          displayName: '12 days old',
          firstUserMessage: '12 days',
          isCurrentSession: false,
          index: 5,
        },
      ];

      mockGetSessionFiles.mockResolvedValue(testSessions);

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
      expect(result.scanned).toBe(5);
      expect(result.deleted).toBe(3);
      expect(result.skipped).toBe(2); // Current + 3d session

      // Verify which files were deleted
      const unlinkCalls = mockFs.unlink.mock.calls.map((call) => call[0]);
      expect(unlinkCalls).toContain(
        path.join('/tmp/test-project', 'chats', 'session-5d.json'),
      );
      expect(unlinkCalls).toContain(
        path.join('/tmp/test-project', 'chats', 'session-7d.json'),
      );
      expect(unlinkCalls).toContain(
        path.join('/tmp/test-project', 'chats', 'session-12d.json'),
      );

      // Verify which files were NOT deleted
      expect(unlinkCalls).not.toContain(
        path.join('/tmp/test-project', 'chats', 'session-current.json'),
      );
      expect(unlinkCalls).not.toContain(
        path.join('/tmp/test-project', 'chats', 'session-3d.json'),
      );
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

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Either maxAge or maxCount must be specified'),
      );

      debugSpy.mockRestore();
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

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxCount must be at least 1'),
      );

      debugSpy.mockRestore();
    });

    it('should handle maxCount upper limit', async () => {
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxCount: 1001, // Too high
          },
        },
      };

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxCount cannot exceed 1000'),
      );

      debugSpy.mockRestore();
    });
  });
});
