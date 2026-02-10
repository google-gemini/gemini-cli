/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import express from 'express';
import cors from 'cors';
import * as https from 'node:https';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../client/dist');

const app = express();
const PORT = process.env.PORT || 3001;
const UPSTREAM_URL =
  process.env.UPSTREAM_GCA_ENDPOINT || 'https://cloudcode-pa.googleapis.com';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(CLIENT_DIST));

// --- Types ---
interface PendingRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: any;
  receivedAt: string;
  upstreamResponse?: {
    statusCode: number;
    headers: Record<string, string>;
    body: any;
    chunks?: any[]; // For SSE
  };
  resolve: (response: {
    statusCode: number;
    body: any;
    chunks?: any[];
  }) => void;
}

interface InterceptConfig {
  [endpoint: string]: boolean;
}

// --- State ---
const pendingRequests: Map<string, PendingRequest> = new Map();
let interceptConfig: InterceptConfig = {
  '/v1internal:generateContent': false,
  '/v1internal:streamGenerateContent': true,
  '/v1internal:loadCodeAssist': false,
  '/v1internal:onboardUser': false,
  '/v1internal:listExperiments': false,
  '/v1internal:retrieveUserQuota': false,
  '/v1internal:countTokens': false,
  '/v1internal:recordCodeAssistMetrics': false,
  '/v1internal:fetchAdminControls': false,
  '/v1internal:getCodeAssistGlobalUserSetting': false,
  '/v1internal:setCodeAssistGlobalUserSetting': false,
};

// --- WebSocket ---
let wss: WebSocketServer;

function broadcast(message: any) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function sendPendingList() {
  const list = Array.from(pendingRequests.values()).map((r) => ({
    id: r.id,
    method: r.method,
    path: r.path,
    body: r.body,
    receivedAt: r.receivedAt,
    upstreamResponse: r.upstreamResponse,
  }));
  broadcast({ type: 'pending_list', data: list });
}

function sendConfig() {
  broadcast({ type: 'config', data: interceptConfig });
}

