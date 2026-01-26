/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import { appEvents, AppEvent } from './events.js';
import { debugLogger } from '@google/gemini-cli-core';

const REMOTE_INPUT_PORT = 41243;

export class RemoteInputServer {
  private server: http.Server | undefined;

  start() {
    this.server = http.createServer((req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && (req.url === '/message' || req.url === '/message/stream')) {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            // Handle both raw format { text: "..." } and A2A format
            let text = '';
            
            // 1. Check for A2A JSON-RPC format
            if (data.params?.message?.parts?.[0]?.text) {
                text = data.params.message.parts[0].text;
            }
            // 2. Check for simple format
            else if (data.text) {
                text = data.text;
            }
            // 3. Check for message object (A2A style params body)
            else if (data.message?.parts?.[0]?.text) {
                text = data.message.parts[0].text;
            }
            // 4. Check for message object (standard content style)
            else if (data.message?.content?.[0]?.text) {
                text = data.message.content[0].text;
            }

            if (text) {
              debugLogger.log('[RemoteInputServer] Received input:', text);
              appEvents.emit(AppEvent.RemoteInput, text);
              
              // Respond with SSE-like structure or just OK
              // Chrome Extension expects SSE if it hits /message/stream
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
              });
              res.write(`data: ${JSON.stringify({
                  result: {
                      kind: 'status-update',
                      status: {
                          message: {
                              parts: [{ kind: 'text', text: 'Input received by interactive CLI.' }]
                          }
                      }
                  }
              })}\n\n`);
              res.end();
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'No text found in body' }));
            }
          } catch (e) {
            debugLogger.error('[RemoteInputServer] Error parsing body:', e);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.server.listen(REMOTE_INPUT_PORT, '127.0.0.1', () => {
      debugLogger.log(`[RemoteInputServer] Listening on http://127.0.0.1:${REMOTE_INPUT_PORT}`);
    });
    
    this.server.on('error', (err) => {
        debugLogger.warn(`[RemoteInputServer] Failed to start: ${err.message}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }
}

export const remoteInputServer = new RemoteInputServer();
