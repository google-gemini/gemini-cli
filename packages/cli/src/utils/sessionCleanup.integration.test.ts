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
});
