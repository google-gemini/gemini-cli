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
  drainBufferedLogs: vi.fn().mockReturnValue({ network: [], console: [] }),
}));

vi.mock('./activityLogger.js', () => ({
  initActivityLogger: mockInitActivityLogger,
  addNetworkTransport: mockAddNetworkTransport,
  ActivityLogger: {
    getInstance: () => mockActivityLoggerInstance,
  },
}));

const mockShouldLaunchBrowser = vi.hoisted(() => vi.fn(() => true));
const mockOpenBrowserSecurely = vi.hoisted(() =>
  vi.fn(() => Promise.resolve()),
);

vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  shouldLaunchBrowser: mockShouldLaunchBrowser,
  openBrowserSecurely: mockOpenBrowserSecurely,
}));

vi.mock('ws', () => ({
  default: MockWebSocket,
}));

vi.mock('@google/gemini-cli-devtools', () => ({
  DevTools: {
    getInstance: () => mockDevToolsInstance,
  },
}));

// --- Import under test (after mocks) ---
import {
  setupInitialActivityLogger,
  startDevToolsServer,
  toggleDevToolsPanel,
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
    it('stays in buffer mode when no existing server found', async () => {
      const config = createMockConfig();
      const promise = setupInitialActivityLogger(config);

      // Probe fires immediately — no server running
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      await promise;

      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'buffer',
      });
      expect(mockAddNetworkTransport).not.toHaveBeenCalled();
    });

    it('attaches transport when existing server found at startup', async () => {
      const config = createMockConfig();
      const promise = setupInitialActivityLogger(config);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateOpen();

      await promise;

      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'buffer',
      });
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

    it('F12 short-circuits when startup already connected', async () => {
      const config = createMockConfig();

      // Startup: probe succeeds
      const setupPromise = setupInitialActivityLogger(config);
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateOpen();
      await setupPromise;

      mockAddNetworkTransport.mockClear();
      mockActivityLoggerInstance.enableNetworkLogging.mockClear();

      // F12: should return URL immediately
      const url = await startDevToolsServer(config);

      expect(url).toBe('http://localhost:25417');
      expect(mockAddNetworkTransport).not.toHaveBeenCalled();
      expect(mockDevToolsInstance.start).not.toHaveBeenCalled();
    });

    it('initializes in file mode when target env var is set', async () => {
      process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'] = '/tmp/test.jsonl';
      const config = createMockConfig();
      await setupInitialActivityLogger(config);

      expect(mockInitActivityLogger).toHaveBeenCalledWith(config, {
        mode: 'file',
        filePath: '/tmp/test.jsonl',
      });
      // No probe attempted
      expect(MockWebSocket.instances.length).toBe(0);
    });

    it('does nothing in file mode when config.storage is missing', async () => {
      process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'] = '/tmp/test.jsonl';
      const config = createMockConfig({ storage: undefined });
      await setupInitialActivityLogger(config);

      expect(mockInitActivityLogger).not.toHaveBeenCalled();
      expect(MockWebSocket.instances.length).toBe(0);
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

      expect(url).toBe('http://localhost:25417');
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

      expect(url).toBe('http://localhost:25417');
      expect(mockAddNetworkTransport).toHaveBeenCalled();
      expect(
        mockActivityLoggerInstance.enableNetworkLogging,
      ).toHaveBeenCalled();
    });

    it('deduplicates concurrent calls (returns same promise)', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      const promise1 = startDevToolsServer(config);
      const promise2 = startDevToolsServer(config);

      expect(promise1).toBe(promise2);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      const [url1, url2] = await Promise.all([promise1, promise2]);
      expect(url1).toBe('http://localhost:25417');
      expect(url2).toBe('http://localhost:25417');
      // Only one probe + one server start
      expect(mockAddNetworkTransport).toHaveBeenCalledTimes(1);
    });

    it('throws when DevTools server fails to start', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockRejectedValue(
        new Error('MODULE_NOT_FOUND'),
      );

      const promise = startDevToolsServer(config);

      // Probe fails first
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      await expect(promise).rejects.toThrow('MODULE_NOT_FOUND');
      expect(mockAddNetworkTransport).not.toHaveBeenCalled();
    });

    it('allows retry after server start failure', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockRejectedValueOnce(
        new Error('MODULE_NOT_FOUND'),
      );

      const promise1 = startDevToolsServer(config);

      // Probe fails
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      await expect(promise1).rejects.toThrow('MODULE_NOT_FOUND');

      // Second attempt should work (not return the cached rejected promise)
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      const promise2 = startDevToolsServer(config);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(2));
      MockWebSocket.instances[1].simulateError();

      const url = await promise2;
      expect(url).toBe('http://localhost:25417');
      expect(mockAddNetworkTransport).toHaveBeenCalled();
    });

    it('short-circuits on second F12 after successful start', async () => {
      const config = createMockConfig();
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      const promise1 = startDevToolsServer(config);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      const url1 = await promise1;
      expect(url1).toBe('http://localhost:25417');

      mockAddNetworkTransport.mockClear();
      mockDevToolsInstance.start.mockClear();

      // Second call should short-circuit via connectedUrl
      const url2 = await startDevToolsServer(config);
      expect(url2).toBe('http://localhost:25417');
      expect(mockAddNetworkTransport).not.toHaveBeenCalled();
      expect(mockDevToolsInstance.start).not.toHaveBeenCalled();
    });

    it('stops own server and connects to existing when losing port race', async () => {
      const config = createMockConfig();

      // Server starts on a different port (lost the race)
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25418');
      mockDevToolsInstance.getPort.mockReturnValue(25418);

      const promise = startDevToolsServer(config);

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

      const url = await promise;

      expect(mockDevToolsInstance.stop).toHaveBeenCalled();
      expect(url).toBe('http://localhost:25417');
      expect(mockAddNetworkTransport).toHaveBeenCalledWith(
        config,
        '127.0.0.1',
        25417,
        expect.any(Function),
      );
    });

    it('keeps own server when winner is not responding', async () => {
      const config = createMockConfig();

      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25418');
      mockDevToolsInstance.getPort.mockReturnValue(25418);

      const promise = startDevToolsServer(config);

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

      const url = await promise;

      expect(mockDevToolsInstance.stop).not.toHaveBeenCalled();
      expect(url).toBe('http://localhost:25418');
      expect(mockAddNetworkTransport).toHaveBeenCalledWith(
        config,
        '127.0.0.1',
        25418,
        expect.any(Function),
      );
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

  describe('toggleDevToolsPanel', () => {
    it('calls toggle (to close) when already open', async () => {
      const config = createMockConfig();
      const toggle = vi.fn();
      const setOpen = vi.fn();

      const promise = toggleDevToolsPanel(config, true, toggle, setOpen);
      await promise;

      expect(toggle).toHaveBeenCalledTimes(1);
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('does NOT call toggle or setOpen when browser opens successfully', async () => {
      const config = createMockConfig();
      const toggle = vi.fn();
      const setOpen = vi.fn();

      mockShouldLaunchBrowser.mockReturnValue(true);
      mockOpenBrowserSecurely.mockResolvedValue(undefined);
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      const promise = toggleDevToolsPanel(config, false, toggle, setOpen);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      await promise;

      expect(toggle).not.toHaveBeenCalled();
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('calls setOpen when browser fails to open', async () => {
      const config = createMockConfig();
      const toggle = vi.fn();
      const setOpen = vi.fn();

      mockShouldLaunchBrowser.mockReturnValue(true);
      mockOpenBrowserSecurely.mockRejectedValue(new Error('no browser'));
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      const promise = toggleDevToolsPanel(config, false, toggle, setOpen);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      await promise;

      expect(toggle).not.toHaveBeenCalled();
      expect(setOpen).toHaveBeenCalledTimes(1);
    });

    it('calls setOpen when shouldLaunchBrowser returns false', async () => {
      const config = createMockConfig();
      const toggle = vi.fn();
      const setOpen = vi.fn();

      mockShouldLaunchBrowser.mockReturnValue(false);
      mockDevToolsInstance.start.mockResolvedValue('http://127.0.0.1:25417');
      mockDevToolsInstance.getPort.mockReturnValue(25417);

      const promise = toggleDevToolsPanel(config, false, toggle, setOpen);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      await promise;

      expect(toggle).not.toHaveBeenCalled();
      expect(setOpen).toHaveBeenCalledTimes(1);
    });

    it('calls setOpen when DevTools server fails to start', async () => {
      const config = createMockConfig();
      const toggle = vi.fn();
      const setOpen = vi.fn();

      mockDevToolsInstance.start.mockRejectedValue(new Error('fail'));

      const promise = toggleDevToolsPanel(config, false, toggle, setOpen);

      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
      MockWebSocket.instances[0].simulateError();

      await promise;

      expect(toggle).not.toHaveBeenCalled();
      expect(setOpen).toHaveBeenCalledTimes(1);
    });
  });
});
