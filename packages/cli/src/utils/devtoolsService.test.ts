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

const mockActivityLoggerInstance = vi.hoisted(() => ({
  disableNetworkLogging: vi.fn(),
  enableNetworkLogging: vi.fn(),
  getBufferedLogs: vi.fn().mockReturnValue({ network: [], console: [] }),
}));

vi.mock('./activityLogger.js', () => ({
  initActivityLogger: mockInitActivityLogger,
  addNetworkTransport: mockAddNetworkTransport,
  ActivityLogger: {
    getInstance: () => mockActivityLoggerInstance,
  },
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
import {
  setupInitialActivityLogger,
  startDevToolsServer,
  resetForTesting,
} from './devtoolsService.js';

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

  describe('setupInitialActivityLogger', () => {
    it('initializes in network mode with no host/port and disables logging', () => {
      const config = createMockConfig();
      setupInitialActivityLogger(config);

      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'network',
        host: '',
        port: 0,
      });
      expect(
        mockActivityLoggerInstance.disableNetworkLogging,
      ).toHaveBeenCalled();
    });

    it('initializes in file mode when target env var is set', () => {
      process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'] = '/tmp/test.jsonl';
      const config = createMockConfig();
      setupInitialActivityLogger(config);

      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'file',
        filePath: '/tmp/test.jsonl',
      });
    });
  });

  describe('startDevToolsServer', () => {
    it('starts new server when none exists and enables logging', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      const promise = startDevToolsServer(config);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      const url = await promise;

      expect(url).toBe('http://127.0.0.1:25417');
      expect(mockAddNetworkTransport).toHaveBeenCalledWith(
        config,
        '127.0.0.1',
        25417,
        expect.any(Function),
      );
      expect(
        mockActivityLoggerInstance.enableNetworkLogging,
      ).toHaveBeenCalled();
    });

    it('connects to existing server if one is found', async () => {
      const config = createMockConfig();

      const promise = startDevToolsServer(config);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateOpen();

      const url = await promise;

      expect(url).toBe('http://127.0.0.1:25417');
      expect(mockAddNetworkTransport).toHaveBeenCalled();
      expect(
        mockActivityLoggerInstance.enableNetworkLogging,
      ).toHaveBeenCalled();
    });
  });

  describe('handlePromotion (via startDevToolsServer)', () => {
    it('caps promotion attempts at MAX_PROMOTION_ATTEMPTS', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      // First: set up the logger so we can grab onReconnectFailed
      const promise = startDevToolsServer(config);

      await vi.waitFor(() => {
        expect(MockWebSocket.instances.length).toBe(1);
      });
      MockWebSocket.instances[0].simulateError();

      await promise;

      // Extract onReconnectFailed callback
      const initCall = mockAddNetworkTransport.mock.calls[0];
      const onReconnectFailed = initCall[3];
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
