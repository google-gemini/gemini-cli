/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { cleanupExpiredSessions } from './sessionCleanup.js';
import type { Settings } from '../config/settings.js';
import type { Config } from '@google/gemini-cli-core';

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
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
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

    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle missing sessionRetention configuration', async () => {
    const config = createTestConfig();
    const settings: Settings = {};

    const result = await cleanupExpiredSessions(config, settings);

    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate configuration and fail gracefully', async () => {
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

    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
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
      'session-2024-12-01T10-00-00-old12345.json',
    );
    await fs.writeFile(
      oldSessionFile,
      JSON.stringify({
        sessionId: 'old12345',
        messages: [],
        startTime: oldDate.toISOString(),
        lastUpdated: oldDate.toISOString(),
      }),
    );

    // Create a recent session file that should be kept
    const recentSessionFile = path.join(
      chatsDir,
      'session-2025-01-15T10-00-00-recent789.json',
    );
    await fs.writeFile(
      recentSessionFile,
      JSON.stringify({
        sessionId: 'recent789',
        messages: [],
        startTime: recentDate.toISOString(),
        lastUpdated: recentDate.toISOString(),
      }),
    );

    // Create a current session file that should always be kept
    const currentSessionFile = path.join(
      chatsDir,
      'session-2025-01-20T10-00-00-current123.json',
    );
    await fs.writeFile(
      currentSessionFile,
      JSON.stringify({
        sessionId: 'current123',
        messages: [],
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
      expect(result.scanned).toBe(3); // Should scan all 3 sessions
      expect(result.deleted).toBe(1); // Should delete the old session (35 days old)
      expect(result.skipped).toBe(2); // Should keep recent and current sessions
      expect(result.errors).toHaveLength(0);

      // Verify files on disk
      const remainingFiles = await fs.readdir(chatsDir);
      expect(remainingFiles).toHaveLength(2); // Only 2 files should remain
      expect(remainingFiles).toContain(
        'session-2025-01-15T10-00-00-recent789.json',
      );
      expect(remainingFiles).toContain(
        'session-2025-01-20T10-00-00-current123.json',
      );
      expect(remainingFiles).not.toContain(
        'session-2024-12-01T10-00-00-old12345.json',
      );
    } finally {
      // Clean up test directory
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
