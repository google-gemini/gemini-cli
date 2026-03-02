/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsResultSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  IdeContextNotificationSchema,
  IdeDiffAcceptedNotificationSchema,
  IdeDiffRejectedNotificationSchema,
  IdeContextSchema,
} from '../types.js';
import type { ReferenceServer } from './reference-server.js';
import {
  startReferenceServer,
  createAuthenticatedClient,
  waitForNotification,
} from './test-helpers.js';

describe('IDE Companion Conformance Tests', () => {
  let server: ReferenceServer;

  beforeAll(async () => {
    server = await startReferenceServer({
      workspacePath: process.cwd(),
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  // ── Discovery File ──────────────────────────────────────────────────

  describe('Discovery file', () => {
    it('creates discovery file at the correct path', () => {
      expect(server.portFile).toBeDefined();
      const expectedDir = path.join(os.tmpdir(), 'gemini', 'ide');
      expect(server.portFile!.startsWith(expectedDir)).toBe(true);
    });

    it('discovery file name matches expected pattern', () => {
      const filename = path.basename(server.portFile!);
      const pattern = /^gemini-ide-server-\d+-\d+\.json$/;
      expect(pattern.test(filename)).toBe(true);
    });

    it('discovery file contains valid JSON with required fields', async () => {
      const content = await fs.readFile(server.portFile!, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('port');
      expect(parsed).toHaveProperty('workspacePath');
      expect(parsed).toHaveProperty('authToken');
      expect(typeof parsed.port).toBe('number');
      expect(typeof parsed.workspacePath).toBe('string');
      expect(typeof parsed.authToken).toBe('string');
    });

    it('discovery file has restricted permissions (0o600)', async () => {
      // Skip on Windows where POSIX permissions aren't supported
      if (process.platform === 'win32') return;

      const stats = await fs.stat(server.portFile!);
       
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('discovery file is cleaned up on shutdown', async () => {
      const tempServer = await startReferenceServer();
      const portFile = tempServer.portFile!;

      // File should exist
      await expect(fs.access(portFile)).resolves.toBeUndefined();

      await tempServer.stop();

      // File should be deleted
      await expect(fs.access(portFile)).rejects.toThrow();
    });
  });

  // ── Authentication ──────────────────────────────────────────────────

  describe('Authentication', () => {
    it('rejects requests without Authorization header (401)', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        }),
      });
      expect(res.status).toBe(401);
    });

    it('rejects requests with invalid token (401)', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        }),
      });
      expect(res.status).toBe(401);
    });

    it('accepts requests with valid token', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${server.authToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        }),
      });
      expect(res.status).toBe(200);
    });

    it('rejects requests with Origin header (403)', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${server.authToken}`,
          Origin: 'http://evil.com',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ── MCP Protocol ────────────────────────────────────────────────────

  describe('MCP protocol', () => {
    let client: Client;

    beforeAll(async () => {
      client = await createAuthenticatedClient(server);
    });

    afterAll(async () => {
      await client.close();
    });

    it('tools/list returns openDiff and closeDiff', async () => {
      const response = await client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema,
      );

      const toolNames = response.tools.map((t) => t.name);
      expect(toolNames).toContain('openDiff');
      expect(toolNames).toContain('closeDiff');
    });

    it('openDiff tool has correct input schema', async () => {
      const response = await client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema,
      );

      const openDiff = response.tools.find((t) => t.name === 'openDiff');
      expect(openDiff).toBeDefined();
      expect(openDiff!.inputSchema).toBeDefined();
      expect(openDiff!.inputSchema.properties).toHaveProperty('filePath');
      expect(openDiff!.inputSchema.properties).toHaveProperty('newContent');
    });

    it('closeDiff tool has correct input schema', async () => {
      const response = await client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema,
      );

      const closeDiff = response.tools.find((t) => t.name === 'closeDiff');
      expect(closeDiff).toBeDefined();
      expect(closeDiff!.inputSchema).toBeDefined();
      expect(closeDiff!.inputSchema.properties).toHaveProperty('filePath');
    });
  });

  // ── Context Notifications ───────────────────────────────────────────

  describe('Context notifications', () => {
    it('ide/contextUpdate conforms to IdeContextSchema', async () => {
      const client = await createAuthenticatedClient(server);

      try {
        const notificationPromise = waitForNotification(
          client,
          IdeContextNotificationSchema,
        );

        server.broadcastContextUpdate();
        const notification = await notificationPromise;

        expect(notification.method).toBe('ide/contextUpdate');
        // Validate against schema - should not throw
        const result = IdeContextSchema.safeParse(notification.params);
        expect(result.success).toBe(true);
      } finally {
        await client.close();
      }
    });
  });

  // ── Diff Lifecycle ──────────────────────────────────────────────────

  describe('Diff lifecycle', () => {
    let client: Client;

    beforeAll(async () => {
      client = await createAuthenticatedClient(server);
    });

    afterAll(async () => {
      await client.close();
    });

    it('openDiff returns empty content array', async () => {
      const result = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'openDiff',
            arguments: {
              filePath: '/tmp/test-file.ts',
              newContent: 'console.log("hello");',
            },
          },
        },
        CallToolResultSchema,
      );

      expect(result.content).toEqual([]);
    });

    it('closeDiff returns content from previously opened diff', async () => {
      // First open a diff
      await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'openDiff',
            arguments: {
              filePath: '/tmp/close-test.ts',
              newContent: 'const x = 42;',
            },
          },
        },
        CallToolResultSchema,
      );

      // Then close it
      const result = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'closeDiff',
            arguments: { filePath: '/tmp/close-test.ts' },
          },
        },
        CallToolResultSchema,
      );

      expect(result.content).toHaveLength(1);
      const textPart = result.content[0];
      expect(textPart.type).toBe('text');
      if (textPart.type === 'text') {
        const parsed = JSON.parse(textPart.text);
        expect(parsed.content).toBe('const x = 42;');
      }
    });

    it('ide/diffAccepted notification conforms to schema', async () => {
      const diffClient = await createAuthenticatedClient(server);

      try {
        const notificationPromise = waitForNotification(
          diffClient,
          IdeDiffAcceptedNotificationSchema,
        );

        // Wait a bit for the GET SSE stream to connect
        setTimeout(() => {
          server.triggerDiffAccepted('/tmp/accepted.ts', 'accepted content');
        }, 100);

        const notification = await notificationPromise;

        expect(notification.method).toBe('ide/diffAccepted');
        expect(notification.params.filePath).toBe('/tmp/accepted.ts');
        expect(notification.params.content).toBe('accepted content');
      } finally {
        await diffClient.close();
      }
    });

    it('ide/diffRejected notification conforms to schema', async () => {
      const diffClient = await createAuthenticatedClient(server);

      try {
        const notificationPromise = waitForNotification(
          diffClient,
          IdeDiffRejectedNotificationSchema,
        );

        // Wait a bit for the GET SSE stream to connect
        setTimeout(() => {
          server.triggerDiffRejected('/tmp/rejected.ts');
        }, 100);

        const notification = await notificationPromise;

        expect(notification.method).toBe('ide/diffRejected');
        expect(notification.params.filePath).toBe('/tmp/rejected.ts');
      } finally {
        await diffClient.close();
      }
    });
  });
});
