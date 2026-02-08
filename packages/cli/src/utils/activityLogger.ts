/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-this-alias */

import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { CoreEvent, coreEvents, debugLogger } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import WebSocket from 'ws';

const ACTIVITY_ID_HEADER = 'x-activity-request-id';
const MAX_BUFFER_SIZE = 100;

/**
 * Parse a host:port string into its components.
 * Uses the URL constructor for robust handling of IPv4, IPv6, and hostnames.
 * Returns null for file paths or values without a valid port.
 */
function parseHostPort(value: string): { host: string; port: number } | null {
  if (value.startsWith('/') || value.startsWith('.')) return null;

  try {
    const url = new URL(`ws://${value}`);
    if (!url.port) return null;

    const port = parseInt(url.port, 10);
    if (url.hostname && !isNaN(port) && port > 0 && port <= 65535) {
      return { host: url.hostname, port };
    }
  } catch {
    // Not a valid host:port
  }

  return null;
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

/**
 * Capture utility for session activities (network and console).
 * Provides a stream of events that can be persisted for analysis or inspection.
 */
export class ActivityLogger extends EventEmitter {
  private static instance: ActivityLogger;
  private isInterceptionEnabled = false;
  private requestStartTimes = new Map<string, number>();
  private networkLoggingEnabled = false;

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

  private sanitizeNetworkLog(log: any): any {
    if (!log || typeof log !== 'object') return log;

    const sanitized = { ...log };

    // Sanitize request headers
    if (sanitized.headers) {
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
    if (sanitized.response?.headers) {
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

  private safeEmitNetwork(payload: any) {
    this.emit('network', this.sanitizeNetworkLog(payload));
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
            : (input as any).url;
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
    const self = this;
    const originalRequest = http.request;
    const originalHttpsRequest = https.request;

    const wrapRequest = (originalFn: any, args: any[], protocol: string) => {
      const options = args[0];
      const url =
        typeof options === 'string'
          ? options
          : options.href ||
            `${protocol}//${options.hostname || options.host || 'localhost'}${options.path || '/'}`;

      if (url.includes('127.0.0.1') || url.includes('localhost'))
        return originalFn.apply(http, args);

      const headers =
        typeof options === 'object' && typeof options !== 'function'
          ? (options as any).headers
          : {};
      if (headers && headers[ACTIVITY_ID_HEADER]) {
        delete headers[ACTIVITY_ID_HEADER];
        return originalFn.apply(http, args);
      }

      const id = Math.random().toString(36).substring(7);
      self.requestStartTimes.set(id, Date.now());
      const req = originalFn.apply(http, args);
      const requestChunks: Buffer[] = [];

      const oldWrite = req.write;
      const oldEnd = req.end;

      req.write = function (chunk: any, ...etc: any[]) {
        if (chunk) {
          const encoding =
            typeof etc[0] === 'string' ? (etc[0] as BufferEncoding) : undefined;
          requestChunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
          );
        }
        return oldWrite.apply(this, [chunk, ...etc]);
      };

      req.end = function (this: any, chunk: any, ...etc: any[]) {
        if (chunk && typeof chunk !== 'function') {
          const encoding =
            typeof etc[0] === 'string' ? (etc[0] as BufferEncoding) : undefined;
          requestChunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
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
        return oldEnd.apply(this, [chunk, ...etc]);
      };

      req.on('response', (res: any) => {
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
                status: res.statusCode,
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

      req.on('error', (err: any) => {
        self.requestStartTimes.delete(id);
        const message = err instanceof Error ? err.message : String(err);
        self.safeEmitNetwork({ id, pending: false, error: message });
      });

      return req;
    };

    http.request = (...args: any[]) =>
      wrapRequest(originalRequest, args, 'http:');
    https.request = (...args: any[]) =>
      wrapRequest(originalHttpsRequest, args, 'https:');
  }

  logConsole(payload: unknown) {
    this.emit('console', payload);
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
) {
  const buffer: Array<Record<string, unknown>> = [];
  let ws: WebSocket | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let sessionId: string | null = null;
  let pingInterval: NodeJS.Timeout | null = null;

  const connect = () => {
    try {
      ws = new WebSocket(`ws://${host}:${port}/ws`);

      ws.on('open', () => {
        debugLogger.debug(`WebSocket connected to ${host}:${port}`);
        // Register with CLI's session ID
        sendMessage({
          type: 'register',
          sessionId: config.getSessionId(),
          timestamp: Date.now(),
        });
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          handleServerMessage(message);
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

  const handleServerMessage = (message: any) => {
    switch (message.type) {
      case 'registered':
        sessionId = message.sessionId;
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

  const sendMessage = (message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const sendToNetwork = (type: 'console' | 'network', payload: unknown) => {
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
      buffer.push(message);
      if (buffer.length > MAX_BUFFER_SIZE) buffer.shift();
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

    debugLogger.debug(`Flushing ${buffer.length} buffered logs...`);
    while (buffer.length > 0) {
      const message = buffer.shift()!;
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

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      debugLogger.debug('Reconnecting WebSocket...');
      connect();
    }, 5000);
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

/**
 * Registers the activity logger if debug mode and interactive session are enabled.
 * Captures network and console logs to a session-specific JSONL file or sends to network.
 *
 * Environment variable GEMINI_CLI_ACTIVITY_LOG_TARGET controls the output:
 * - host:port format (e.g., "localhost:25417") → network mode (auto-enabled)
 * - file path (e.g., "/tmp/logs.jsonl") → file mode (immediate)
 * - not set → uses default file location in project temp logs dir
 *
 * @param config The CLI configuration
 */
export function registerActivityLogger(config: Config) {
  const target = process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'];
  const hostPort = target ? parseHostPort(target) : null;

  // Network mode doesn't need storage; file mode does
  if (!hostPort && !config.storage) {
    return;
  }

  const capture = ActivityLogger.getInstance();
  capture.enable();

  if (hostPort) {
    // Network mode: send logs via WebSocket
    setupNetworkLogging(capture, hostPort.host, hostPort.port, config);
    // Auto-enable network logging when target is explicitly configured
    capture.enableNetworkLogging();
  } else {
    // File mode: write to JSONL file
    setupFileLogging(capture, config, target);
  }

  // Bridge CoreEvents to local capture
  coreEvents.on(CoreEvent.ConsoleLog, (payload) => {
    capture.logConsole(payload);
  });
}