// --- Upstream Request ---
async function fetchUpstream(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: any,
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  chunks?: any[];
}> {
  const url = new URL(path, UPSTREAM_URL);
  const isStreaming = path.includes(':streamGenerateContent');
  const bodyStr = body && method !== 'GET' ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    // Remove accept-encoding to get uncompressed responses
    const { 'accept-encoding': _, ...headersWithoutEncoding } = headers;

    const requestHeaders: Record<string, string> = {
      ...headersWithoutEncoding,
      host: url.hostname,
    };

    // Ensure Content-Type and Content-Length are set for POST requests
    if (bodyStr) {
      requestHeaders['content-type'] = 'application/json';
      requestHeaders['content-length'] = Buffer.byteLength(bodyStr).toString();
    }

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: requestHeaders,
    };

    console.log(`[Upstream] ${method} ${url.href}`);

    const req = https.request(options, (res) => {
      console.log(
        `[Upstream] Response status: ${res.statusCode}, encoding: ${res.headers['content-encoding']}`,
      );

      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(res.headers)) {
        if (typeof value === 'string') {
          responseHeaders[key] = value;
        }
      }

      // Create decompression stream if needed
      let stream: NodeJS.ReadableStream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      if (
        isStreaming &&
        res.headers['content-type']?.includes('text/event-stream')
      ) {
        // Collect SSE chunks
        const chunks: any[] = [];
        let buffer = '';

        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                chunks.push(data);
              } catch {
                // Ignore parse errors
              }
            }
          }
        });

        stream.on('end', () => {
          console.log(`[Upstream] SSE complete, ${chunks.length} chunks`);
          resolve({
            statusCode: res.statusCode || 200,
            headers: responseHeaders,
            body: null,
            chunks,
          });
        });
      } else {
        // Regular JSON response
        const buffers: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => {
          buffers.push(chunk);
        });
        stream.on('end', () => {
          const data = Buffer.concat(buffers).toString('utf-8');
          console.log(`[Upstream] Response body length: ${data.length}`);
          if (data.length < 500) {
            console.log(`[Upstream] Response body: ${data}`);
          }
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }

          // For streaming endpoints, if response is an array, treat as chunks
          if (isStreaming && Array.isArray(parsed)) {
            console.log(
              `[Upstream] Streaming array response with ${parsed.length} chunks`,
            );
            resolve({
              statusCode: res.statusCode || 200,
              headers: responseHeaders,
              body: null,
              chunks: parsed,
            });
          } else {
            resolve({
              statusCode: res.statusCode || 200,
              headers: responseHeaders,
              body: parsed,
            });
          }
        });
      }

      stream.on('error', (err) => {
        console.error('[Upstream] Response error:', err);
        reject(err);
      });
    });

    req.on('error', (err) => {
      console.error('[Upstream] Request error:', err);
      reject(err);
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// --- Upstream Request with Live Preview (streams chunks to UI) ---
async function fetchUpstreamWithLivePreview(
  method: string,
  reqPath: string,
  headers: Record<string, string>,
  body: any,
  requestId: string,
): Promise<void> {
  const url = new URL(reqPath, UPSTREAM_URL);
  const bodyStr = body && method !== 'GET' ? JSON.stringify(body) : null;

  const { 'accept-encoding': _enc, ...headersWithoutEncoding } = headers;
  const requestHeaders: Record<string, string> = {
    ...headersWithoutEncoding,
    host: url.hostname,
  };
  if (bodyStr) {
    requestHeaders['content-type'] = 'application/json';
    requestHeaders['content-length'] = Buffer.byteLength(bodyStr).toString();
  }

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method,
    headers: requestHeaders,
  };

  return new Promise<void>((resolve, reject) => {
    console.log(`[Upstream] Live preview: ${method} ${url.href}`);

    const req = https.request(options, (res) => {
      const statusCode = res.statusCode || 200;
      const chunks: any[] = [];

      // Decompress if needed
      let stream: NodeJS.ReadableStream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      if (res.headers['content-type']?.includes('text/event-stream')) {
        // SSE streaming - broadcast chunks as they arrive
        let buffer = '';
        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                chunks.push(data);
                // Broadcast each chunk to UI in real-time
                broadcast({
                  type: 'chunk_preview',
                  data: {
                    id: requestId,
                    chunk: data,
                    chunkIndex: chunks.length - 1,
                  },
                });
              } catch {
                // Ignore parse errors
              }
            }
          }
        });

        stream.on('end', () => {
          console.log(
            `[Upstream] Live preview complete, ${chunks.length} chunks`,
          );
          const pending = pendingRequests.get(requestId);
          if (pending) {
            pending.upstreamResponse = {
              statusCode,
              headers: {},
              body: null,
              chunks,
            };
            sendPendingList();
          }
          // Notify UI streaming is done, ready for editing
          broadcast({
            type: 'upstream_complete',
            data: {
              id: requestId,
              upstreamResponse: { statusCode, headers: {}, body: null, chunks },
            },
          });
          resolve();
        });
      } else {
        // Non-SSE response (e.g. JSON array) - buffer then send
        const buffers: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => {
          buffers.push(chunk);
        });
        stream.on('end', () => {
          const rawData = Buffer.concat(buffers).toString('utf-8');
          let parsed: any;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }

          const upstreamResponse = Array.isArray(parsed)
            ? { statusCode, headers: {}, body: null, chunks: parsed }
            : { statusCode, headers: {}, body: parsed };

          const pending = pendingRequests.get(requestId);
          if (pending) {
            pending.upstreamResponse = upstreamResponse;
            sendPendingList();
          }
          broadcast({
            type: 'upstream_complete',
            data: { id: requestId, upstreamResponse },
          });
          resolve();
        });
      }

      stream.on('error', (err) => {
        console.error('[Upstream] Live preview error:', err);
        reject(err);
      });
    });

    req.on('error', (err) => {
      console.error('[Upstream] Request error:', err);
      reject(err);
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// --- Direct Pipe-through (for passthrough requests) ---
function pipeUpstream(
  method: string,
  reqPath: string,
  headers: Record<string, string>,
  body: any,
  res: express.Response,
) {
  const url = new URL(reqPath, UPSTREAM_URL);
  const bodyStr = body && method !== 'GET' ? JSON.stringify(body) : null;

  const { 'accept-encoding': _enc, ...headersWithoutEncoding } = headers;
  const requestHeaders: Record<string, string> = {
    ...headersWithoutEncoding,
    host: url.hostname,
  };
  if (bodyStr) {
    requestHeaders['content-type'] = 'application/json';
    requestHeaders['content-length'] = Buffer.byteLength(bodyStr).toString();
  }

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method,
    headers: requestHeaders,
  };

  const proxyReq = https.request(options, (upstreamRes) => {
    // Forward status and headers directly
    const responseHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (value && !['content-encoding', 'transfer-encoding'].includes(key)) {
        responseHeaders[key] = value;
      }
    }

    // Decompress if needed, then pipe straight through
    let stream: NodeJS.ReadableStream = upstreamRes;
    const encoding = upstreamRes.headers['content-encoding'];
    if (encoding === 'gzip') {
      stream = upstreamRes.pipe(zlib.createGunzip());
    } else if (encoding === 'deflate') {
      stream = upstreamRes.pipe(zlib.createInflate());
    } else if (encoding === 'br') {
      stream = upstreamRes.pipe(zlib.createBrotliDecompress());
    }

    res.writeHead(upstreamRes.statusCode || 200, responseHeaders);
    stream.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy] Pipe error:', err);
    res.status(502).json({ error: 'Proxy error', message: String(err) });
  });

  if (bodyStr) {
    proxyReq.write(bodyStr);
  }
  proxyReq.end();
}

