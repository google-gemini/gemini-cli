/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { cleanupExpiredSessions } from './sessionCleanup.js';
import type { Settings } from '../config/settings.js';
import {
  SESSION_FILE_PREFIX,
  type Config,
  debugLogger,
} from '@google/gemini-cli-core';

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
      `${SESSION_FILE_PREFIX}2024-01-01T10-00-00-test123.json`,
    );
    await fs.writeFile(
      sessionFile,
      JSON.stringify({
        sessionId: 'test123',
        messages: [],
        startTime: oldDate.toISOString(),
        lastUpdated: oldDate.toISOString(),
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
      `${SESSION_FILE_PREFIX}2024-01-01T10-00-00-test123.json`,
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true });
  });

  it('should validate configuration and fail gracefully', async () => {
    const errorSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
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
      `${SESSION_FILE_PREFIX}2024-12-01T10-00-00-old12345.json`,
    );
    await fs.writeFile(
      oldSessionFile,
      JSON.stringify({
        sessionId: 'old12345',
        messages: [{ type: 'user', content: 'test message' }],
        startTime: oldDate.toISOString(),
        lastUpdated: oldDate.toISOString(),
      }),
    );

    // Create a recent session file that should be kept
    const recentSessionFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2025-01-15T10-00-00-recent789.json`,
    );
    await fs.writeFile(
      recentSessionFile,
      JSON.stringify({
        sessionId: 'recent789',
        messages: [{ type: 'user', content: 'test message' }],
        startTime: recentDate.toISOString(),
        lastUpdated: recentDate.toISOString(),
      }),
    );

    // Create a current session file that should always be kept
    const currentSessionFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2025-01-20T10-00-00-current123.json`,
    );
    await fs.writeFile(
      currentSessionFile,
      JSON.stringify({
        sessionId: 'current123',
        messages: [{ type: 'user', content: 'test message' }],
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
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
        `${SESSION_FILE_PREFIX}2025-01-15T10-00-00-recent789.json`,
      );
      expect(remainingFiles).toContain(
        `${SESSION_FILE_PREFIX}2025-01-20T10-00-00-current123.json`,
      );
      expect(remainingFiles).not.toContain(
        `${SESSION_FILE_PREFIX}2024-12-01T10-00-00-old12345.json`,
      );
    } finally {
      // Clean up test directory
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should delete subagent files and their artifacts when parent expires', async () => {
    // Create a temporary directory with test sessions
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-test-'));
    const chatsDir = path.join(tempDir, 'chats');
    const logsDir = path.join(tempDir, 'logs');
    const toolOutputsDir = path.join(tempDir, 'tool-outputs');

    await fs.mkdir(chatsDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(toolOutputsDir, { recursive: true });

    const now = new Date();
    const oldDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

    // The shortId that ties them together
    const sharedShortId = 'abcdef12';

    const parentSessionId = 'parent-uuid-123';
    const parentFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2024-01-01T10-00-00-${sharedShortId}.json`,
    );
    await fs.writeFile(
      parentFile,
      JSON.stringify({
        sessionId: parentSessionId,
        messages: [],
        startTime: oldDate.toISOString(),
        lastUpdated: oldDate.toISOString(),
      }),
    );

    const subagentSessionId = 'subagent-uuid-456';
    const subagentFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2024-01-01T10-05-00-${sharedShortId}.json`,
    );
    await fs.writeFile(
      subagentFile,
      JSON.stringify({
        sessionId: subagentSessionId,
        messages: [],
        startTime: oldDate.toISOString(),
        lastUpdated: oldDate.toISOString(),
      }),
    );

    const parentLogFile = path.join(
      logsDir,
      `session-${parentSessionId}.jsonl`,
    );
    await fs.writeFile(parentLogFile, '{"log": "parent"}');

    const parentToolOutputsDir = path.join(
      toolOutputsDir,
      `session-${parentSessionId}`,
    );
    await fs.mkdir(parentToolOutputsDir, { recursive: true });
    await fs.writeFile(
      path.join(parentToolOutputsDir, 'some-output.txt'),
      'data',
    );

    const subagentLogFile = path.join(
      logsDir,
      `session-${subagentSessionId}.jsonl`,
    );
    await fs.writeFile(subagentLogFile, '{"log": "subagent"}');

    const subagentToolOutputsDir = path.join(
      toolOutputsDir,
      `session-${subagentSessionId}`,
    );
    await fs.mkdir(subagentToolOutputsDir, { recursive: true });
    await fs.writeFile(
      path.join(subagentToolOutputsDir, 'some-output.txt'),
      'data',
    );

    const currentShortId = 'current1';
    const currentFile = path.join(
      chatsDir,
      `${SESSION_FILE_PREFIX}2025-01-20T10-00-00-${currentShortId}.json`,
    );
    await fs.writeFile(
      currentFile,
      JSON.stringify({
        sessionId: 'current-session',
        messages: [
          {
            type: 'user',
            content: [{ type: 'text', text: 'hello' }],
            timestamp: now.toISOString(),
          },
        ],
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
      }),
    );

    // Configure test
    const config: Config = {
      storage: {
        getProjectTempDir: () => tempDir,
      },
      getSessionId: () => 'current-session', // Mock CLI instance ID
      getDebugMode: () => false,
      initialize: async () => undefined,
    } as unknown as Config;

    const settings: Settings = {
      general: {
        sessionRetention: {
          enabled: true,
          maxAge: '1d', // Expire things older than 1 day
        },
      },
    };

    try {
      const result = await cleanupExpiredSessions(config, settings);

      // Verify the cleanup result object
      // It scanned 3 files. It should delete 2 (parent + subagent), and keep 1 (current)
      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(3);
      expect(result.deleted).toBe(2);
      expect(result.skipped).toBe(1);

      // Verify on-disk file states
      const chats = await fs.readdir(chatsDir);
      expect(chats).toHaveLength(1);
      expect(chats).toContain(
        `${SESSION_FILE_PREFIX}2025-01-20T10-00-00-${currentShortId}.json`,
      ); // Only current is left

      const logs = await fs.readdir(logsDir);
      expect(logs).toHaveLength(0); // Both parent and subagent logs were deleted

      const tools = await fs.readdir(toolOutputsDir);
      expect(tools).toHaveLength(0); // Both parent and subagent tool output dirs were deleted
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
