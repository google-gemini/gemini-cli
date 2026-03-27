/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DAP (Debug Adapter Protocol) client over TCP.
 *
 * Communicates with debug adapters using the DAP wire format:
 *   Content-Length: <length>\r\n\r\n<JSON body>
 *
 * Three message types:
 *   Request  (client → adapter): { seq, type: "request", command, arguments }
 *   Response (adapter → client): { seq, request_seq, type: "response", success, body }
 *   Event    (adapter → client): { seq, type: "event", event, body }
 */

import net from 'node:net';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// DAP Types (lean subset — no external dependency needed)
// ---------------------------------------------------------------------------

export interface DAPMessage {
    seq: number;
    type: 'request' | 'response' | 'event';
}

export interface DAPRequest extends DAPMessage {
    type: 'request';
    command: string;
    arguments?: Record<string, unknown>;
}

export interface DAPResponse extends DAPMessage {
    type: 'response';
    request_seq: number;
    success: boolean;
    command: string;
    message?: string;
    body?: Record<string, unknown>;
}

export interface DAPEvent extends DAPMessage {
    type: 'event';
    event: string;
    body?: Record<string, unknown>;
}

export interface Capabilities {
    supportsConfigurationDoneRequest?: boolean;
    supportsExceptionInfoRequest?: boolean;
    supportsConditionalBreakpoints?: boolean;
    supportsLogPoints?: boolean;
    supportsDataBreakpoints?: boolean;
    exceptionBreakpointFilters?: ExceptionBreakpointFilter[];
    [key: string]: unknown;
}

export interface ExceptionBreakpointFilter {
    filter: string;
    label: string;
    default?: boolean;
}

export interface Breakpoint {
    id?: number;
    verified: boolean;
    line?: number;
    message?: string;
}

export interface StackFrame {
    id: number;
    name: string;
    line: number;
    column: number;
    source?: Source;
}

export interface Source {
    name?: string;
    path?: string;
}

export interface Scope {
    name: string;
    variablesReference: number;
    expensive: boolean;
}

export interface Variable {
    name: string;
    value: string;
    type?: string;
    variablesReference: number;
}

export interface OutputEntry {
    category: 'stdout' | 'stderr' | 'console' | 'telemetry';
    output: string;
    timestamp: number;
}

// ---------------------------------------------------------------------------
// Client state
// ---------------------------------------------------------------------------

export type DAPClientState =
    | 'disconnected'
    | 'connecting'
    | 'initialized'
    | 'configured'
    | 'terminated';

