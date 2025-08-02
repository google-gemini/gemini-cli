/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { cleanupExpiredSessions } from './sessionCleanup.js';
import { Settings } from '../config/settings.js';
import { Config } from '@google/gemini-cli-core';

// Create a mock config for integration testing
function createTestConfig(): Config {
  return {
    getProjectTempDir: () => '/tmp/nonexistent-test-dir',
    getSessionId: () => 'test-session-id',
    getDebugMode: () => false,
    initialize: async () => undefined,
  } as unknown as Config;
}

describe('Session Cleanup Integration', () => {
  it('should gracefully handle non-existent directories', async () => {
    const config = createTestConfig();
    const settings: Settings = {
      sessionRetention: {
        enabled: true,
        maxAge: '30d'
      }
    };

    const startTime = Date.now();
    const result = await cleanupExpiredSessions(config, settings);
    const endTime = Date.now();

    // Should complete quickly even with non-existent directory
    expect(endTime - startTime).toBeLessThan(100);
    
    // Should return empty result for non-existent directory
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should not impact startup when disabled', async () => {
    const config = createTestConfig();
    const settings: Settings = {
      sessionRetention: {
        enabled: false
      }
    };

    const startTime = Date.now();
    const result = await cleanupExpiredSessions(config, settings);
    const endTime = Date.now();

    // Should complete almost instantly when disabled
    expect(endTime - startTime).toBeLessThan(10);
    
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle missing sessionRetention configuration', async () => {
    const config = createTestConfig();
    const settings: Settings = {};

    const startTime = Date.now();
    const result = await cleanupExpiredSessions(config, settings);
    const endTime = Date.now();

    // Should complete almost instantly when not configured
    expect(endTime - startTime).toBeLessThan(10);
    
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate configuration and fail gracefully', async () => {
    const config = createTestConfig();
    const settings: Settings = {
      sessionRetention: {
        enabled: true,
        maxAge: 'invalid-format'
      }
    };

    const startTime = Date.now();
    const result = await cleanupExpiredSessions(config, settings);
    const endTime = Date.now();

    // Should complete quickly even with invalid config
    expect(endTime - startTime).toBeLessThan(50);
    
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});