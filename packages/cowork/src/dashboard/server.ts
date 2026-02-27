/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Local web dashboard server — Phase 4.
 *
 * Starts an HTTP server on localhost that:
 *   • Serves the pre-built Vite/React UI from ui/dist/ (or a dev proxy).
 *   • Streams agent events in real-time via Server-Sent Events (SSE).
 *   • Exposes REST endpoints for session history and token usage.
 *
 * Usage:
 *   const dash = new DashboardServer(3141);
 *   dash.start();
 *   // ...
 *   dash.emit({ type: 'think', iteration: 1, content: 'Reasoning...' });
 *   // ...
 *   dash.stop();
 *
 * Or via CLI:
 *   cowork run "my goal" --dashboard
 *   → opens http://localhost:3141 in the browser
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardEventType =
  | 'session_start'
  | 'think'
  | 'act'
  | 'observe'
  | 'session_end'
  | 'token_usage'
  | 'screenshot';

export interface DashboardEvent {
  type: DashboardEventType;
  /** ISO 8601 timestamp (auto-set if not provided). */
  timestamp?: string;
  /** Iteration number for think/act/observe events. */
  iteration?: number;
  /** Human-readable content of the event. */
  content?: string;
  /** Tool name for act events. */
  tool?: string;
  /** Token usage snapshot. */
  tokens?: {
    input: number;
    output: number;
    total: number;
    estimatedCostUsd: number;
  };
  /** Base-64 encoded screenshot (PNG/JPEG) for vision events. */
  screenshotBase64?: string;
}

export interface TokenUsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Estimated cost in USD based on Gemini Flash pricing. */
  estimatedCostUsd: number;
  sessions: number;
}

// ---------------------------------------------------------------------------
// DashboardServer
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIST = join(__dirname, '..', '..', 'ui', 'dist');

/**
 * Lightweight HTTP server that drives the Gemini Cowork web dashboard.
 *
 * Built on Node's built-in `http` module with no framework dependency.
 */
export class DashboardServer {
  private server: Server | null = null;
  private readonly clients = new Set<ServerResponse>();
  private readonly history: DashboardEvent[] = [];
  private readonly usage: TokenUsageStats = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    sessions: 0,
  };

  constructor(private readonly port: number = 3141) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Start the HTTP server on the configured port. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        reject(new Error(`Dashboard server failed to start: ${err.message}`));
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        resolve();
      });
    });
  }

  /** Gracefully shut down the server and close all SSE connections. */
  stop(): Promise<void> {
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  get url(): string {
    return `http://localhost:${this.port}`;
  }

  // ── Event emission ────────────────────────────────────────────────────────

  /** Broadcast an event to all connected SSE clients and store in history. */
  emit(event: DashboardEvent): void {
    const stamped: DashboardEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };

    this.history.push(stamped);

    // Update token usage when a token_usage event is emitted.
    if (stamped.type === 'token_usage' && stamped.tokens) {
      this.usage.inputTokens += stamped.tokens.input;
      this.usage.outputTokens += stamped.tokens.output;
      this.usage.totalTokens += stamped.tokens.total;
      this.usage.estimatedCostUsd += stamped.tokens.estimatedCostUsd;
    }

    if (stamped.type === 'session_start') {
      this.usage.sessions++;
    }

    const sseData = `data: ${JSON.stringify(stamped)}\n\n`;
    for (const client of this.clients) {
      client.write(sseData);
    }
  }

  // ── Request routing ───────────────────────────────────────────────────────

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';

    try {
      if (url === '/events' && req.method === 'GET') {
        this.handleSSE(req, res);
      } else if (url === '/api/history' && req.method === 'GET') {
        this.sendJson(res, this.history);
      } else if (url === '/api/usage' && req.method === 'GET') {
        this.sendJson(res, this.usage);
      } else if (url === '/api/clear' && req.method === 'POST') {
        this.history.length = 0;
        this.sendJson(res, { ok: true });
      } else {
        await this.serveStatic(url, res);
      }
    } catch {
      res.writeHead(500).end('Internal Server Error');
    }
  }

  // ── SSE ───────────────────────────────────────────────────────────────────

  private handleSSE(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send the full history as a batch on connect.
    for (const event of this.history) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Send a heartbeat every 15 s to keep the connection alive.
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15_000);

    this.clients.add(res);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  }

  // ── Static file serving ───────────────────────────────────────────────────

  private async serveStatic(url: string, res: ServerResponse): Promise<void> {
    // Normalise path (fallback to index.html for SPA routing).
    let path = url === '/' ? '/index.html' : url;
    // Strip query string.
    path = path.split('?')[0] ?? '/index.html';

    const filePath = join(UI_DIST, path);

    if (!existsSync(filePath)) {
      // SPA fallback.
      const indexPath = join(UI_DIST, 'index.html');
      if (existsSync(indexPath)) {
        const html = await readFile(indexPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.fallbackHtml());
      }
      return;
    }

    const content = await readFile(filePath);
    const mime = this.mimeType(path);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  }

  private mimeType(path: string): string {
    const ext = path.split('.').pop() ?? '';
    const map: Record<string, string> = {
      html: 'text/html; charset=utf-8',
      js: 'application/javascript',
      css: 'text/css',
      json: 'application/json',
      png: 'image/png',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  /** Minimal HTML shown when the UI hasn't been built yet. */
  private fallbackHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Gemini Cowork Dashboard</title>
<style>
  body { font-family: monospace; background: #0d1117; color: #c9d1d9; padding: 2rem; }
  h1 { color: #58a6ff; } code { background: #161b22; padding: .2em .4em; border-radius: 4px; }
  #events { border: 1px solid #30363d; border-radius: 8px; padding: 1rem; height: 70vh; overflow-y: auto; }
  .think { color: #58a6ff; } .act { color: #3fb950; } .observe { color: #d2a8ff; }
</style>
</head>
<body>
<h1>Gemini Cowork — Command Center</h1>
<p>UI not built yet. Run <code>cd ui && npm install && npm run build</code></p>
<p>Live events from <code>GET /events</code>:</p>
<div id="events"></div>
<script>
  const el = document.getElementById('events');
  const es = new EventSource('/events');
  es.onmessage = e => {
    const ev = JSON.parse(e.data);
    const div = document.createElement('div');
    div.className = ev.type;
    div.textContent = '[' + ev.type + '] ' + (ev.content ?? JSON.stringify(ev));
    el.prepend(div);
  };
</script>
</body>
</html>`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private sendJson(res: ServerResponse, data: unknown): void {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  }
}