// --- Request Handler ---
app.all(/^\/v1internal/, async (req, res) => {
  const reqPath = req.path;
  const method = req.method;

  // Get matching intercept key
  const interceptKey = Object.keys(interceptConfig).find((k) =>
    reqPath.includes(k.replace('/v1internal', '')),
  );
  const shouldIntercept = interceptKey ? interceptConfig[interceptKey] : false;

  // Forward headers (excluding some)
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      typeof value === 'string' &&
      !['host', 'content-length'].includes(key.toLowerCase())
    ) {
      headers[key] = value;
    }
  }

  if (!shouldIntercept) {
    // Passthrough: pipe directly without buffering
    console.log(`[Proxy] Passthrough: ${method} ${reqPath}`);
    pipeUpstream(method, reqPath, headers, req.body, res);
    return;
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isStreaming = reqPath.includes(':streamGenerateContent');

  try {
    console.log(`[Proxy] Intercepting: ${method} ${reqPath} (id=${id})`);

    const pending: PendingRequest = {
      id,
      method,
      path: reqPath,
      headers,
      body: req.body,
      receivedAt: new Date().toISOString(),
      resolve: () => {}, // Will be set below
    };

    // Wait for UI to release
    const responsePromise = new Promise<{
      statusCode: number;
      body: any;
      chunks?: any[];
    }>((resolve) => {
      pending.resolve = resolve;
    });

    pendingRequests.set(id, pending);
    sendPendingList();

    // Notify UI that we're intercepting (streaming status for live preview)
    broadcast({
      type: 'request_intercepted',
      data: {
        id,
        method,
        path: reqPath,
        body: req.body,
        streaming: isStreaming,
      },
    });

    if (isStreaming) {
      // Live preview: stream chunks to UI as they arrive
      await fetchUpstreamWithLivePreview(
        method,
        reqPath,
        headers,
        req.body,
        id,
      );
    } else {
      // Non-streaming: buffer and send upstream response to UI at once
      const upstreamResponse = await fetchUpstream(
        method,
        reqPath,
        headers,
        req.body,
      );
      pending.upstreamResponse = upstreamResponse;
      sendPendingList();
      broadcast({
        type: 'upstream_complete',
        data: { id, upstreamResponse },
      });
    }

    const modifiedResponse = await responsePromise;

    // Send response to CLI
    if (
      modifiedResponse.chunks &&
      Array.isArray(modifiedResponse.chunks) &&
      modifiedResponse.chunks.length > 0
    ) {
      res.writeHead(modifiedResponse.statusCode, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      for (const chunk of modifiedResponse.chunks) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.end();
    } else {
      res.status(modifiedResponse.statusCode).json(modifiedResponse.body);
    }

    pendingRequests.delete(id);
    sendPendingList();
  } catch (error) {
    console.error('[Proxy] Error:', error);
    pendingRequests.delete(id);
    res.status(502).json({ error: 'Proxy error', message: String(error) });
  }
});

