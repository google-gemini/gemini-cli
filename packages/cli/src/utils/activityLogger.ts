/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  CoreEvent,
  coreEvents,
  debugLogger,
  type ConsoleLogPayload,
  type Config,
} from '@google/gemini-cli-core';
import WebSocket from 'ws';

const ACTIVITY_ID_HEADER = 'x-activity-request-id';
const MAX_BUFFER_SIZE = 100;

/** Type guard: Array.isArray doesn't narrow readonly arrays in TS 5.8 */
function isHeaderRecord(
  h: http.OutgoingHttpHeaders | readonly string[],
): h is http.OutgoingHttpHeaders {
  return !Array.isArray(h);
}

export interface NetworkLog {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  pending?: boolean;
  chunk?: {
    index: number;
    data: string;
    timestamp: number;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body?: string;
    durationMs: number;
  };
  error?: string;
}

/** Partial update to an existing network log. */
export type PartialNetworkLog = { id: string } & Partial<NetworkLog>;

/**
 * Capture utility for session activities (network and console).
 * Provides a stream of events that can be persisted for analysis or inspection.
 */
export class ActivityLogger extends EventEmitter {
  private static instance: ActivityLogger;
  private isInterceptionEnabled = false;
  private requestStartTimes = new Map<string, number>();
  private networkLoggingEnabled = false;

  private networkBufferMap = new Map<
    string,
    Array<NetworkLog | PartialNetworkLog>
  >();
  private networkBufferIds: string[] = [];
  private consoleBuffer: Array<ConsoleLogPayload & { timestamp: number }> = [];
  private readonly bufferLimit = 10;

  static getInstance(): ActivityLogger {
    if (!ActivityLogger.instance) {
      ActivityLogger.instance = new ActivityLogger();
    }
    return ActivityLogger.instance;
  }

  enableNetworkLogging() {
    this.networkLoggingEnabled = true;
    this.emit('network-logging-enabled');
  }

  disableNetworkLogging() {
    this.networkLoggingEnabled = false;
  }

  isNetworkLoggingEnabled(): boolean {
    return this.networkLoggingEnabled;
  }

  /**
   * Atomically returns and clears all buffered logs.
   * Prevents data loss from events emitted between get and clear.
   */
  drainBufferedLogs(): {
    network: Array<NetworkLog | PartialNetworkLog>;
    console: Array<ConsoleLogPayload & { timestamp: number }>;
  } {
    const network: Array<NetworkLog | PartialNetworkLog> = [];
    for (const id of this.networkBufferIds) {
      const events = this.networkBufferMap.get(id);
      if (events) network.push(...events);
    }
    const console = [...this.consoleBuffer];
    this.networkBufferMap.clear();
    this.networkBufferIds = [];
    this.consoleBuffer = [];
    return { network, console };
  }

  getBufferedLogs(): {
    network: Array<NetworkLog | PartialNetworkLog>;
    console: Array<ConsoleLogPayload & { timestamp: number }>;
  } {
    const network: Array<NetworkLog | PartialNetworkLog> = [];
    for (const id of this.networkBufferIds) {
      const events = this.networkBufferMap.get(id);
      if (events) network.push(...events);
    }
    return {
      network,
      console: [...this.consoleBuffer],
    };
  }

  clearBufferedLogs(): void {
    this.networkBufferMap.clear();
    this.networkBufferIds = [];
    this.consoleBuffer = [];
  }

  private stringifyHeaders(headers: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    if (!headers) return result;

    if (headers instanceof Headers) {
      headers.forEach((v, k) => {
        result[k.toLowerCase()] = v;
      });
    } else if (typeof headers === 'object' && headers !== null) {
      for (const [key, val] of Object.entries(headers)) {
        result[key.toLowerCase()] = Array.isArray(val)
          ? val.join(', ')
          : String(val);
      }
    }
    return result;
  }

  private sanitizeNetworkLog(
    log: NetworkLog | PartialNetworkLog,
  ): NetworkLog | PartialNetworkLog {
    if (!log || typeof log !== 'object') return log;

    const sanitized = { ...log };

    // Sanitize request headers
    if ('headers' in sanitized && sanitized.headers) {
      const headers = { ...sanitized.headers };
      for (const key of Object.keys(headers)) {
        if (
          ['authorization', 'cookie', 'x-goog-api-key'].includes(
            key.toLowerCase(),
          )
        ) {
          headers[key] = '[REDACTED]';
        }
      }
      sanitized.headers = headers;
    }

    // Sanitize response headers
    if ('response' in sanitized && sanitized.response?.headers) {
      const resHeaders = { ...sanitized.response.headers };
      for (const key of Object.keys(resHeaders)) {
        if (['set-cookie'].includes(key.toLowerCase())) {
          resHeaders[key] = '[REDACTED]';
        }
      }
      sanitized.response = { ...sanitized.response, headers: resHeaders };
    }

    return sanitized;
  }

