/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { cleanupExpiredSessions } from './sessionCleanup.js';
import type { Settings } from '../config/settings.js';
import { SESSION_FILE_PREFIX, type Config } from '@google/gemini-cli-core';

const createJsonlSession = (options: {
  sessionId: string;
  startTime: string;
  lastUpdated: string;
  messages: Array<{
    id: string;
    type: 'user' | 'gemini' | 'info' | 'error' | 'warning';
    content: string;
    timestamp: string;
  }>;
}) =>
  `${[
    {
      type: 'session_metadata',
      sessionId: options.sessionId,
      startTime: options.startTime,
      lastUpdated: options.lastUpdated,
    },
    ...options.messages,
  ]
    .map((entry) => JSON.stringify(entry))
    .join('\n')}\n`;

// Create a mock config for integration testing
function createTestConfig(): Config {
  return {
    storage: {
      getProjectTempDir: () => '/tmp/nonexistent-test-dir',
    },
    getSessionId: () => 'test-session-id',
    getDebugMode: () => false,
    initialize: async () => undefined,
  } as unknown as Config;
}

describe('Session Cleanup Integration', () => {
  it('should gracefully handle non-existent directories', async () => {
    const config = createTestConfig();
    const settings: Settings = {
      general: {
        sessionRetention: {
          enabled: true,
          maxAge: '30d',
        },
      },
    };

    const result = await cleanupExpiredSessions(config, settings);

    // Should return empty result for non-existent directory
    expect(result.disabled).toBe(false);
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('should not impact startup when disabled', async () => {
    const config = createTestConfig();
    const settings: Settings = {
      general: {
        sessionRetention: {
          enabled: false,
        },
      },
    };

    const result = await cleanupExpiredSessions(config, settings);

    expect(result.disabled).toBe(true);
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('should handle missing sessionRetention configuration', async () => {
    // Create test session files to verify they are NOT deleted when config is missing
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-test-'));
    const chatsDir = path.join(tempDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Create an old session file that would normally be deleted
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const sessionFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2024-01-01T10-00-00-test123.jsonl`,
    );
    await fs.writeFile(
      sessionFile,
      createJsonlSession({
        sessionId: 'test123',
        startTime: oldDate.toISOString(),
        lastUpdated: oldDate.toISOString(),
        messages: [],
      }),
    );

    const config = createTestConfig();
    config.storage.getProjectTempDir = vi.fn().mockReturnValue(tempDir);

    const settings: Settings = {};

    const result = await cleanupExpiredSessions(config, settings);

    expect(result.disabled).toBe(true);
    expect(result.scanned).toBe(0); // Should not even scan when config is missing
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // Verify the session file still exists (was not deleted)
    const filesAfter = await fs.readdir(chatsDir);
    expect(filesAfter).toContain(
      `${SESSION_FILE_PREFIX}2024-01-01T10-00-00-test123.jsonl`,
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true });
  });

  it('should validate configuration and fail gracefully', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = createTestConfig();

    const settings: Settings = {
      general: {
        sessionRetention: {
          enabled: true,
          maxAge: 'invalid-format',
        },
      },
    };

    const result = await cleanupExpiredSessions(config, settings);

    expect(result.disabled).toBe(true);
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // Verify error logging provides visibility into the validation failure
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Session cleanup disabled: Error: Invalid retention period format',
      ),
    );

    errorSpy.mockRestore();
  });

  it('should clean up expired sessions when they exist', async () => {
    // Create a temporary directory with test sessions
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-test-'));
    const chatsDir = path.join(tempDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Create test session files with different ages
    const now = new Date();
    const oldDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
    const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

    // Create an old session file that should be deleted
    const oldSessionFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2024-12-01T10-00-00-old12345.jsonl`,
    );
    await fs.writeFile(
      oldSessionFile,
      createJsonlSession({
        sessionId: 'old12345',
        startTime: oldDate.toISOString(),
        lastUpdated: oldDate.toISOString(),
        messages: [
          {
            id: 'msg-old',
            type: 'user',
            content: 'test message',
            timestamp: oldDate.toISOString(),
          },
        ],
      }),
    );

    // Create a recent session file that should be kept
    const recentSessionFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2025-01-15T10-00-00-recent789.jsonl`,
    );
    await fs.writeFile(
      recentSessionFile,
      createJsonlSession({
        sessionId: 'recent789',
        startTime: recentDate.toISOString(),
        lastUpdated: recentDate.toISOString(),
        messages: [
          {
            id: 'msg-recent',
            type: 'user',
            content: 'test message',
            timestamp: recentDate.toISOString(),
          },
        ],
      }),
    );

    // Create a current session file that should always be kept
    const currentSessionFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2025-01-20T10-00-00-current123.jsonl`,
    );
    await fs.writeFile(
      currentSessionFile,
      createJsonlSession({
        sessionId: 'current123',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messages: [
          {
            id: 'msg-current',
            type: 'user',
            content: 'test message',
            timestamp: now.toISOString(),
          },
        ],
      }),
    );

    // Configure test with real temp directory
    const config: Config = {
      storage: {
        getProjectTempDir: () => tempDir,
      },
      getSessionId: () => 'current123',
      getDebugMode: () => false,
      initialize: async () => undefined,
    } as unknown as Config;

    const settings: Settings = {
      general: {
        sessionRetention: {
          enabled: true,
          maxAge: '30d', // Keep sessions for 30 days
        },
      },
    };

    try {
      const result = await cleanupExpiredSessions(config, settings);

      // Verify the result
      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(3); // Should scan all 3 sessions
      expect(result.deleted).toBe(1); // Should delete the old session (35 days old)
      expect(result.skipped).toBe(2); // Should keep recent and current sessions
      expect(result.failed).toBe(0);

      // Verify files on disk
      const remainingFiles = await fs.readdir(chatsDir);
      expect(remainingFiles).toHaveLength(2); // Only 2 files should remain
      expect(remainingFiles).toContain(
        `${SESSION_FILE_PREFIX}2025-01-15T10-00-00-recent789.jsonl`,
      );
      expect(remainingFiles).toContain(
        `${SESSION_FILE_PREFIX}2025-01-20T10-00-00-current123.jsonl`,
      );
      expect(remainingFiles).not.toContain(
        `${SESSION_FILE_PREFIX}2024-12-01T10-00-00-old12345.jsonl`,
      );
    } finally {
      // Clean up test directory
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
