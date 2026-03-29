/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CDPClient } from './cdpClient.js';
import * as http from 'node:http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

// ─── Mock CDP Server ─────────────────────────────────────────────────────────

/**
 * Creates a mock CDP server that simulates a Node.js --inspect endpoint.
 * Handles /json discovery and WebSocket protocol messages.
 */
function createMockCDPServer(): {
  httpServer: http.Server;
  wsServer: WebSocketServer;
  port: number;
  close: () => Promise<void>;
  lastMessage: () => Record<string, unknown> | null;
  sendEvent: (method: string, params?: Record<string, unknown>) => void;
  connections: WebSocket[];
} {
  let resolvePort: (port: number) => void;
  void new Promise<number>((resolve) => {
    resolvePort = resolve;
  });

  const connections: WebSocket[] = [];
  let lastMsg: Record<string, unknown> | null = null;

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/json') {
      const port = (httpServer.address() as { port: number }).port;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            description: 'node.js instance',
            devtoolsFrontendUrl: '',
            id: 'test-id',
            title: 'test',
            type: 'node',
            url: 'file://test.js',
            webSocketDebuggerUrl: `ws://127.0.0.1:${port}/ws`,
          },
        ]),
      );
    }
  });

  const wsServer = new WebSocketServer({ server: httpServer, path: '/ws' });

  wsServer.on('connection', (ws) => {
    connections.push(ws);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      lastMsg = msg;

      // Auto-respond to known CDP methods
      const response: Record<string, unknown> = { id: msg.id, result: {} };

      switch (msg.method) {
        case 'HeapProfiler.enable':
        case 'HeapProfiler.disable':
        case 'HeapProfiler.collectGarbage':
        case 'Profiler.enable':
        case 'Profiler.setSamplingInterval':
        case 'Runtime.enable':
          response['result'] = {};
          break;

        case 'HeapProfiler.takeHeapSnapshot':
          // Send chunks then respond
          ws.send(
            JSON.stringify({
              method: 'HeapProfiler.addHeapSnapshotChunk',
              params: {
                chunk:
                  '{"snapshot":{"meta":{"node_fields":["type"],"node_types":[[]],"edge_fields":["type"],"edge_types":[[]]},',
              },
            }),
          );
          ws.send(
            JSON.stringify({
              method: 'HeapProfiler.addHeapSnapshotChunk',
              params: {
                chunk:
                  '"node_count":0,"edge_count":0},"nodes":[],"edges":[],"strings":[""]}',
              },
            }),
          );
          if (msg.params?.reportProgress) {
            ws.send(
              JSON.stringify({
                method: 'HeapProfiler.reportHeapSnapshotProgress',
                params: { done: 100, total: 100, finished: true },
              }),
            );
          }
          response['result'] = {};
          break;

        case 'HeapProfiler.startSampling':
          response['result'] = {};
          break;

        case 'HeapProfiler.stopSampling':
          response['result'] = {
            profile: {
              head: {
                callFrame: {
                  functionName: '(root)',
                  scriptId: '0',
                  url: '',
                  lineNumber: 0,
                  columnNumber: 0,
                },
                selfSize: 0,
                id: 1,
                children: [],
              },
            },
          };
          break;

        case 'Profiler.start':
          response['result'] = {};
          break;

        case 'Profiler.stop':
          response['result'] = {
            profile: {
              nodes: [
                {
                  id: 1,
                  callFrame: {
                    functionName: 'main',
                    scriptId: '1',
                    url: 'test.js',
                    lineNumber: 0,
                    columnNumber: 0,
                  },
                  hitCount: 1,
                },
              ],
              startTime: 0,
              endTime: 1000,
              samples: [1],
              timeDeltas: [1000],
            },
          };
          break;

        case 'Runtime.evaluate':
          response['result'] = {
            result: { type: 'number', value: 42, description: '42' },
          };
          break;

        case 'Runtime.getHeapUsage':
          response['result'] = { usedSize: 5_000_000, totalSize: 10_000_000 };
          break;

        default:
          response['result'] = {};
      }

      ws.send(JSON.stringify(response));
    });
  });

  httpServer.listen(0, '127.0.0.1', () => {
    const addr = httpServer.address() as { port: number };
    resolvePort!(addr.port);
  });

  return {
    httpServer,
    wsServer,
    get port() {
      return (httpServer.address() as { port: number })?.port ?? 0;
    },
    close: async () => {
      for (const conn of connections) conn.close();
      wsServer.close();
      httpServer.close();
    },
    lastMessage: () => lastMsg,
    sendEvent: (method, params) => {
      for (const conn of connections) {
        conn.send(JSON.stringify({ method, params }));
      }
    },
    connections,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CDPClient', () => {
  let server: ReturnType<typeof createMockCDPServer>;
  let client: CDPClient;

  beforeEach(async () => {
    server = createMockCDPServer();
    client = new CDPClient({ timeout: 5000 });
    // Wait for server to be listening
    await new Promise<void>((resolve) => {
      const check = () => {
        if (server.port > 0) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
  });

  afterEach(async () => {
    await client.disconnect();
    await server.close();
  });

  describe('discoverTargets()', () => {
    it('should discover debug targets from /json endpoint', async () => {
      const targets = await CDPClient.discoverTargets(server.port);
      expect(targets).toHaveLength(1);
      expect(targets[0].type).toBe('node');
      expect(targets[0].webSocketDebuggerUrl).toContain('ws://');
    });

    it('should reject when no server is running', async () => {
      await expect(CDPClient.discoverTargets(19999)).rejects.toThrow();
    });
  });

  describe('connect()', () => {
    it('should connect via port number (auto-discovery)', async () => {
      await client.connect(server.port);
      expect(client.getState()).toBe('connected');
    });

    it('should connect via WebSocket URL', async () => {
      const targets = await CDPClient.discoverTargets(server.port);
      await client.connect(targets[0].webSocketDebuggerUrl);
      expect(client.getState()).toBe('connected');
    });

    it('should emit connected event', async () => {
      const connected = vi.fn();
      client.on('connected', connected);
      await client.connect(server.port);
      expect(connected).toHaveBeenCalledOnce();
    });
  });

  describe('disconnect()', () => {
    it('should set state to disconnected', async () => {
      await client.connect(server.port);
      await client.disconnect();
      expect(client.getState()).toBe('disconnected');
    });
  });

  describe('HeapProfiler domain', () => {
    beforeEach(async () => {
      await client.connect(server.port);
    });

    it('should enable HeapProfiler', async () => {
      await client.heapProfilerEnable();
      expect(server.lastMessage()!['method']).toBe('HeapProfiler.enable');
    });

    it('should take a heap snapshot and return assembled chunks', async () => {
      await client.heapProfilerEnable();
      const snapshot = await client.takeHeapSnapshot(false);
      expect(snapshot).toContain('"snapshot"');
      expect(snapshot).toContain('"node_count"');
      // Should be valid JSON
      const parsed = JSON.parse(snapshot);
      expect(parsed.snapshot).toBeDefined();
    });

    it('should emit progress events during snapshot capture', async () => {
      await client.heapProfilerEnable();
      const progress = vi.fn();
      client.on('heapSnapshotProgress', progress);
      await client.takeHeapSnapshot(true);
      expect(progress).toHaveBeenCalled();
    });

    it('should collect garbage', async () => {
      await client.heapProfilerEnable();
      await client.collectGarbage();
      expect(server.lastMessage()!['method']).toBe(
        'HeapProfiler.collectGarbage',
      );
    });

    it('should start and stop sampling', async () => {
      await client.heapProfilerEnable();
      await client.startSampling(16384);
      expect(server.lastMessage()!['method']).toBe(
        'HeapProfiler.startSampling',
      );

      const profile = await client.stopSampling();
      expect(profile.profile.head).toBeDefined();
      expect(profile.profile.head.callFrame.functionName).toBe('(root)');
    });
  });

  describe('Profiler domain', () => {
    beforeEach(async () => {
      await client.connect(server.port);
    });

    it('should start and stop CPU profiling', async () => {
      await client.profilerEnable();
      await client.startCpuProfile();
      const result = await client.stopCpuProfile();

      expect(result.profile).toBeDefined();
      expect(result.profile.nodes).toHaveLength(1);
      expect(result.profile.nodes[0].callFrame.functionName).toBe('main');
    });

    it('should set sampling interval', async () => {
      await client.profilerEnable();
      await client.setSamplingInterval(100);
      expect(server.lastMessage()!['method']).toBe(
        'Profiler.setSamplingInterval',
      );
    });
  });

  describe('Runtime domain', () => {
    beforeEach(async () => {
      await client.connect(server.port);
    });

    it('should evaluate expressions', async () => {
      await client.runtimeEnable();
      const result = await client.evaluate('1 + 1');
      expect(result).toBeDefined();
    });

    it('should get heap usage', async () => {
      await client.runtimeEnable();
      const usage = await client.getHeapUsage();
      expect(usage.usedSize).toBe(5_000_000);
      expect(usage.totalSize).toBe(10_000_000);
    });
  });

  describe('composite operations', () => {
    beforeEach(async () => {
      await client.connect(server.port);
    });

    it('captureCpuProfile should return a complete profile', async () => {
      const result = await client.captureCpuProfile(100); // 100ms for speed
      expect(result.profile).toBeDefined();
      expect(result.profile.samples.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should reject send when not connected', async () => {
      await expect(client.heapProfilerEnable()).rejects.toThrow('Cannot send');
    });

    it('should timeout on unresponsive requests', async () => {
      // Create a server that doesn't respond
      const silentServer = http.createServer((req, res) => {
        if (req.url === '/json') {
          const port = (silentServer.address() as { port: number }).port;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify([
              {
                description: '',
                devtoolsFrontendUrl: '',
                id: 'x',
                title: '',
                type: 'node',
                url: '',
                webSocketDebuggerUrl: `ws://127.0.0.1:${port}/ws`,
              },
            ]),
          );
        }
      });
      const silentWs = new WebSocketServer({
        server: silentServer,
        path: '/ws',
      });
      silentWs.on('connection', () => {
        /* swallow all messages */
      });

      await new Promise<void>((resolve) =>
        silentServer.listen(0, '127.0.0.1', resolve),
      );
      const port = (silentServer.address() as { port: number }).port;

      const timeoutClient = new CDPClient({ timeout: 200 });
      await timeoutClient.connect(port);

      await expect(timeoutClient.heapProfilerEnable()).rejects.toThrow(
        'timeout',
      );

      await timeoutClient.disconnect();
      silentWs.close();
      silentServer.close();
    });
  });
});
