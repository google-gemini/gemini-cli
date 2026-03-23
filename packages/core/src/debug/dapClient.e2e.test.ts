/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end lifecycle integration test for the DAP client.
 *
 * Uses a realistic mock DAP server that simulates the complete debugging
 * workflow that would occur with a real debug adapter (e.g. js-debug):
 *   connect → initialize → launch → configurationDone → stopped event →
 *   set breakpoints → stack trace → scopes → variables → evaluate →
 *   step → continue → disconnect
 *
 * This validates the full event-driven state machine, including:
 * - Multi-step handshake (initialize → initialized event → configurationDone)
 * - Asynchronous stopped events triggering inspection
 * - Chained operations (stackTrace → scopes → variables)
 * - Expression evaluation with frame context
 * - Step-and-continue execution flow
 * - Clean disconnection with debuggee termination
 */

import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { DAPClient } from './dapClient.js';
import type { DAPRequest, DAPResponse, DAPEvent } from './dapClient.js';

// ---------------------------------------------------------------------------
// Wire protocol helper
// ---------------------------------------------------------------------------

type WritableMessage = DAPResponse | DAPEvent | Record<string, unknown>;

function encodeDAP(message: WritableMessage): Buffer {
  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n`;
  return Buffer.from(header + body, 'utf-8');
}

// ---------------------------------------------------------------------------
// Realistic DAP server: simulates a full debug session lifecycle
// ---------------------------------------------------------------------------

function createLifecycleServer() {
  const activeSockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    activeSockets.add(socket);
    socket.on('close', () => activeSockets.delete(socket));
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const headerStr = buffer.subarray(0, headerEnd).toString('utf-8');
        const match = /Content-Length:\s*(\d+)/i.exec(headerStr);
        if (!match) {
          buffer = buffer.subarray(headerEnd + 4);
          continue;
        }

        const contentLength = parseInt(match[1], 10);
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + contentLength) break;

        const bodyStr = buffer
          .subarray(bodyStart, bodyStart + contentLength)
          .toString('utf-8');
        buffer = buffer.subarray(bodyStart + contentLength);

        const request = JSON.parse(bodyStr) as DAPRequest;
        handleRequest(request, socket);
      }
    });
  });

  function respond(
    socket: net.Socket,
    request: DAPRequest,
    body: Record<string, unknown> = {},
  ) {
    const response: DAPResponse = {
      seq: 0,
      type: 'response',
      request_seq: request.seq,
      success: true,
      command: request.command,
      body,
    };
    if (!socket.destroyed) socket.write(encodeDAP(response));
  }

  function sendEvent(
    socket: net.Socket,
    event: string,
    body: Record<string, unknown> = {},
  ) {
    const ev: DAPEvent = { seq: 0, type: 'event', event, body };
    if (!socket.destroyed) socket.write(encodeDAP(ev));
  }

  function handleRequest(request: DAPRequest, socket: net.Socket) {
    switch (request.command) {
      case 'initialize':
        respond(socket, request, {
          supportsConfigurationDoneRequest: true,
          supportsConditionalBreakpoints: true,
          supportsExceptionInfoRequest: true,
          exceptionBreakpointFilters: [
            { filter: 'all', label: 'All Exceptions' },
            { filter: 'uncaught', label: 'Uncaught Exceptions' },
          ],
        });
        // Send initialized event after initialize response
        sendEvent(socket, 'initialized');
        break;

      case 'launch':
        respond(socket, request);
        // Simulate program stopping on entry after a short delay
        setTimeout(() => {
          sendEvent(socket, 'stopped', {
            reason: 'entry',
            threadId: 1,
            allThreadsStopped: true,
          });
        }, 30);
        break;

      case 'configurationDone':
        respond(socket, request);
        break;

      case 'setBreakpoints': {
        const bps = (
          (request.arguments?.['breakpoints'] as Array<{ line: number }>) ?? []
        ).map((bp, i) => ({
          id: i + 1,
          verified: true,
          line: bp.line,
          source: {
            path:
              (
                request.arguments?.['source'] as
                  | Record<string, string>
                  | undefined
              )?.['path'] ?? '<unknown>',
          },
        }));
        respond(socket, request, { breakpoints: bps });
        break;
      }

      case 'setFunctionBreakpoints': {
        const fbps = (
          (request.arguments?.['breakpoints'] as Array<{ name: string }>) ?? []
        ).map((bp, i) => ({
          id: 100 + i,
          verified: true,
          source: { name: bp.name },
        }));
        respond(socket, request, { breakpoints: fbps });
        break;
      }

      case 'setExceptionBreakpoints':
        respond(socket, request);
        break;

      case 'stackTrace':
        respond(socket, request, {
          stackFrames: [
            {
              id: 1,
              name: 'main',
              line: 9,
              column: 5,
              source: { name: 'debuggee.js', path: '/workspace/debuggee.js' },
            },
            {
              id: 2,
              name: '<module>',
              line: 15,
              column: 1,
              source: { name: 'debuggee.js', path: '/workspace/debuggee.js' },
            },
          ],
          totalFrames: 2,
        });
        break;

      case 'scopes':
        respond(socket, request, {
          scopes: [
            { name: 'Local', variablesReference: 100, expensive: false },
            { name: 'Closure', variablesReference: 200, expensive: false },
            { name: 'Global', variablesReference: 300, expensive: true },
          ],
        });
        break;

      case 'variables': {
        const ref = request.arguments?.['variablesReference'];
        if (ref === 100) {
          // Local scope
          respond(socket, request, {
            variables: [
              { name: 'x', value: '10', type: 'number', variablesReference: 0 },
              { name: 'y', value: '20', type: 'number', variablesReference: 0 },
              {
                name: 'result',
                value: 'undefined',
                type: 'undefined',
                variablesReference: 0,
              },
            ],
          });
        } else if (ref === 200) {
          // Closure scope (empty)
          respond(socket, request, { variables: [] });
        } else {
          respond(socket, request, { variables: [] });
        }
        break;
      }

      case 'evaluate':
        respond(socket, request, {
          result: '30',
          type: 'number',
          variablesReference: 0,
        });
        break;

      case 'continue':
        respond(socket, request, { allThreadsContinued: true });
        // Simulate hitting a breakpoint after continue
        setTimeout(() => {
          sendEvent(socket, 'stopped', {
            reason: 'breakpoint',
            threadId: 1,
            allThreadsStopped: true,
          });
        }, 30);
        break;

      case 'next':
      case 'stepIn':
      case 'stepOut':
        respond(socket, request);
        // Simulate stopping after step
        setTimeout(() => {
          sendEvent(socket, 'stopped', {
            reason: 'step',
            threadId: 1,
            allThreadsStopped: true,
          });
        }, 30);
        break;

      case 'disconnect':
        respond(socket, request);
        // Send terminated event
        setTimeout(() => {
          sendEvent(socket, 'terminated');
        }, 10);
        break;

      default:
        respond(socket, request);
    }
  }

  const port = new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve(addr.port);
    });
  });

  const close = () =>
    new Promise<void>((resolve) => {
      for (const s of activeSockets) s.destroy();
      activeSockets.clear();
      server.close(() => resolve());
    });

  return { server, port, close };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('DAPClient E2E Integration', () => {
  let client: DAPClient;
  let mockServer: ReturnType<typeof createLifecycleServer>;

  afterEach(async () => {
    try {
      if (client?.state !== 'disconnected' && client?.state !== 'terminated') {
        await client.disconnect(true);
      }
    } catch {
      // ignore
    }
    client?.destroy();
    if (mockServer) await mockServer.close();
  });

  it('completes full debug lifecycle: connect → inspect → step → disconnect', async () => {
    mockServer = createLifecycleServer();
    const port = await mockServer.port;

    client = new DAPClient(10000);
    client.on('error', () => {});

    // 1. Connect
    await client.connect(port);
    expect(client.state).toBe('initialized');

    // 2. Initialize handshake
    const caps = await client.initialize('gemini-cli-e2e', 'node');
    expect(caps.supportsConfigurationDoneRequest).toBe(true);
    expect(caps.supportsConditionalBreakpoints).toBe(true);
    expect(caps.exceptionBreakpointFilters).toHaveLength(2);

    // 3. Set breakpoints before launch
    const bps = await client.setBreakpoints('/workspace/debuggee.js', [9, 15]);
    expect(bps).toHaveLength(2);
    expect(bps[0].verified).toBe(true);
    expect(bps[0].line).toBe(9);
    expect(bps[1].line).toBe(15);

    // 4. Set exception breakpoints
    await client.setExceptionBreakpoints(['uncaught']);

    // 5. Register stopped listener BEFORE launch so we don't miss the event
    const entryStopPromise = new Promise<Record<string, unknown>>((resolve) => {
      client.once('stopped', resolve);
    });

    // Launch triggers a 'stopped' event after a short delay (entry stop)
    await client.launch('/workspace/debuggee.js');
    await client.configurationDone();

    // Wait for entry stop
    const entryStop = await entryStopPromise;
    expect(entryStop).toMatchObject({
      reason: 'entry',
      threadId: 1,
    });

    // 6. Get stack trace at entry point
    const frames = await client.stackTrace(1);
    expect(frames).toHaveLength(2);
    expect(frames[0].name).toBe('main');
    expect(frames[0].line).toBe(9);
    expect(frames[0].source?.path).toBe('/workspace/debuggee.js');

    // 7. Get scopes for top frame
    const scopes = await client.scopes(frames[0].id);
    expect(scopes).toHaveLength(3);
    expect(scopes[0].name).toBe('Local');
    expect(scopes[1].name).toBe('Closure');
    expect(scopes[2].name).toBe('Global');

    // 8. Get local variables
    const vars = await client.variables(scopes[0].variablesReference);
    expect(vars).toHaveLength(3);
    expect(vars[0]).toMatchObject({ name: 'x', value: '10', type: 'number' });
    expect(vars[1]).toMatchObject({ name: 'y', value: '20', type: 'number' });
    expect(vars[2]).toMatchObject({ name: 'result', value: 'undefined' });

    // 9. Get closure scope (should be empty)
    const closureVars = await client.variables(scopes[1].variablesReference);
    expect(closureVars).toHaveLength(0);

    // 10. Evaluate expression in current frame
    const evalResult = await client.evaluate('x + y', frames[0].id);
    expect(evalResult.result).toBe('30');
    expect(evalResult.type).toBe('number');

    // 11. Step to next line
    const stepStopPromise = new Promise<Record<string, unknown>>((resolve) => {
      client.once('stopped', resolve);
    });
    await client.next(1);
    const stepStop = await stepStopPromise;
    expect(stepStop).toMatchObject({ reason: 'step', threadId: 1 });

    // 12. Continue to next breakpoint
    const bpStopPromise = new Promise<Record<string, unknown>>((resolve) => {
      client.once('stopped', resolve);
    });
    await client.continue(1);
    const bpStop = await bpStopPromise;
    expect(bpStop).toMatchObject({ reason: 'breakpoint', threadId: 1 });

    // 13. Step into
    const stepInPromise = new Promise<Record<string, unknown>>((resolve) => {
      client.once('stopped', resolve);
    });
    await client.stepIn(1);
    const stepInStop = await stepInPromise;
    expect(stepInStop).toMatchObject({ reason: 'step' });

    // 14. Step out
    const stepOutPromise = new Promise<Record<string, unknown>>((resolve) => {
      client.once('stopped', resolve);
    });
    await client.stepOut(1);
    const stepOutStop = await stepOutPromise;
    expect(stepOutStop).toMatchObject({ reason: 'step' });

    // 15. Disconnect with termination
    await client.disconnect(true);
    expect(
      client.state === 'disconnected' || client.state === 'terminated',
    ).toBe(true);
  }, 15000);

  it('handles rapid sequential operations without race conditions', async () => {
    mockServer = createLifecycleServer();
    const port = await mockServer.port;

    client = new DAPClient(10000);
    client.on('error', () => {});

    await client.connect(port);
    await client.initialize();

    // Set breakpoints multiple times rapidly
    const [bp1, bp2, bp3] = await Promise.all([
      client.setBreakpoints('/a.js', [1, 2, 3]),
      client.setBreakpoints('/b.js', [10]),
      client.setBreakpoints('/c.js', [20, 30]),
    ]);

    expect(bp1).toHaveLength(3);
    expect(bp2).toHaveLength(1);
    expect(bp3).toHaveLength(2);
  }, 10000);

  it('recovers from server disconnect mid-session', async () => {
    mockServer = createLifecycleServer();
    const port = await mockServer.port;

    client = new DAPClient(10000);
    client.on('error', () => {});

    await client.connect(port);
    await client.initialize();

    // Force-close the server (simulates adapter crash)
    const terminatedPromise = new Promise<void>((resolve) => {
      client.once('terminated', () => resolve());
      setTimeout(resolve, 3000); // fallback timeout
    });

    await mockServer.close();
    await terminatedPromise;

    expect(
      client.state === 'terminated' || client.state === 'disconnected',
    ).toBe(true);
  }, 10000);

  it('rejects operations after disconnect', async () => {
    mockServer = createLifecycleServer();
    const port = await mockServer.port;

    client = new DAPClient(5000);
    client.on('error', () => {});

    await client.connect(port);
    await client.initialize();
    await client.disconnect();

    // All operations should fail after disconnect
    await expect(client.stackTrace(1)).rejects.toThrow();
    await expect(client.evaluate('1+1', 1)).rejects.toThrow();
  }, 10000);
});