// --- Auto-release pending requests when interception is disabled ---
function autoReleasePending(configUpdate: Partial<InterceptConfig>) {
  for (const [endpoint, enabled] of Object.entries(configUpdate)) {
    if (enabled) continue; // Only act on endpoints being disabled
    for (const [id, pending] of pendingRequests) {
      if (pending.path.includes(endpoint.replace('/v1internal', ''))) {
        console.log(
          `[Proxy] Auto-releasing ${id} (interception disabled for ${endpoint})`,
        );
        if (pending.upstreamResponse) {
          pending.resolve({
            statusCode: pending.upstreamResponse.statusCode,
            body: pending.upstreamResponse.body,
            chunks: pending.upstreamResponse.chunks,
          });
        } else {
          pending.resolve({
            statusCode: 502,
            body: { error: 'Interception disabled' },
          });
        }
        pendingRequests.delete(id);
      }
    }
  }
  sendPendingList();
}

// --- API for UI ---
app.get('/api/config', (req, res) => {
  res.json(interceptConfig);
});

app.post('/api/config', (req, res) => {
  interceptConfig = { ...interceptConfig, ...req.body };
  autoReleasePending(req.body);
  sendConfig();
  res.json({ success: true });
});

app.get('/api/pending', (req, res) => {
  const list = Array.from(pendingRequests.values()).map((r) => ({
    id: r.id,
    method: r.method,
    path: r.path,
    body: r.body,
    receivedAt: r.receivedAt,
    upstreamResponse: r.upstreamResponse,
  }));
  res.json(list);
});

app.get('/api/pending/:id', (req, res) => {
  const pending = pendingRequests.get(req.params.id);
  if (!pending) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({
    id: pending.id,
    method: pending.method,
    path: pending.path,
    body: pending.body,
    receivedAt: pending.receivedAt,
    upstreamResponse: pending.upstreamResponse,
  });
});

app.post('/api/release/:id', (req, res) => {
  const pending = pendingRequests.get(req.params.id);
  if (!pending) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { statusCode, body, chunks } = req.body;
  pending.resolve({ statusCode: statusCode || 200, body, chunks });
  res.json({ success: true });
});

// --- SPA Fallback ---
app.get('*', (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

// --- SSL Certificate ---
function generateCert() {
  console.log('Generating self-signed certificate...');
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'countryName', value: 'US' },
    { shortName: 'ST', value: 'California' },
    { name: 'localityName', value: 'Mountain View' },
    { name: 'organizationName', value: 'GCA Proxy' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
}

const { key, cert } = generateCert();

// --- Start Server ---
const server = https.createServer({ key, cert }, app);
wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  sendConfig();
  sendPendingList();

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'release') {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          pending.resolve({
            statusCode: msg.statusCode || 200,
            body: msg.body,
            chunks: msg.chunks,
          });
        }
      } else if (msg.type === 'update_config') {
        interceptConfig = { ...interceptConfig, ...msg.config };
        autoReleasePending(msg.config);
        sendConfig();
      }
    } catch (e) {
      console.error('[WS] Parse error:', e);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n🚀 GCA Proxy running at https://localhost:${PORT}`);
  console.log(`📡 Upstream: ${UPSTREAM_URL}`);
  console.log(`\nTo use with Gemini CLI:`);
  console.log(`  export CODE_ASSIST_ENDPOINT=https://localhost:${PORT}`);
  console.log(`  export NODE_TLS_REJECT_UNAUTHORIZED=0\n`);
});