interface PendingRequest {
    resolve: (value: DAPResponse) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// DAPClient
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;
const HEADER_SEPARATOR = '\r\n\r\n';
const CONTENT_LENGTH_REGEX = /Content-Length:\s*(\d+)/i;
const MAX_OUTPUT_LOG = 200;

// ---------------------------------------------------------------------------
// Type-safe helpers to avoid @typescript-eslint/no-unsafe-type-assertion
// ---------------------------------------------------------------------------

function asArray<T>(value: unknown): T[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Array.isArray is a type guard
    return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' ? value : fallback;
}

function asBool(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

/**
 * Events emitted:
 *   'stopped'    — { reason, threadId, allThreadsStopped, description, text }
 *   'terminated' — {}
 *   'output'     — OutputEntry
 *   'breakpoint' — { reason, breakpoint }
 *   'exited'     — { exitCode }
 */
export class DAPClient extends EventEmitter {
    private socket: net.Socket | null = null;
    private seq = 1;
    private pendingRequests = new Map<number, PendingRequest>();
    private buffer = Buffer.alloc(0);
    private _state: DAPClientState = 'disconnected';
    private outputLog: OutputEntry[] = [];
    private _capabilities: Capabilities = {};
    private timeoutMs: number;

    constructor(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
        super();
        this.timeoutMs = timeoutMs;
    }

    // ---- Public accessors ---------------------------------------------------

    get state(): DAPClientState {
        return this._state;
    }

    get capabilities(): Capabilities {
        return this._capabilities;
    }

    /**
     * Returns recent output from the debuggee process.
     */
    getRecentOutput(maxLines?: number): OutputEntry[] {
        const limit = maxLines ?? MAX_OUTPUT_LOG;
        return this.outputLog.slice(-limit);
    }

    // ---- Connection ---------------------------------------------------------

    async connect(port: number, host = '127.0.0.1'): Promise<void> {
        if (this._state !== 'disconnected') {
            throw new Error(`Cannot connect: client is in state '${this._state}'`);
        }

        this._state = 'connecting';

        return new Promise<void>((resolve, reject) => {
            const socket = net.createConnection({ port, host });

            const onError = (err: Error) => {
                cleanup();
                this._state = 'disconnected';
                reject(new Error(`Failed to connect to ${host}:${port}: ${err.message}`));
            };

            const onConnect = () => {
                cleanup();
                this.socket = socket;
                this._state = 'initialized';

                socket.on('data', (data: Buffer) => this.onData(data));
                socket.on('error', (err: Error) => {
                    this.rejectAllPending(err);
                    this.emit('error', err);
                });
                socket.on('close', () => {
                    this._state = 'terminated';
                    this.rejectAllPending(new Error('Connection closed'));
                    this.emit('terminated', {});
                });

                resolve();
            };

            const cleanup = () => {
                socket.removeListener('error', onError);
                socket.removeListener('connect', onConnect);
            };

            socket.once('error', onError);
            socket.once('connect', onConnect);
        });
    }

    // ---- Session lifecycle --------------------------------------------------

    async initialize(
        clientID = 'gemini-cli',
        adapterID = 'node',
    ): Promise<Capabilities> {
        this.ensureState('initialized', 'initialize');

        const response = await this.sendRequest('initialize', {
            clientID,
            adapterID,
            linesStartAt1: true,
            columnsStartAt1: true,
            pathFormat: 'path',
            supportsVariableType: true,
            supportsRunInTerminalRequest: false,
        });

        if (response.body) {
            this._capabilities = {
                supportsConfigurationDoneRequest: asBool(response.body['supportsConfigurationDoneRequest']),
                supportsExceptionInfoRequest: asBool(response.body['supportsExceptionInfoRequest']),
                supportsConditionalBreakpoints: asBool(response.body['supportsConditionalBreakpoints']),
                supportsLogPoints: asBool(response.body['supportsLogPoints']),
                supportsDataBreakpoints: asBool(response.body['supportsDataBreakpoints']),
                exceptionBreakpointFilters: asArray<ExceptionBreakpointFilter>(response.body['exceptionBreakpointFilters']),
            };
        }

        return this._capabilities;
    }

    async launch(program: string, args: string[] = []): Promise<void> {
        this.ensureState('initialized', 'launch');

        await this.sendRequest('launch', {
            program,
            args,
            stopOnEntry: true,
            noDebug: false,
        });
    }

    async attach(port: number): Promise<void> {
        this.ensureState('initialized', 'attach');

        await this.sendRequest('attach', {
            port,
        });
    }

    async configurationDone(): Promise<void> {
        this.ensureState('initialized', 'configurationDone');

        await this.sendRequest('configurationDone', {});
        this._state = 'configured';
    }

    // ---- Breakpoints --------------------------------------------------------

    async setBreakpoints(
        filePath: string,
        lines: number[],
        conditions?: Array<string | undefined>,
        logMessages?: Array<string | undefined>,
    ): Promise<Breakpoint[]> {
        this.ensureConnected('setBreakpoints');

        const breakpoints = lines.map((line, i) => {
            const bp: Record<string, unknown> = { line };
            if (conditions?.[i]) {
                bp['condition'] = conditions[i];
            }
            if (logMessages?.[i]) {
                bp['logMessage'] = logMessages[i];
            }
            return bp;
        });

        const response = await this.sendRequest('setBreakpoints', {
            source: { path: filePath },
            breakpoints,
        });

        return asArray<Breakpoint>(response.body?.['breakpoints']);
    }

    async setExceptionBreakpoints(filters: string[]): Promise<void> {
        this.ensureConnected('setExceptionBreakpoints');

        await this.sendRequest('setExceptionBreakpoints', { filters });
    }

    // ---- Inspection ---------------------------------------------------------

    async stackTrace(
        threadId: number,
        startFrame = 0,
        levels = 50,
    ): Promise<StackFrame[]> {
        this.ensureConnected('stackTrace');

        const response = await this.sendRequest('stackTrace', {
            threadId,
            startFrame,
            levels,
        });

        return asArray<StackFrame>(response.body?.['stackFrames']);
    }

    async scopes(frameId: number): Promise<Scope[]> {
        this.ensureConnected('scopes');

        const response = await this.sendRequest('scopes', { frameId });
        return asArray<Scope>(response.body?.['scopes']);
    }

    async variables(variablesReference: number): Promise<Variable[]> {
        this.ensureConnected('variables');

        const response = await this.sendRequest('variables', {
            variablesReference,
        });

        return asArray<Variable>(response.body?.['variables']);
    }

    async evaluate(
        expression: string,
        frameId?: number,
        context: 'watch' | 'repl' | 'hover' = 'repl',
    ): Promise<{ result: string; type?: string; variablesReference: number }> {
        this.ensureConnected('evaluate');

        const args: Record<string, unknown> = { expression, context };
        if (frameId !== undefined) {
            args['frameId'] = frameId;
        }

        const response = await this.sendRequest('evaluate', args);
        const body = response.body ?? {};

        return {
            result: asString(body['result']),
            type: typeof body['type'] === 'string' ? body['type'] : undefined,
            variablesReference: asNumber(body['variablesReference']),
        };
    }

    // ---- Execution control --------------------------------------------------

    async continue(threadId: number): Promise<void> {
        this.ensureConnected('continue');
        await this.sendRequest('continue', { threadId });
    }

    async next(threadId: number): Promise<void> {
        this.ensureConnected('next');
        await this.sendRequest('next', { threadId });
    }

    async stepIn(threadId: number): Promise<void> {
        this.ensureConnected('stepIn');
        await this.sendRequest('stepIn', { threadId });
    }

    async stepOut(threadId: number): Promise<void> {
        this.ensureConnected('stepOut');
        await this.sendRequest('stepOut', { threadId });
    }

    // ---- Disconnect ---------------------------------------------------------

    async disconnect(terminateDebuggee = true): Promise<void> {
        if (this._state === 'disconnected' || this._state === 'terminated') {
            return;
        }

        try {
            await this.sendRequest('disconnect', {
                terminateDebuggee,
            });
        } catch {
            // Best-effort — adapter may already be gone
        } finally {
            this.cleanup();
        }
    }

    /**
     * Force-close the connection without sending a disconnect request.
     */
    destroy(): void {
        this.cleanup();
    }

    // ---- Wire protocol (internal) -------------------------------------------

    /**
     * Send a DAP request and wait for the matching response.
     */
    sendRequest(
        command: string,
        args: Record<string, unknown>,
    ): Promise<DAPResponse> {
        if (!this.socket || this.socket.destroyed) {
            return Promise.reject(
                new Error(`Cannot send '${command}': not connected`),
            );
        }

        const seqNum = this.seq++;
        const request: DAPRequest = {
            seq: seqNum,
            type: 'request',
            command,
            arguments: args,
        };

        const body = JSON.stringify(request);
        const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}${HEADER_SEPARATOR}`;

        return new Promise<DAPResponse>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(seqNum);
                reject(new Error(`Request '${command}' (seq=${seqNum}) timed out after ${this.timeoutMs}ms`));
            }, this.timeoutMs);

            this.pendingRequests.set(seqNum, { resolve, reject, timer });

            try {
                this.socket!.write(header + body);
            } catch (err) {
                this.pendingRequests.delete(seqNum);
                clearTimeout(timer);
                reject(
                    err instanceof Error
                        ? err
                        : new Error(String(err)),
                );
            }
        });
    }

    /**
     * Handle incoming data from the TCP socket.
     * Buffers partial messages and processes complete ones.
     */
    private onData(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);

        // Process all complete messages in the buffer
         
        while (true) {
            const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
            if (headerEnd === -1) {
                break; // Waiting for complete header
            }

            const headerStr = this.buffer.subarray(0, headerEnd).toString('utf-8');
            const match = CONTENT_LENGTH_REGEX.exec(headerStr);
            if (!match) {
                // Malformed header — skip past it
                this.buffer = this.buffer.subarray(
                    headerEnd + HEADER_SEPARATOR.length,
                );
                continue;
            }

            const contentLength = parseInt(match[1], 10);
            const bodyStart = headerEnd + HEADER_SEPARATOR.length;

            if (this.buffer.length < bodyStart + contentLength) {
                break; // Waiting for complete body
            }

            const bodyStr = this.buffer
                .subarray(bodyStart, bodyStart + contentLength)
                .toString('utf-8');

            // Advance buffer past this message
            this.buffer = this.buffer.subarray(bodyStart + contentLength);

            try {
                const parsed: unknown = JSON.parse(bodyStr);
                if (
                    typeof parsed === 'object' &&
                    parsed !== null &&
                    'type' in parsed &&
                    'seq' in parsed
                ) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- structural guard above validates shape
                    this.handleMessage(parsed as DAPMessage);
                }
            } catch {
                // Malformed JSON — skip
            }
        }
    }

    /**
     * Route an incoming DAP message to the appropriate handler.
     */
    private handleMessage(message: DAPMessage): void {
        if (message.type === 'response') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- narrowed by type discriminant
            this.handleResponse(message as unknown as DAPResponse);
        } else if (message.type === 'event') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- narrowed by type discriminant
            this.handleEvent(message as unknown as DAPEvent);
        }
        // Requests from adapter (e.g. runInTerminal) are not supported yet
    }

    /**
     * Match a response to its pending request and resolve the promise.
     */
    private handleResponse(response: DAPResponse): void {
        const pending = this.pendingRequests.get(response.request_seq);
        if (!pending) {
            return; // Orphan response — ignore
        }

        this.pendingRequests.delete(response.request_seq);
        clearTimeout(pending.timer);

        if (response.success) {
            pending.resolve(response);
        } else {
            pending.reject(
                new Error(
                    response.message ??
                    `Request '${response.command}' failed`,
                ),
            );
        }
    }

    /**
     * Handle a DAP event and emit the appropriate Node.js event.
     */
    private handleEvent(event: DAPEvent): void {
        switch (event.event) {
            case 'stopped':
                this.emit('stopped', event.body ?? {});
                break;

            case 'terminated':
                this._state = 'terminated';
                this.emit('terminated', event.body ?? {});
                break;

            case 'exited':
                this.emit('exited', event.body ?? {});
                break;

            case 'output': {
                const category = event.body?.['category'];
                const outputText = event.body?.['output'];
                const validCategories = ['stdout', 'stderr', 'console', 'telemetry'] as const;
                type OutputCategory = (typeof validCategories)[number];
                const resolvedCategory: OutputCategory =
                    typeof category === 'string' && (validCategories as readonly string[]).includes(category)
                        ? (category as OutputCategory) // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion -- validated by includes check
                        : 'stdout';
                const entry: OutputEntry = {
                    category: resolvedCategory,
                    output: asString(outputText),
                    timestamp: Date.now(),
                };
                this.outputLog.push(entry);
                if (this.outputLog.length > MAX_OUTPUT_LOG) {
                    this.outputLog.shift();
                }
                this.emit('output', entry);
                break;
            }

            case 'breakpoint':
                this.emit('breakpoint', event.body ?? {});
                break;

            case 'initialized':
                // Adapter is ready for configuration (breakpoints, etc.)
                this.emit('initialized', event.body ?? {});
                break;

            default:
                // Forward unknown events generically
                this.emit(event.event, event.body ?? {});
                break;
        }
    }

    // ---- Helpers ------------------------------------------------------------

    private ensureState(expected: DAPClientState, operation: string): void {
        if (this._state !== expected) {
            throw new Error(
                `Cannot '${operation}': expected state '${expected}', got '${this._state}'`,
            );
        }
    }

    private ensureConnected(operation: string): void {
        if (
            this._state !== 'initialized' &&
            this._state !== 'configured'
        ) {
            throw new Error(
                `Cannot '${operation}': client is in state '${this._state}'`,
            );
        }
    }

    private rejectAllPending(error: Error): void {
        for (const [seq, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(error);
            this.pendingRequests.delete(seq);
        }
    }

    private cleanup(): void {
        this.rejectAllPending(new Error('Client disconnected'));
        if (this.socket && !this.socket.destroyed) {
            this.socket.destroy();
        }
        this.socket = null;
        this._state = 'disconnected';
        this.buffer = Buffer.alloc(0);
    }
}