  /** @internal Emit a network event — public for testing only. */
  emitNetworkEvent(payload: NetworkLog | PartialNetworkLog) {
    this.safeEmitNetwork(payload);
  }

  private safeEmitNetwork(payload: NetworkLog | PartialNetworkLog) {
    const sanitized = this.sanitizeNetworkLog(payload);
    const id = sanitized.id;

    if (!this.networkBufferMap.has(id)) {
      this.networkBufferIds.push(id);
      this.networkBufferMap.set(id, []);
      // Evict oldest request group if over limit
      if (this.networkBufferIds.length > this.bufferLimit) {
        const evictId = this.networkBufferIds.shift()!;
        this.networkBufferMap.delete(evictId);
      }
    }
    this.networkBufferMap.get(id)!.push(sanitized);

    this.emit('network', sanitized);
  }

  enable() {
    if (this.isInterceptionEnabled) return;
    this.isInterceptionEnabled = true;

    this.patchGlobalFetch();
    this.patchNodeHttp();
  }

  private patchGlobalFetch() {
    if (!global.fetch) return;
    const originalFetch = global.fetch;

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('127.0.0.1') || url.includes('localhost'))
        return originalFetch(input, init);

      const id = Math.random().toString(36).substring(7);
      const method = (init?.method || 'GET').toUpperCase();

      const newInit = { ...init };
      const headers = new Headers(init?.headers || {});
      headers.set(ACTIVITY_ID_HEADER, id);
      newInit.headers = headers;

      let reqBody = '';
      if (init?.body) {
        if (typeof init.body === 'string') reqBody = init.body;
        else if (init.body instanceof URLSearchParams)
          reqBody = init.body.toString();
      }

      this.requestStartTimes.set(id, Date.now());
      this.safeEmitNetwork({
        id,
        timestamp: Date.now(),
        method,
        url,
        headers: this.stringifyHeaders(newInit.headers),
        body: reqBody,
        pending: true,
      });

      try {
        const response = await originalFetch(input, newInit);
        const clonedRes = response.clone();

        // Stream chunks if body is available
        if (clonedRes.body) {
          const reader = clonedRes.body.getReader();
          const decoder = new TextDecoder();
          const chunks: string[] = [];
          let chunkIndex = 0;

          const readStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkData = decoder.decode(value, { stream: true });
                chunks.push(chunkData);

                // Emit chunk update
                this.safeEmitNetwork({
                  id,
                  pending: true,
                  chunk: {
                    index: chunkIndex++,
                    data: chunkData,
                    timestamp: Date.now(),
                  },
                });
              }

              // Final update with complete response
              const startTime = this.requestStartTimes.get(id);
              const durationMs = startTime ? Date.now() - startTime : 0;
              this.requestStartTimes.delete(id);

              this.safeEmitNetwork({
                id,
                pending: false,
                response: {
                  status: response.status,
                  headers: this.stringifyHeaders(response.headers),
                  body: chunks.join(''),
                  durationMs,
                },
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              this.safeEmitNetwork({
                id,
                pending: false,
                error: `Failed to read response body: ${message}`,
              });
            }
          };

          void readStream();
        } else {
          // Fallback for responses without body stream
          clonedRes
            .text()
            .then((text) => {
              const startTime = this.requestStartTimes.get(id);
              const durationMs = startTime ? Date.now() - startTime : 0;
              this.requestStartTimes.delete(id);

              this.safeEmitNetwork({
                id,
                pending: false,
                response: {
                  status: response.status,
                  headers: this.stringifyHeaders(response.headers),
                  body: text,
                  durationMs,
                },
              });
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              this.safeEmitNetwork({
                id,
                pending: false,
                error: `Failed to read response body: ${message}`,
              });
            });
        }

