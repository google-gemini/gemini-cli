/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '@google/gemini-cli-core';
import { Settings } from '../config/settings.js';
import { cleanupExpiredSessions } from './sessionCleanup.js';
import { SessionInfo, getSessionFiles } from './sessionUtils.js';

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
    getProjectTempDir: vi.fn().mockReturnValue('/tmp/test-project'),
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
      file: 'session-2025-01-20T10-30-00-current12',
      fileName: 'session-2025-01-20T10-30-00-current12.json',
      startTime: now.toISOString(),
      lastUpdated: now.toISOString(),
      messageCount: 5,
      displayName: 'Current session',
      firstUserMessage: 'Current session',
      isCurrentSession: true,
      index: 1,
    },
    {
      id: 'recent456',
      file: 'session-2025-01-18T15-45-00-recent45',
      fileName: 'session-2025-01-18T15-45-00-recent45.json',
      startTime: oneWeekAgo.toISOString(),
      lastUpdated: oneWeekAgo.toISOString(),
      messageCount: 10,
      displayName: 'Recent session',
      firstUserMessage: 'Recent session',
      isCurrentSession: false,
      index: 2,
    },
    {
      id: 'old789abc',
      file: 'session-2025-01-10T09-15-00-old789ab',
      fileName: 'session-2025-01-10T09-15-00-old789ab.json',
      startTime: twoWeeksAgo.toISOString(),
      lastUpdated: twoWeeksAgo.toISOString(),
      messageCount: 3,
      displayName: 'Old session',
      firstUserMessage: 'Old session',
      isCurrentSession: false,
      index: 3,
    },
    {
      id: 'ancient12',
      file: 'session-2024-12-25T12-00-00-ancient1',
      fileName: 'session-2024-12-25T12-00-00-ancient1.json',
      startTime: oneMonthAgo.toISOString(),
      lastUpdated: oneMonthAgo.toISOString(),
      messageCount: 15,
      displayName: 'Ancient session',
      firstUserMessage: 'Ancient session',
      isCurrentSession: false,
      index: 4,
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
        sessionRetention: { enabled: false }
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
      const config = createMockConfig({ getDebugMode: vi.fn().mockReturnValue(true) });
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxAge: 'invalid-format'
        }
      };

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session cleanup disabled: Invalid maxAge format')
      );

      debugSpy.mockRestore();
    });

    it('should delete sessions older than maxAge', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxAge: '10d' // 10 days
        }
      };

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        sessionId: 'test',
        messages: [],
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z'
      }));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(2); // Should delete the 2-week-old and 1-month-old sessions
      expect(result.skipped).toBe(1); // Recent session should be skipped
      expect(result.errors).toHaveLength(0);
    });

    it('should never delete current session', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxAge: '1d' // Very short retention
        }
      };

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        sessionId: 'test',
        messages: [],
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z'
      }));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      // Should delete all sessions except the current one
      expect(result.deleted).toBe(3);
   
      // Verify that unlink was never called with the current session file
      const unlinkCalls = mockFs.unlink.mock.calls;
      const currentSessionPath = path.join('/tmp/test-project', 'chats', 'session-2025-01-20T10-30-00-current12.json');
      expect(unlinkCalls.find(call => call[0] === currentSessionPath)).toBeUndefined();
    });

    it('should handle count-based retention', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxCount: 2 // Keep only 2 most recent sessions
        }
      };

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        sessionId: 'test',
        messages: [],
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z'
      }));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(4);
      expect(result.deleted).toBe(2); // Should delete 2 oldest sessions (after skipping the current one)
      expect(result.skipped).toBe(1); // Current session + 1 recent session should be kept
    });

    it('should handle file system errors gracefully', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxAge: '1d'
        }
      };

      // Mock file operations to succeed for access and readFile but fail for unlink
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        sessionId: 'test',
        messages: [],
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z'
      }));
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
        sessionRetention: {
          enabled: true,
          maxAge: '1d'
        }
      };

      // Mock file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        // Missing required fields
        wrongField: 'value'
      }));

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Invalid session file structure');
    });

    it('should handle empty sessions directory', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxAge: '30d'
        }
      };

      mockGetSessionFiles.mockResolvedValue([]);

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle global errors gracefully', async () => {
      const config = createMockConfig({ getDebugMode: vi.fn().mockReturnValue(true) });
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxAge: '30d'
        }
      };

      // Mock getSessionFiles to throw an error
      mockGetSessionFiles.mockRejectedValue(new Error('Directory access failed'));

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].sessionId).toBe('global');
      expect(result.errors[0].error).toContain('Directory access failed');
      expect(debugSpy).toHaveBeenCalledWith('Session cleanup failed:', expect.any(Error));

      debugSpy.mockRestore();
    });

    it('should respect minRetention configuration', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxAge: '12h', // Less than 1 day minimum
          minRetention: '1d'
        }
      };

      const result = await cleanupExpiredSessions(config, settings);

      // Should disable cleanup due to minRetention violation
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should log debug information when enabled', async () => {
      const config = createMockConfig({ getDebugMode: vi.fn().mockReturnValue(true) });
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxAge: '10d'
        }
      };

      // Mock successful file operations
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        sessionId: 'test',
        messages: [],
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z'
      }));
      mockFs.unlink.mockResolvedValue(undefined);

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      await cleanupExpiredSessions(config, settings);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session cleanup: deleted')
      );
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deleted expired session:')
      );

      debugSpy.mockRestore();
    });
  });

  describe('Configuration validation', () => {
    it('should require either maxAge or maxCount', async () => {
      const config = createMockConfig({ getDebugMode: vi.fn().mockReturnValue(true) });
      const settings: Settings = {
        sessionRetention: {
          enabled: true
          // Neither maxAge nor maxCount specified
        }
      };

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Either maxAge or maxCount must be specified')
      );

      debugSpy.mockRestore();
    });

    it('should validate maxCount range', async () => {
      const config = createMockConfig({ getDebugMode: vi.fn().mockReturnValue(true) });
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxCount: 0 // Invalid count
        }
      };

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxCount must be at least 1')
      );

      debugSpy.mockRestore();
    });

    it('should handle maxCount upper limit', async () => {
      const config = createMockConfig({ getDebugMode: vi.fn().mockReturnValue(true) });
      const settings: Settings = {
        sessionRetention: {
          enabled: true,
          maxCount: 1001 // Too high
        }
      };

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(0);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('maxCount cannot exceed 1000')
      );

      debugSpy.mockRestore();
    });
  });
});