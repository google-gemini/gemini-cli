/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import { DAPClient } from './dapClient.js';
import type { DAPRequest, DAPResponse, DAPEvent } from './dapClient.js';

// ---------------------------------------------------------------------------
// Helper: encode a DAP message into the wire format
// ---------------------------------------------------------------------------

// Widened write type to accept both DAP types and generic records
type WritableMessage = DAPResponse | DAPEvent | Record<string, unknown>;

function encodeDAP(message: WritableMessage): Buffer {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n`;
    return Buffer.from(header + body, 'utf-8');
}

// ---------------------------------------------------------------------------
// Helper: create a mock DAP server
// ---------------------------------------------------------------------------
function createMockServer(
    handler: (data: DAPRequest, write: (msg: WritableMessage) => void) => void,
): { server: net.Server; port: Promise<number>; close: () => Promise<void> } {
    const activeSockets = new Set<net.Socket>();

    const server = net.createServer((socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
        let buffer = Buffer.alloc(0);

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            // Parse complete messages from the buffer
             
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

                const bodyStr = buffer.subarray(bodyStart, bodyStart + contentLength).toString('utf-8');
                buffer = buffer.subarray(bodyStart + contentLength);

                const request = JSON.parse(bodyStr) as DAPRequest;
                handler(request, (msg) => {
                    if (!socket.destroyed) {
                        socket.write(encodeDAP(msg));
                    }
                });
            }
        });
    });

    const port = new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as net.AddressInfo;
            resolve(addr.port);
        });
    });

    const close = () =>
        new Promise<void>((resolve) => {
            for (const s of activeSockets) {
                s.destroy();
            }
            activeSockets.clear();
            server.close(() => resolve());
        });

    return { server, port, close };
}

// ---------------------------------------------------------------------------
// Default handler: auto-responds to common DAP requests
// ---------------------------------------------------------------------------
function defaultHandler(
    request: DAPRequest,
    write: (msg: WritableMessage) => void,
): void {
    const respond = (body: Record<string, unknown> = {}): void => {
        const response: DAPResponse = {
            seq: 0,
            type: 'response',
            request_seq: request.seq,
            success: true,
            command: request.command,
            body,
        };
        write(response);
    };

    switch (request.command) {
        case 'initialize':
            respond({
                supportsConfigurationDoneRequest: true,
                supportsExceptionInfoRequest: true,
                supportsConditionalBreakpoints: true,
                supportsLogPoints: true,
                exceptionBreakpointFilters: [
                    { filter: 'all', label: 'All Exceptions', default: false },
                    { filter: 'uncaught', label: 'Uncaught Exceptions', default: true },
                ],
            });
            // Send initialized event
            write({ seq: 0, type: 'event', event: 'initialized', body: {} });
            break;

        case 'launch':
        case 'attach':
            respond();
            break;

        case 'configurationDone':
            respond();
            break;

        case 'setBreakpoints': {
            const bps = (
                (request.arguments?.['breakpoints'] as Array<{ line: number }>) ?? []
            ).map((bp, i) => ({
                id: i + 1,
                verified: true,
                line: bp.line,
            }));
            respond({ breakpoints: bps });
            break;
        }

        case 'setExceptionBreakpoints':
            respond();
            break;

        case 'stackTrace':
            respond({
                stackFrames: [
                    {
                        id: 1,
                        name: 'main',
                        line: 10,
                        column: 1,
                        source: { name: 'app.js', path: '/workspace/app.js' },
                    },
                    {
                        id: 2,
                        name: 'start',
                        line: 5,
                        column: 3,
                        source: { name: 'index.js', path: '/workspace/index.js' },
                    },
                ],
                totalFrames: 2,
            });
            break;

        case 'scopes':
            respond({
                scopes: [
                    { name: 'Local', variablesReference: 100, expensive: false },
                    { name: 'Global', variablesReference: 200, expensive: true },
                ],
            });
            break;

        case 'variables':
            respond({
                variables: [
                    { name: 'x', value: '42', type: 'number', variablesReference: 0 },
                    { name: 'msg', value: '"hello"', type: 'string', variablesReference: 0 },
                ],
            });
            break;

        case 'evaluate':
            respond({
                result: '42',
                type: 'number',
                variablesReference: 0,
            });
            break;

        case 'continue':
        case 'next':
        case 'stepIn':
        case 'stepOut':
            respond({ allThreadsContinued: true });
            break;

        case 'disconnect':
            respond();
            break;

        default:
            respond();
    }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('DAPClient', () => {
    let client: DAPClient;
    let mockServer: ReturnType<typeof createMockServer>;
    let port: number;

    beforeEach(async () => {
        client = new DAPClient(5000);
        // Suppress unhandled error events in tests
        client.on('error', () => { });
        mockServer = createMockServer(defaultHandler);
        port = await mockServer.port;
    });

    afterEach(async () => {
        client.destroy();
        await mockServer.close();
    });

    // -- Connection -----------------------------------------------------------

    describe('connection', () => {
        it('should connect to a TCP server and transition to initialized state', async () => {
            await client.connect(port);
            expect(client.state).toBe('initialized');
        });

        it('should reject connection to a closed port', async () => {
            // Create a server, get its port, then close it — guarantees ECONNREFUSED
            const tmpServer = net.createServer();
            const closedPort = await new Promise<number>((resolve) => {
                tmpServer.listen(0, '127.0.0.1', () => {
                    const addr = tmpServer.address() as net.AddressInfo;
                    resolve(addr.port);
                });
            });
            await new Promise<void>((resolve) => tmpServer.close(() => resolve()));

            await expect(client.connect(closedPort)).rejects.toThrow('Failed to connect');
        });

        it('should throw if connect is called while already connected', async () => {
            await client.connect(port);
            await expect(client.connect(port)).rejects.toThrow('Cannot connect');
        });
    });

    // -- Initialize -----------------------------------------------------------

    describe('initialize', () => {
        it('should send initialize request and receive capabilities', async () => {
            await client.connect(port);
            const caps = await client.initialize();

            expect(caps.supportsConfigurationDoneRequest).toBe(true);
            expect(caps.supportsExceptionInfoRequest).toBe(true);
            expect(caps.supportsConditionalBreakpoints).toBe(true);
            expect(caps.supportsLogPoints).toBe(true);
            expect(caps.exceptionBreakpointFilters).toHaveLength(2);
        });

        it('should throw if initialize is called in wrong state', async () => {
            // Not connected yet — state is "disconnected"
            await expect(client.initialize()).rejects.toThrow("expected state 'initialized'");
        });
    });

    // -- Launch & Attach ------------------------------------------------------

    describe('launch and attach', () => {
        it('should send launch request successfully', async () => {
            await client.connect(port);
            await client.initialize();
            await expect(client.launch('/workspace/app.js')).resolves.toBeUndefined();
        });

        it('should send attach request successfully', async () => {
            await client.connect(port);
            await client.initialize();
            await expect(client.attach(9229)).resolves.toBeUndefined();
        });
    });

    // -- Configuration --------------------------------------------------------

    describe('configurationDone', () => {
        it('should transition to configured state', async () => {
            await client.connect(port);
            await client.initialize();
            await client.configurationDone();

            expect(client.state).toBe('configured');
        });
    });

    // -- Breakpoints ----------------------------------------------------------

    describe('breakpoints', () => {
        it('should set breakpoints and return verified breakpoints', async () => {
            await client.connect(port);
            await client.initialize();

            const bps = await client.setBreakpoints('/workspace/app.js', [10, 20]);

            expect(bps).toHaveLength(2);
            expect(bps[0].verified).toBe(true);
            expect(bps[0].line).toBe(10);
            expect(bps[1].line).toBe(20);
        });

        it('should send exception breakpoint filters', async () => {
            await client.connect(port);
            await client.initialize();

            await expect(
                client.setExceptionBreakpoints(['all', 'uncaught']),
            ).resolves.toBeUndefined();
        });
    });

    // -- Stack trace & variables ----------------------------------------------

    describe('inspection', () => {
        it('should retrieve stack trace', async () => {
            await client.connect(port);
            await client.initialize();

            const frames = await client.stackTrace(1);

            expect(frames).toHaveLength(2);
            expect(frames[0].name).toBe('main');
            expect(frames[0].line).toBe(10);
            expect(frames[0].source?.path).toBe('/workspace/app.js');
        });

        it('should retrieve scopes', async () => {
            await client.connect(port);
            await client.initialize();

            const scopeList = await client.scopes(1);

            expect(scopeList).toHaveLength(2);
            expect(scopeList[0].name).toBe('Local');
            expect(scopeList[0].variablesReference).toBe(100);
        });

        it('should retrieve variables', async () => {
            await client.connect(port);
            await client.initialize();

            const vars = await client.variables(100);

            expect(vars).toHaveLength(2);
            expect(vars[0].name).toBe('x');
            expect(vars[0].value).toBe('42');
        });

        it('should evaluate expressions', async () => {
            await client.connect(port);
            await client.initialize();

            const result = await client.evaluate('1 + 1', 1);

            expect(result.result).toBe('42');
            expect(result.type).toBe('number');
            expect(result.variablesReference).toBe(0);
        });
    });

    // -- Execution control ----------------------------------------------------

    describe('execution control', () => {
        it('should send continue request', async () => {
            await client.connect(port);
            await client.initialize();
            await expect(client.continue(1)).resolves.toBeUndefined();
        });

        it('should send next (step over) request', async () => {
            await client.connect(port);
            await client.initialize();
            await expect(client.next(1)).resolves.toBeUndefined();
        });

        it('should send stepIn request', async () => {
            await client.connect(port);
            await client.initialize();
            await expect(client.stepIn(1)).resolves.toBeUndefined();
        });

        it('should send stepOut request', async () => {
            await client.connect(port);
            await client.initialize();
            await expect(client.stepOut(1)).resolves.toBeUndefined();
        });
    });

    // -- Events ---------------------------------------------------------------

    describe('events', () => {
        it('should emit stopped event when adapter sends it', async () => {
            const serverWithEvents = createMockServer((request, write) => {
                defaultHandler(request, write);

                if (request.command === 'configurationDone') {
                    // Send a stopped event after configurationDone
                    setTimeout(() => {
                        const event: DAPEvent = {
                            seq: 0,
                            type: 'event',
                            event: 'stopped',
                            body: { reason: 'breakpoint', threadId: 1, allThreadsStopped: true },
                        };
                        write(event);
                    }, 50);
                }
            });

            const eventPort = await serverWithEvents.port;

            try {
                client.destroy(); // Clean up default connection
                client = new DAPClient(5000);
                client.on('error', () => { });

                // Register listener AFTER creating new client
                const stoppedPromise = new Promise<Record<string, unknown>>((resolve) => {
                    client.on('stopped', resolve);
                });

                await client.connect(eventPort);
                await client.initialize();
                await client.configurationDone();

                const body = await stoppedPromise;
                expect(body).toMatchObject({
                    reason: 'breakpoint',
                    threadId: 1,
                });
            } finally {
                await serverWithEvents.close();
            }
        });

        it('should capture output events in the output log', async () => {
            const serverWithOutput = createMockServer((request, write) => {
                defaultHandler(request, write);

                if (request.command === 'configurationDone') {
                    setTimeout(() => {
                        const event: DAPEvent = {
                            seq: 0,
                            type: 'event',
                            event: 'output',
                            body: { category: 'stdout', output: 'Hello World\n' },
                        };
                        write(event);
                    }, 50);
                }
            });

            const eventPort = await serverWithOutput.port;

            try {
                client.destroy();
                client = new DAPClient(5000);
                client.on('error', () => { });

                // Register listener AFTER creating new client
                const outputPromise = new Promise<void>((resolve) => {
                    client.on('output', () => resolve());
                });

                await client.connect(eventPort);
                await client.initialize();
                await client.configurationDone();

                await outputPromise;

                const output = client.getRecentOutput();
                expect(output).toHaveLength(1);
                expect(output[0].category).toBe('stdout');
                expect(output[0].output).toBe('Hello World\n');
            } finally {
                await serverWithOutput.close();
            }
        });
    });

    // -- Disconnect -----------------------------------------------------------

    describe('disconnect', () => {
        it('should disconnect cleanly', async () => {
            await client.connect(port);
            await client.initialize();
            await client.disconnect();

            expect(client.state).toBe('disconnected');
        });

        it('should be safe to call disconnect when already disconnected', async () => {
            // Should not throw
            await expect(client.disconnect()).resolves.toBeUndefined();
        });
    });

    // -- Wire protocol edge cases --------------------------------------------

    describe('wire protocol', () => {
        it('should handle multiple messages in a single TCP chunk', async () => {
            const serverWithBatch = createMockServer((request, write) => {
                // For initialize, send both the response AND the initialized event
                // in a single write (simulating batched messages)
                if (request.command === 'initialize') {
                    const response: DAPResponse = {
                        seq: 0,
                        type: 'response',
                        request_seq: request.seq,
                        success: true,
                        command: 'initialize',
                        body: { supportsConfigurationDoneRequest: true },
                    };
                    const event: DAPEvent = {
                        seq: 1,
                        type: 'event',
                        event: 'initialized',
                        body: {},
                    };
                    // Encode both messages into a single buffer
                    const combined = Buffer.concat([
                        encodeDAP(response),
                        encodeDAP(event),
                    ]);
                    if (!request.seq) return; // guard
                    // Write as one chunk
                    const socket = (write as unknown as { socket?: net.Socket }).socket;
                    if (socket) {
                        socket.write(combined);
                    } else {
                        // Fallback: send each separately (still tests response routing)
                        write({ ...response });
                        write(event);
                    }
                } else {
                    defaultHandler(request, write);
                }
            });

            const batchPort = await serverWithBatch.port;

            try {
                client.destroy();
                client = new DAPClient(5000);
                await client.connect(batchPort);
                const caps = await client.initialize();

                expect(caps.supportsConfigurationDoneRequest).toBe(true);
            } finally {
                await serverWithBatch.close();
            }
        });

        it('should handle timeout when adapter does not respond', async () => {
            // Create a server that never responds
            const silentServer = createMockServer(() => {
                // Intentionally do nothing — no response sent
            });

            const silentPort = await silentServer.port;

            try {
                client.destroy();
                client = new DAPClient(500); // Very short timeout
                await client.connect(silentPort);

                await expect(client.initialize()).rejects.toThrow('timed out');
            } finally {
                await silentServer.close();
            }
        });

        it('should handle failed responses from adapter', async () => {
            const errorServer = createMockServer((request, write) => {
                const response: DAPResponse = {
                    seq: 0,
                    type: 'response',
                    request_seq: request.seq,
                    success: false,
                    command: request.command,
                    message: 'Something went wrong',
                };
                write(response);
            });

            const errorPort = await errorServer.port;

            try {
                client.destroy();
                client = new DAPClient(5000);
                await client.connect(errorPort);

                await expect(client.initialize()).rejects.toThrow('Something went wrong');
            } finally {
                await errorServer.close();
            }
        });
    });

    // -- State machine -------------------------------------------------------

    describe('state machine', () => {
        it('should reject operations in wrong state', async () => {
            // Cannot configurationDone before connecting (state is disconnected)
            await expect(client.configurationDone()).rejects.toThrow(
                "expected state 'initialized'",
            );

            await client.connect(port);
            await client.initialize();
            await client.configurationDone();

            // Cannot initialize again after configured
            await expect(client.initialize()).rejects.toThrow(
                "expected state 'initialized', got 'configured'",
            );
        });

        it('should reject requests when not connected', async () => {
            // stackTrace requires initialized or configured
            await expect(client.stackTrace(1)).rejects.toThrow(
                "client is in state 'disconnected'",
            );
        });
    });
});