        return response;
      } catch (err: unknown) {
        this.requestStartTimes.delete(id);
        const message = err instanceof Error ? err.message : String(err);
        this.safeEmitNetwork({ id, pending: false, error: message });
        throw err;
      }
    };
  }

  private patchNodeHttp() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const originalRequest = http.request;
    const originalHttpsRequest = https.request;

    const wrapRequest = (
      originalFn: typeof http.request,
      args: unknown[],
      protocol: string,
    ) => {
      const firstArg = args[0];
      let options: http.RequestOptions | string | URL;
      if (typeof firstArg === 'string') {
        options = firstArg;
      } else if (firstArg instanceof URL) {
        options = firstArg;
      } else {
        options = (firstArg ?? {}) as http.RequestOptions;
      }

      let url = '';
      if (typeof options === 'string') {
        url = options;
      } else if (options instanceof URL) {
        url = options.href;
      } else {
        // Some callers pass URL-like objects that include href
        const href =
          'href' in options && typeof options.href === 'string'
            ? options.href
            : '';
        url =
          href ||
          `${protocol}//${options.hostname || options.host || 'localhost'}${options.path || '/'}`;
      }

      if (url.includes('127.0.0.1') || url.includes('localhost'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        return originalFn.apply(http, args as any);

      const rawHeaders =
        typeof options === 'object' &&
        options !== null &&
        !(options instanceof URL)
          ? options.headers
          : undefined;
      let headers: http.OutgoingHttpHeaders = {};
      if (rawHeaders && isHeaderRecord(rawHeaders)) {
        headers = rawHeaders;
      }

      if (headers[ACTIVITY_ID_HEADER]) {
        delete headers[ACTIVITY_ID_HEADER];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        return originalFn.apply(http, args as any);
      }

      const id = Math.random().toString(36).substring(7);
      this.requestStartTimes.set(id, Date.now());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
      const req = originalFn.apply(http, args as any);
      const requestChunks: Buffer[] = [];

      const oldWrite = req.write;
      const oldEnd = req.end;

      req.write = function (chunk: unknown, ...etc: unknown[]) {
        if (chunk) {
          const encoding =
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            typeof etc[0] === 'string' ? (etc[0] as BufferEncoding) : undefined;
          requestChunks.push(
            Buffer.isBuffer(chunk)
              ? chunk
              : typeof chunk === 'string'
                ? Buffer.from(chunk, encoding)
                : Buffer.from(
                    chunk instanceof Uint8Array ? chunk : String(chunk),
                  ),
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        return oldWrite.apply(this, [chunk, ...etc] as any);
      };

      req.end = function (
        this: http.ClientRequest,
        chunk: unknown,
        ...etc: unknown[]
      ) {
        if (chunk && typeof chunk !== 'function') {
          const encoding =
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            typeof etc[0] === 'string' ? (etc[0] as BufferEncoding) : undefined;
          requestChunks.push(
            Buffer.isBuffer(chunk)
              ? chunk
              : typeof chunk === 'string'
                ? Buffer.from(chunk, encoding)
                : Buffer.from(
                    chunk instanceof Uint8Array ? chunk : String(chunk),
                  ),
          );
        }
        const body = Buffer.concat(requestChunks).toString('utf8');

        self.safeEmitNetwork({
          id,
          timestamp: Date.now(),
          method: req.method || 'GET',
          url,
          headers: self.stringifyHeaders(req.getHeaders()),
          body,
          pending: true,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-return
        return (oldEnd as any).apply(this, [chunk, ...etc]);
      };

      req.on('response', (res: http.IncomingMessage) => {
        const responseChunks: Buffer[] = [];
        let chunkIndex = 0;

        res.on('data', (chunk: Buffer) => {
          const chunkBuffer = Buffer.from(chunk);
          responseChunks.push(chunkBuffer);

          // Emit chunk update for streaming
          self.safeEmitNetwork({
            id,
            pending: true,
            chunk: {
              index: chunkIndex++,
              data: chunkBuffer.toString('utf8'),
              timestamp: Date.now(),
            },
          });
        });

        res.on('end', () => {
          const buffer = Buffer.concat(responseChunks);
          const encoding = res.headers['content-encoding'];

          const processBuffer = (finalBuffer: Buffer) => {
            const resBody = finalBuffer.toString('utf8');
            const startTime = self.requestStartTimes.get(id);
            const durationMs = startTime ? Date.now() - startTime : 0;
            self.requestStartTimes.delete(id);

            self.safeEmitNetwork({
              id,
              pending: false,
              response: {
                status: res.statusCode || 0,
                headers: self.stringifyHeaders(res.headers),
                body: resBody,
                durationMs,
              },
            });
          };

          if (encoding === 'gzip') {
            zlib.gunzip(buffer, (err, decompressed) => {
              processBuffer(err ? buffer : decompressed);
            });
          } else if (encoding === 'deflate') {
            zlib.inflate(buffer, (err, decompressed) => {
              processBuffer(err ? buffer : decompressed);
            });
          } else {
            processBuffer(buffer);
          }
        });
      });

      req.on('error', (err: Error) => {
        self.requestStartTimes.delete(id);
        const message = err.message;
        self.safeEmitNetwork({
          id,
          pending: false,
          error: message,
        });
      });

      return req;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
    (http as any).request = (...args: unknown[]) =>
      wrapRequest(originalRequest, args, 'http:');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
    (https as any).request = (...args: unknown[]) =>
      wrapRequest(originalHttpsRequest as typeof http.request, args, 'https:');
  }

  logConsole(payload: ConsoleLogPayload) {
    const enriched = { ...payload, timestamp: Date.now() };
    this.consoleBuffer.push(enriched);
    if (this.consoleBuffer.length > this.bufferLimit) {
      this.consoleBuffer.shift();
    }
    this.emit('console', enriched);
  }
}

/**
 * Setup file-based logging to JSONL
 */
function setupFileLogging(
  capture: ActivityLogger,
  config: Config,
  customPath?: string,
) {
  const logFile =
    customPath ||
    (config.storage
      ? path.join(
          config.storage.getProjectTempLogsDir(),
          `session-${config.getSessionId()}.jsonl`,
        )
      : null);

  if (!logFile) return;

  const logsDir = path.dirname(logFile);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const writeToLog = (type: 'console' | 'network', payload: unknown) => {
    try {
      const entry =
        JSON.stringify({
          type,
          payload,
          sessionId: config.getSessionId(),
          timestamp: Date.now(),
        }) + '\n';

      fs.promises.appendFile(logFile, entry).catch((err) => {
        debugLogger.error('Failed to write to activity log:', err);
      });
    } catch (err) {
      debugLogger.error('Failed to prepare activity log entry:', err);
    }
  };

  capture.on('console', (payload) => writeToLog('console', payload));
  capture.on('network', (payload) => writeToLog('network', payload));
}

/**
 * Setup network-based logging via WebSocket
 */
function setupNetworkLogging(
  capture: ActivityLogger,
  host: string,
  port: number,
  config: Config,
  onReconnectFailed?: () => void,
) {
  const transportBuffer: object[] = [];
  let ws: WebSocket | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let sessionId: string | null = null;
  let pingInterval: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 2;

  const connect = () => {
    try {
      ws = new WebSocket(`ws://${host}:${port}/ws`);

      ws.on('open', () => {
        debugLogger.debug(`WebSocket connected to ${host}:${port}`);
        reconnectAttempts = 0;
        // Register with CLI's session ID
        sendMessage({
          type: 'register',
          sessionId: config.getSessionId(),
          timestamp: Date.now(),
        });
      });

      ws.on('message', (data: Buffer) => {
        try {
          const parsed: unknown = JSON.parse(data.toString());
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'type' in parsed &&
            typeof parsed.type === 'string'
          ) {
            handleServerMessage({
              type: parsed.type,
              sessionId:
                'sessionId' in parsed && typeof parsed.sessionId === 'string'
                  ? parsed.sessionId
                  : undefined,
            });
          }
        } catch (err) {
          debugLogger.debug('Invalid WebSocket message:', err);
        }
      });

      ws.on('close', () => {
        debugLogger.debug(`WebSocket disconnected from ${host}:${port}`);
        cleanup();
        scheduleReconnect();
      });

      ws.on('error', (err) => {
        debugLogger.debug(`WebSocket error:`, err);
      });
    } catch (err) {
      debugLogger.debug(`Failed to connect WebSocket:`, err);
      scheduleReconnect();
    }
  };

  const handleServerMessage = (message: {
    type: string;
    sessionId?: string;
  }) => {
    switch (message.type) {
      case 'registered':
        sessionId = message.sessionId || null;
        debugLogger.debug(`WebSocket session registered: ${sessionId}`);

        // Start ping interval
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          sendMessage({ type: 'pong', timestamp: Date.now() });
        }, 15000);

        // Flush buffered logs
        flushBuffer();
        break;

      case 'ping':
        sendMessage({ type: 'pong', timestamp: Date.now() });
        break;

      default:
        // Ignore unknown message types
        break;
    }
  };

  const sendMessage = (message: object) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const sendToNetwork = (type: 'console' | 'network', payload: object) => {
    const message = {
      type,
      payload,
      sessionId: sessionId || config.getSessionId(),
      timestamp: Date.now(),
    };

    // If not connected or network logging not enabled, buffer
    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN ||
      !capture.isNetworkLoggingEnabled()
    ) {
      transportBuffer.push(message);
      if (transportBuffer.length > MAX_BUFFER_SIZE) transportBuffer.shift();
      return;
    }

    sendMessage(message);
  };

  const flushBuffer = () => {
    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN ||
      !capture.isNetworkLoggingEnabled()
    ) {
      return;
    }

    const { network, console: consoleLogs } = capture.drainBufferedLogs();
    const allInitialLogs: Array<{
      type: 'network' | 'console';
      payload: object;
      timestamp: number;
    }> = [
      ...network.map((l) => ({
        type: 'network' as const,
        payload: l,
        timestamp: 'timestamp' in l && l.timestamp ? l.timestamp : Date.now(),
      })),
      ...consoleLogs.map((l) => ({
        type: 'console' as const,
        payload: l,
        timestamp: l.timestamp,
      })),
    ].sort((a, b) => a.timestamp - b.timestamp);

    debugLogger.debug(
      `Flushing ${allInitialLogs.length} initial buffered logs and ${transportBuffer.length} transport buffered logs...`,
    );

    for (const log of allInitialLogs) {
      sendMessage({
        type: log.type,
        payload: log.payload,
        sessionId: sessionId || config.getSessionId(),
        timestamp: Date.now(),
      });
    }

    while (transportBuffer.length > 0) {
      const message = transportBuffer.shift()!;
      sendMessage(message);
    }
  };

  const cleanup = () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    ws = null;
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) return;

    reconnectAttempts++;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS && onReconnectFailed) {
      debugLogger.debug(
        `WebSocket reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts, promoting to server...`,
      );
      onReconnectFailed();
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      debugLogger.debug('Reconnecting WebSocket...');
      connect();
    }, 1000);
  };

  // Initial connection
  connect();

  capture.on('console', (payload) => sendToNetwork('console', payload));
  capture.on('network', (payload) => sendToNetwork('network', payload));

  capture.on('network-logging-enabled', () => {
    debugLogger.debug('Network logging enabled, flushing buffer...');
    flushBuffer();
  });

  // Cleanup on process exit
  process.on('exit', () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
    cleanup();
  });
}

