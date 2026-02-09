/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Config } from '@google/gemini-cli-core';

// --- Mocks (hoisted) ---

const mockInitActivityLogger = vi.hoisted(() => vi.fn());
const mockAddNetworkTransport = vi.hoisted(() => vi.fn());

type Listener = (...args: unknown[]) => void;

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    close = vi.fn();
    url: string;
    static instances: MockWebSocket[] = [];
    private listeners = new Map<string, Listener[]>();

    constructor(url: string) {
      this.url = url;
      MockWebSocket.instances.push(this);
    }

    on(event: string, fn: Listener) {
      const fns = this.listeners.get(event) || [];
      fns.push(fn);
      this.listeners.set(event, fns);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const fn of this.listeners.get(event) || []) {
        fn(...args);
      }
    }

    simulateOpen() {
      this.emit('open');
    }

    simulateError() {
      this.emit('error', new Error('ECONNREFUSED'));
    }
  }
  return { MockWebSocket };
});

const mockDevToolsInstance = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  getPort: vi.fn(),
}));

vi.mock('./activityLogger.js', () => ({
  initActivityLogger: mockInitActivityLogger,
  addNetworkTransport: mockAddNetworkTransport,
}));

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('ws', () => ({
  default: MockWebSocket,
}));

vi.mock('gemini-cli-devtools', () => ({
  DevTools: {
    getInstance: () => mockDevToolsInstance,
  },
}));

// --- Import under test (after mocks) ---
import { registerActivityLogger, resetForTesting } from './devtoolsService.js';

function createMockConfig(overrides: Record<string, unknown> = {}) {
  return {
    isInteractive: vi.fn().mockReturnValue(true),
    getSessionId: vi.fn().mockReturnValue('test-session'),
    getDebugMode: vi.fn().mockReturnValue(false),
    storage: { getProjectTempLogsDir: vi.fn().mockReturnValue('/tmp/logs') },
    ...overrides,
  } as unknown as Config;
}

describe('devtoolsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.instances = [];
    resetForTesting();
    delete process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'];
  });

  describe('registerActivityLogger', () => {
    it('connects to existing DevTools server when probe succeeds', async () => {
      const config = createMockConfig();

      // The probe WebSocket will succeed
      const promise = registerActivityLogger(config);

      // Wait for WebSocket to be created
      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(1);
      });

      // Simulate probe success
      MockWebSocket.instances[0].simulateOpen();

      await promise;

      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'network',
        host: '127.0.0.1',
        port: 25417,
        onReconnectFailed: expect.any(Function),
      });
    });

    it('starts new DevTools server when probe fails', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      const promise = registerActivityLogger(config);

      // Wait for probe WebSocket
      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(1);
      });

      // Simulate probe failure
      MockWebSocket.instances[0].simulateError();

      await promise;

      expect(mockDevToolsInstance.start).toHaveBeenCalled();
      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'network',
        host: '127.0.0.1',
        port: 25417,
        onReconnectFailed: expect.any(Function),
      });
    });

    it('falls back to file mode when target env var is set', async () => {
      process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'] = '/tmp/test.jsonl';
      const config = createMockConfig();

      await registerActivityLogger(config);

      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'file',
        filePath: '/tmp/test.jsonl',
      });
    });

    it('does nothing in file mode when config.storage is missing', async () => {
      process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'] = '/tmp/test.jsonl';
      const config = createMockConfig({ storage: undefined });

      await registerActivityLogger(config);

      expect(mockInitActivityLogger).not.toHaveBeenCalled();
    });

    it('falls back to file logging when DevTools start fails', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockRejectedValue(
        new Error('MODULE_NOT_FOUND'),
      );

      const promise = registerActivityLogger(config);

      // Wait for probe WebSocket
      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(1);
      });

      // Probe fails → tries to start server → server start fails → file fallback
      MockWebSocket.instances[0].simulateError();

      await promise;

      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'file',
        filePath: undefined,
      });
    });
  });

  describe('startOrJoinDevTools (via registerActivityLogger)', () => {
    it('stops own server and connects to existing when losing port race', async () => {
      const config = createMockConfig();

      // Server starts on a different port (lost the race)
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25418');
      mockDevToolsInstance.getPort.mockReturnValue(25418);

      const promise = registerActivityLogger(config);

      // First: probe for existing server (fails)
      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(1);
      });
      MockWebSocket.instances[0].simulateError();

      // Second: after starting, probes the default port winner
      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(2);
      });
      // Winner is alive
      MockWebSocket.instances[1].simulateOpen();

      await promise;

      expect(mockDevToolsInstance.stop).toHaveBeenCalled();
      expect(mockInitActivityLogger).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          mode: 'network',
          host: '127.0.0.1',
          port: 25417, // connected to winner's port
        }),
      );
    });

    it('keeps own server when winner is not responding', async () => {
      const config = createMockConfig();

      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25418');
      mockDevToolsInstance.getPort.mockReturnValue(25418);

      const promise = registerActivityLogger(config);

      // Probe for existing (fails)
      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(1);
      });
      MockWebSocket.instances[0].simulateError();

      // Probe the winner (also fails)
      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(2);
      });
      MockWebSocket.instances[1].simulateError();

      await promise;

      expect(mockDevToolsInstance.stop).not.toHaveBeenCalled();
      expect(mockInitActivityLogger).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          mode: 'network',
          port: 25418, // kept own port
        }),
      );
    });
  });

  describe('handlePromotion (via onReconnectFailed)', () => {
    it('caps promotion attempts at MAX_PROMOTION_ATTEMPTS', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      // First: set up the logger so we can grab onReconnectFailed
      const promise = registerActivityLogger(config);

      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(1);
      });
      MockWebSocket.instances[0].simulateError();

      await promise;

      // Extract onReconnectFailed callback
      const initCall = mockInitActivityLogger.mock.calls[0];
      const onReconnectFailed = initCall[1].onReconnectFailed;
      expect(onReconnectFailed).toBeDefined();

      // Trigger promotion MAX_PROMOTION_ATTEMPTS + 1 times
      // Each call should succeed (addNetworkTransport called) until cap is hit
      mockAddNetworkTransport.mockClear();

      await onReconnectFailed(); // attempt 1
      await onReconnectFailed(); // attempt 2
      await onReconnectFailed(); // attempt 3
      await onReconnectFailed(); // attempt 4 — should be capped

      // Only 3 calls to addNetworkTransport (capped at MAX_PROMOTION_ATTEMPTS)
      expect(mockAddNetworkTransport).toHaveBeenCalledTimes(3);
    });
  });
});
