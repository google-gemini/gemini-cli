/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ReferenceServer,
  type ReferenceServerOptions,
} from './reference-server.js';

/**
 * Start a reference server and return it ready for testing.
 */
export async function startReferenceServer(
  options?: ReferenceServerOptions,
): Promise<ReferenceServer> {
  const server = new ReferenceServer(options);
  await server.start();
  return server;
}

/**
 * Create an authenticated MCP client connected to the reference server.
 */
export async function createAuthenticatedClient(
  server: ReferenceServer,
): Promise<Client> {
  const client = new Client({
    name: 'conformance-test-client',
    version: '1.0.0',
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${server.port}/mcp`),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${server.authToken}`,
        },
      },
    },
  );

  await client.connect(transport);
  return client;
}

import { type z } from 'zod';

/**
 * Wait for a notification of the given method on the client.
 */
export function waitForNotification<T>(
  client: Client,
  schema: z.ZodType<T>,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`Timed out waiting for notification after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    client.setNotificationHandler(schema, (notification: T) => {
      clearTimeout(timer);
      resolve(notification);
    });
  });
}