let bridgeAttached = false;

/**
 * Bridge coreEvents to the ActivityLogger singleton (guarded — only once).
 */
function bridgeCoreEvents(capture: ActivityLogger) {
  if (bridgeAttached) return;
  bridgeAttached = true;
  coreEvents.on(CoreEvent.ConsoleLog, (payload) => {
    capture.logConsole(payload);
  });
}

/**
 * Initialize the activity logger with a specific transport mode.
 *
 * @param config  CLI configuration
 * @param options Transport configuration: network (WebSocket) or file (JSONL)
 */
export function initActivityLogger(
  config: Config,
  options:
    | {
        mode: 'network';
        host: string;
        port: number;
        onReconnectFailed?: () => void;
      }
    | { mode: 'file'; filePath?: string }
    | { mode: 'buffer' },
): void {
  const capture = ActivityLogger.getInstance();
  capture.enable();

  if (options.mode === 'network') {
    setupNetworkLogging(
      capture,
      options.host,
      options.port,
      config,
      options.onReconnectFailed,
    );
    capture.enableNetworkLogging();
  } else if (options.mode === 'file') {
    setupFileLogging(capture, config, options.filePath);
  }
  // buffer mode: no transport, just intercept + bridge

  bridgeCoreEvents(capture);
}

/**
 * Add a network (WebSocket) transport to the existing ActivityLogger singleton.
 * Used for promotion re-entry without re-bridging coreEvents.
 */
export function addNetworkTransport(
  config: Config,
  host: string,
  port: number,
  onReconnectFailed?: () => void,
): void {
  const capture = ActivityLogger.getInstance();
  setupNetworkLogging(capture, host, port, config, onReconnectFailed);
}
