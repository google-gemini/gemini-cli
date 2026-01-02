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
import { EventEmitter } from 'node:events';

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

      this.emit('network', {
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
            this.emit('network', {
              id,
              pending: false,
              response: {
                status: response.status,
                headers: this.stringifyHeaders(response.headers),
                body: text.substring(0, 100000),
                durationMs: 0,
              },
            });
          })
          .catch(() => {});

        return response;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit('network', { id, pending: false, error: message });
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
      const req = originalFn.apply(http, args);
      const requestChunks: Buffer[] = [];

      const oldWrite = req.write;
      const oldEnd = req.end;

      req.write = function (chunk: any, ...etc: any[]) {
        if (chunk) requestChunks.push(Buffer.from(chunk));
        return oldWrite.apply(this, [chunk, ...etc]);
      };

      req.end = function (this: any, chunk: any, ...etc: any[]) {
        if (chunk && typeof chunk !== 'function')
          requestChunks.push(Buffer.from(chunk));
        const body = Buffer.concat(requestChunks).toString('utf8');

        self.emit('network', {
          id,
          timestamp: Date.now(),
          method: req.method || 'GET',
          url,
          headers: self.stringifyHeaders(req.getHeaders()),
          body: body.substring(0, 50000),
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
          const resBody = Buffer.concat(responseChunks).toString('utf8');
          self.emit('network', {
            id,
            pending: false,
            response: {
              status: res.statusCode,
              headers: self.stringifyHeaders(res.headers),
              body: resBody.substring(0, 50000),
              durationMs: 0,
            },
          });
        });
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
