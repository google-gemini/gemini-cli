/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export interface NetworkLog {
  id: string;
  sessionId?: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
  pending?: boolean;
  response?: {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body?: string;
    durationMs: number;
  };
  error?: string;
}

export interface ConsoleLogPayload {
  type: 'log' | 'warn' | 'error' | 'debug' | 'info';
  content: string;
}

export interface InspectorConsoleLog extends ConsoleLogPayload {
  id: string;
  sessionId?: string;
  timestamp: number;
}

/**
 * DevTools Viewer
 *
 * Deeply discovers and tails session logs across all projects.
 */
export class DevTools extends EventEmitter {
  private static instance: DevTools;
  private logs: NetworkLog[] = [];
  private consoleLogs: InspectorConsoleLog[] = [];
  private server: http.Server | null = null;
  private port = 25417;
  private watchedFiles = new Map<string, number>(); // filePath -> lastSize

  private constructor() {
    super();
  }

  static getInstance(): DevTools {
    if (!DevTools.instance) {
      DevTools.instance = new DevTools();
    }
    return DevTools.instance;
  }

  getNetworkLogs() {
    return this.logs;
  }

  getConsoleLogs() {
    return this.consoleLogs;
  }

  /**
   * Main entry for log discovery.
   * It scans both user home and system tmp for .gemini/tmp folders.
   */
  setLogFile() {
    const potentialRoots = [
      path.join(os.homedir(), '.gemini', 'tmp'),
      path.join(os.tmpdir(), '.gemini', 'tmp'),
    ];

    for (const baseDir of potentialRoots) {
      if (fs.existsSync(baseDir)) {
        console.log(`🔍 Scanning for logs in: ${baseDir}`);
        this.deepDiscover(baseDir);
        this.watchRoot(baseDir);
      }
    }
  }

  private watchRoot(root: string) {
    try {
      fs.watch(root, { recursive: true }, (_event, filename) => {
        if (
          filename &&
          filename.includes('session-') &&
          filename.endsWith('.jsonl')
        ) {
          this.deepDiscover(root);
        }
      });
    } catch {
      setInterval(() => this.deepDiscover(root), 2000);
    }
  }

  private deepDiscover(dir: string) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        let stats: fs.Stats;
        try {
          stats = fs.statSync(fullPath);
        } catch {
          continue;
        }

        if (stats.isDirectory()) {
          if (item === 'logs' || item.length > 20) {
            this.deepDiscover(fullPath);
          }
        } else if (item.startsWith('session-') && item.endsWith('.jsonl')) {
          if (!this.watchedFiles.has(fullPath)) {
            this.watchedFiles.set(fullPath, 0);
            this.readNewLogs(fullPath, 0);
          } else if (stats.size > this.watchedFiles.get(fullPath)!) {
            this.readNewLogs(fullPath, this.watchedFiles.get(fullPath)!);
            this.watchedFiles.set(fullPath, stats.size);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  private readNewLogs(filePath: string, startByte: number) {
    try {
      const filename = path.basename(filePath);
      const sessionMatch = filename.match(/session-(.*)\.jsonl/);
      const fallbackSessionId = sessionMatch ? sessionMatch[1] : undefined;

      const stream = fs.createReadStream(filePath, { start: startByte });
      let buffer = '';

      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            const sid = entry.sessionId || fallbackSessionId;
            if (entry.type === 'console') {
              this.addInternalConsoleLog(entry.payload, sid, entry.timestamp);
            } else if (entry.type === 'network') {
              this.addInternalNetworkLog(entry.payload, sid, entry.timestamp);
            }
          } catch {
            /* ignore */
          }
        }
        try {
          this.watchedFiles.set(filePath, fs.statSync(filePath).size);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }

  private addInternalConsoleLog(
    payload: ConsoleLogPayload,
    sessionId?: string,
    timestamp?: number,
  ) {
    this.consoleLogs.push({
      ...payload,
      id: Math.random().toString(36).substring(7),
      sessionId,
      timestamp: timestamp || Date.now(),
    });
    if (this.consoleLogs.length > 5000) this.consoleLogs.shift();
    this.emit('console-update');
  }

  private addInternalNetworkLog(
    payload: Partial<NetworkLog>,
    sessionId?: string,
    timestamp?: number,
  ) {
    if (!payload.id) return;
    const existingIndex = this.logs.findIndex((l) => l.id === payload.id);
    if (existingIndex > -1) {
      this.logs[existingIndex] = {
        ...this.logs[existingIndex],
        ...payload,
        sessionId: sessionId || this.logs[existingIndex].sessionId,
        response: payload.response
          ? { ...this.logs[existingIndex].response, ...payload.response }
          : this.logs[existingIndex].response,
      } as NetworkLog;
    } else if (payload.url) {
      this.logs.push({
        ...payload,
        sessionId,
        timestamp: timestamp || Date.now(),
      } as NetworkLog);
      if (this.logs.length > 2000) this.logs.shift();
    }
    this.emit('update');
  }

  getUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private getClientPath(): string {
    return path.join(path.dirname(fileURLToPath(import.meta.url)), '../client');
  }

  start(): Promise<string> {
    return new Promise((resolve) => {
      if (this.server) {
        resolve(this.getUrl());
        return;
      }
      const clientPath = this.getClientPath();
      this.server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (req.url === '/' || req.url === '/index.html') {
          fs.readFile(path.join(clientPath, 'index.html'), (err, data) => {
            if (err) {
              res.writeHead(500);
              res.end('Error loading client');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(data);
            }
          });
        } else if (req.url?.startsWith('/assets/')) {
          const assetPath = path.join(clientPath, req.url);
          fs.readFile(assetPath, (err, data) => {
            if (err) {
              res.writeHead(404);
              res.end('Not Found');
            } else {
              const ext = path.extname(assetPath);
              let contentType = 'text/plain';
              if (ext === '.js') contentType = 'application/javascript';
              if (ext === '.css') contentType = 'text/css';
              if (ext === '.svg') contentType = 'image/svg+xml';
              res.writeHead(200, { 'Content-Type': contentType });
              res.end(data);
            }
          });
        } else if (req.url === '/logs') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.logs));
        } else if (req.url === '/console-logs') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.consoleLogs));
        } else if (req.url === '/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          const l1 = () => res.write(`event: update\ndata: \n\n`);
          const l2 = () => res.write(`event: console-update\ndata: \n\n`);
          this.on('update', l1);
          this.on('console-update', l2);
          req.on('close', () => {
            this.off('update', l1);
            this.off('console-update', l2);
          });
        }
      });
      this.server.on('error', (e: unknown) => {
        if (
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          e.code === 'EADDRINUSE'
        ) {
          this.port++;
          this.server?.listen(this.port, '127.0.0.1');
        }
      });
      this.server.listen(this.port, '127.0.0.1', () => {
        resolve(this.getUrl());
      });
    });
  }
}
