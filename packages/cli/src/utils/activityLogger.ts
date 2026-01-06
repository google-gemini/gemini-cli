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

const ACTIVITY_ID_HEADER = 'x-activity-request-id';

export interface NetworkLog {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  pending?: boolean;
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

  static getInstance(): ActivityLogger {
    if (!ActivityLogger.instance) {
      ActivityLogger.instance = new ActivityLogger();
    }
    return ActivityLogger.instance;
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
      if (url.includes('127.0.0.1')) return originalFetch(input, init);

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

      if (url.includes('127.0.0.1')) return originalFn.apply(http, args);

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
        res.on('data', (chunk: Buffer) =>
          responseChunks.push(Buffer.from(chunk)),
        );
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
 * Registers the activity logger if debug mode and interactive session are enabled.
 * Captures network and console logs to a session-specific JSONL file.
 *
 * @param config The CLI configuration
 */
export function registerActivityLogger(config: Config) {
  if (config.isInteractive() && config.storage && config.getDebugMode()) {
    const capture = ActivityLogger.getInstance();
    capture.enable();

    const logsDir = config.storage.getProjectTempLogsDir();
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(
      logsDir,
      `session-${config.getSessionId()}.jsonl`,
    );
    const writeToLog = (type: 'console' | 'network', payload: unknown) => {
      try {
        const entry =
          JSON.stringify({
            type,
            payload,
            timestamp: Date.now(),
          }) + '\n';

        // Use asynchronous fire-and-forget to avoid blocking the event loop
        fs.promises.appendFile(logFile, entry).catch((err) => {
          debugLogger.error('Failed to write to activity log:', err);
        });
      } catch (err) {
        debugLogger.error('Failed to prepare activity log entry:', err);
      }
    };

    capture.on('console', (payload) => writeToLog('console', payload));
    capture.on('network', (payload) => writeToLog('network', payload));

    // Bridge CoreEvents to local capture
    coreEvents.on(CoreEvent.ConsoleLog, (payload) => {
      capture.logConsole(payload);
    });
  }
}
