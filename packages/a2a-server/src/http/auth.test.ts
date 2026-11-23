/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import express, { type Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import request from 'supertest';
import type { A2ARequestHandler } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';

import {
  createAuthMiddleware,
  createUserBuilder,
  requireLoopbackRequest,
  resolveAuthSecret,
} from './auth.js';
import { logger } from '../utils/logger.js';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Lets the tests observe that tokens are compared with timingSafeEqual.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const SECRET = 'unit-test-secret';

const listen = (app: express.Express) =>
  new Promise<Server>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });

const close = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

const appWith = (...middlewares: express.RequestHandler[]) => {
  const app = express();
  app.use(...middlewares);
  app.get('/', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

describe('resolveAuthSecret', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_IPC_SECRET', '');
    vi.stubEnv('CODER_AGENT_AUTH_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return undefined when no secret is configured', () => {
    expect(resolveAuthSecret()).toBeUndefined();
  });

  it('should read GEMINI_IPC_SECRET', () => {
    vi.stubEnv('GEMINI_IPC_SECRET', 'ipc-secret');
    expect(resolveAuthSecret()).toBe('ipc-secret');
  });

  it('should fall back to CODER_AGENT_AUTH_TOKEN', () => {
    vi.stubEnv('CODER_AGENT_AUTH_TOKEN', 'coder-agent-token');
    expect(resolveAuthSecret()).toBe('coder-agent-token');
  });

  it('should prefer GEMINI_IPC_SECRET when both are set', () => {
    vi.stubEnv('GEMINI_IPC_SECRET', 'ipc-secret');
    vi.stubEnv('CODER_AGENT_AUTH_TOKEN', 'coder-agent-token');
    expect(resolveAuthSecret()).toBe('ipc-secret');
  });
});

describe('requireLoopbackRequest', () => {
  let server: Server;

  beforeAll(async () => {
    server = await listen(appWith(requireLoopbackRequest));
  });

  afterAll(() => close(server));

  beforeEach(() => {
    vi.mocked(logger.warn).mockClear();
  });

  it.each([
    'localhost',
    'localhost:41242',
    'LOCALHOST:41242',
    '127.0.0.1',
    '127.0.0.1:41242',
    '[::1]',
    '[::1]:41242',
  ])('should allow Host: %s', async (host) => {
    const response = await request(server).get('/').set('Host', host);
    expect(response.status).toBe(200);
  });

  it.each([
    'external.example.com',
    'external.example.com:41242',
    'localhost.example.com',
    'localhost.example.com:41242',
    'example-localhost',
    '127.0.0.1.example.com',
    '127.0.0.2',
    '0.0.0.0:41242',
    '192.168.1.10:41242',
    '[::2]:41242',
    '::1',
    'localhost:',
    'localhost:41242.example.com',
    'localhost:41242@example.com',
    'localhost, example.com',
    '',
  ])('should reject Host: %j', async (host) => {
    const response = await request(server).get('/').set('Host', host);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Invalid Host header' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(host)),
    );
  });

  it('should reject a request without a Host header', async () => {
    // Only HTTP/1.0 allows the header to be left out, and no HTTP client will
    // do that on request, so this one is written by hand.
    const { port } = server.address() as AddressInfo;
    const response = await new Promise<string>((resolve, reject) => {
      let received = '';
      const socket = connect(port, '127.0.0.1', () => {
        socket.write('GET / HTTP/1.0\r\n\r\n');
      });
      socket.on('data', (chunk) => {
        received += chunk.toString();
      });
      socket.on('end', () => resolve(received));
      socket.on('error', reject);
    });

    expect(response).toMatch(/^HTTP\/1\.1 403 /);
  });

  it('should allow a request without an Origin header', async () => {
    const response = await request(server).get('/');
    expect(response.status).toBe(200);
  });

  it.each([
    'http://localhost',
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:41242',
    'http://[::1]:41242',
  ])('should allow Origin: %s', async (origin) => {
    const response = await request(server).get('/').set('Origin', origin);
    expect(response.status).toBe(200);
  });

  it.each([
    'http://external.example.com',
    'https://external.example.com',
    'http://external.example.com:41242',
    'http://localhost.example.com',
    'http://127.0.0.1.example.com',
    'http://localhost@example.com',
    'http://localhost:3000/path',
    'null',
    'file://',
    'chrome-extension://abcdefghijklmnop',
    'vscode-file://vscode-app',
    'vscode-webview://1a2b3c4d-5e6f-7a8b',
    '',
  ])('should reject Origin: %j', async (origin) => {
    const response = await request(server).get('/').set('Origin', origin);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Origin not allowed' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(origin)),
    );
  });
});

