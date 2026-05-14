
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startCallbackServer } from './oauth-flow.js';

describe('OAuth Flow Repro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not have an unhandled rejection when close() is called before timeout', async () => {
    let unhandledRejection: unknown = null;
    const handler = (reason: unknown) => {
      unhandledRejection = reason;
    };
    process.on('unhandledRejection', handler);

    try {
      const server = startCallbackServer('test-state');
      await server.port;

      // Explicitly close the server
      server.close();

      // Fast forward past the default 5 minute timeout
      vi.advanceTimersByTime(5 * 60 * 1000 + 100);

      // Give it a tick
      await Promise.resolve();
      await Promise.resolve();

      expect(unhandledRejection).toBeNull();
    } finally {
      process.off('unhandledRejection', handler);
    }
  });

  it('should not have an unhandled rejection even if NOT closed, due to internal catch', async () => {
    let unhandledRejection: unknown = null;
    const handler = (reason: unknown) => {
      unhandledRejection = reason;
    };
    process.on('unhandledRejection', handler);

    try {
      const server = startCallbackServer('test-state');
      await server.port;

      // Abandon the server without closing it
      
      // Fast forward past the default 5 minute timeout
      vi.advanceTimersByTime(5 * 60 * 1000 + 100);

      // Give it a tick
      await Promise.resolve();
      await Promise.resolve();

      // Should be null because startCallbackServer now has an internal .catch()
      expect(unhandledRejection).toBeNull();
      
      // Cleanup for the test
      server.close();
    } finally {
      process.off('unhandledRejection', handler);
    }
  });
});