describe('createAuthMiddleware', () => {
  let server: Server;

  beforeAll(async () => {
    server = await listen(appWith(createAuthMiddleware(SECRET)));
  });

  afterAll(() => close(server));

  beforeEach(() => {
    vi.mocked(logger.warn).mockClear();
    vi.mocked(timingSafeEqual).mockClear();
  });

  it('should reject a request without an Authorization header', async () => {
    const response = await request(server).get('/');
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it.each([
    ['a different token', 'Bearer invalid-token'],
    ['the bearer token "valid-token"', 'Bearer valid-token'],
    [
      'basic credentials',
      `Basic ${Buffer.from('admin:password').toString('base64')}`,
    ],
    ['unencoded basic credentials', 'Basic admin:password'],
    ['the secret under the Basic scheme', `Basic ${SECRET}`],
    ['the secret without a scheme', SECRET],
    ['a truncated secret', `Bearer ${SECRET.slice(0, -1)}`],
    ['the secret followed by more characters', `Bearer ${SECRET}0`],
    ['the secret in another case', `Bearer ${SECRET.toUpperCase()}`],
    ['a token much longer than the secret', `Bearer ${'a'.repeat(4096)}`],
    ['an empty token', 'Bearer '],
  ])('should reject %s', async (_description, authorization) => {
    const response = await request(server)
      .get('/')
      .set('Authorization', authorization);
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it.each([
    ['', `Bearer ${SECRET}`],
    [' with a lowercase scheme', `bearer ${SECRET}`],
    [' with several spaces after the scheme', `Bearer   ${SECRET}`],
  ])('should accept the secret%s', async (_description, authorization) => {
    const response = await request(server)
      .get('/')
      .set('Authorization', authorization);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('should compare tokens with timingSafeEqual, whatever their length', async () => {
    for (const token of ['x', SECRET, 'a'.repeat(4096)]) {
      await request(server).get('/').set('Authorization', `Bearer ${token}`);
    }

    const comparisons = vi.mocked(timingSafeEqual).mock.calls;
    expect(comparisons).toHaveLength(3);
    for (const [presented, expected] of comparisons) {
      expect(presented.byteLength).toBe(expected.byteLength);
    }
  });

  it('should not write a rejected token to the log', async () => {
    const token = 'rejected-token-value';
    await request(server).get('/').set('Authorization', `Bearer ${token}`);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(
      token,
    );
  });

  it.each([[undefined], ['']])(
    'should reject every request when the secret is %j',
    async (missingSecret) => {
      const unconfigured = await listen(
        appWith(createAuthMiddleware(missingSecret)),
      );
      try {
        for (const authorization of [
          undefined,
          'Bearer ',
          'Bearer undefined',
          'Bearer null',
          `Bearer ${SECRET}`,
        ]) {
          const pending = request(unconfigured).get('/');
          if (authorization !== undefined) {
            pending.set('Authorization', authorization);
          }
          const response = await pending;
          expect(response.status).toBe(500);
          expect(response.body).toEqual({
            error: 'Server authentication is not configured.',
          });
        }
      } finally {
        await close(unconfigured);
      }
    },
  );
});

describe('createUserBuilder', () => {
  const requestWith = (authorization?: string) =>
    ({ headers: { authorization } }) as unknown as Request;

  it('should identify a caller that presents the secret', async () => {
    const user = await createUserBuilder(SECRET)(
      requestWith(`Bearer ${SECRET}`),
    );
    expect(user).toEqual({ userName: 'bearer-user', isAuthenticated: true });
  });

  it.each([
    undefined,
    'Bearer invalid-token',
    'Bearer valid-token',
    `Basic ${Buffer.from('admin:password').toString('base64')}`,
    `Basic ${SECRET}`,
  ])('should not identify a caller sending %j', async (authorization) => {
    await expect(
      createUserBuilder(SECRET)(requestWith(authorization)),
    ).rejects.toThrow('Unauthenticated request');
  });

  it.each([[undefined], ['']])(
    'should not identify anyone when the secret is %j',
    async (missingSecret) => {
      const buildUser = createUserBuilder(missingSecret);
      for (const authorization of [undefined, 'Bearer ', 'Bearer undefined']) {
        await expect(buildUser(requestWith(authorization))).rejects.toThrow(
          'Unauthenticated request',
        );
      }
    },
  );

  it('should not pass an unauthenticated request to the A2A request handler', async () => {
    // Mounted without the auth middleware, so only the user builder is
    // exercised.
    const requestHandler = { getAgentCard: vi.fn(), sendMessage: vi.fn() };
    const app = new A2AExpressApp(
      requestHandler as unknown as A2ARequestHandler,
      createUserBuilder(SECRET),
    ).setupRoutes(express(), '');
    const server = await listen(app);
    const sendMessage = () =>
      request(server)
        .post('/')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              role: 'user',
              parts: [{ kind: 'text', text: 'hello' }],
              messageId: 'message-1',
            },
          },
        });

    try {
      const unauthenticated = await sendMessage();
      expect(unauthenticated.status).toBe(500);
      expect(requestHandler.sendMessage).not.toHaveBeenCalled();

      const authenticated = await sendMessage().set(
        'Authorization',
        `Bearer ${SECRET}`,
      );
      expect(authenticated.status).toBe(200);
      expect(requestHandler.sendMessage).toHaveBeenCalledTimes(1);
      const [, context] = requestHandler.sendMessage.mock.calls[0];
      expect(context.user.isAuthenticated).toBe(true);
    } finally {
      await close(server);
    }
  });
});
