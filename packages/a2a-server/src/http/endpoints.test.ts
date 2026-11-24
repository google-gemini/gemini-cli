/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import request from 'supertest';
import type express from 'express';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createApp, updateCoderAgentCardUrl } from './app.js';
import type { TaskMetadata } from '../types.js';
import { createMockConfig } from '../utils/testing_utils.js';
import { debugLogger, type Config } from '@google/gemini-cli-core';
import * as core from '@google/gemini-cli-core';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../config/config.js';
import { Task } from '../agent/task.js';

// Every route requires `Authorization: Bearer <GEMINI_IPC_SECRET>`.
const TEST_AUTH_TOKEN = randomUUID();
const BEARER = `Bearer ${TEST_AUTH_TOKEN}`;
const authedAgent = (target: express.Express) =>
  request.agent(target).set('Authorization', BEARER);

// Mock the logger to avoid polluting test output
// Comment out to help debug
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../persistence/gcs.js', () => {
  class MockGCSTaskStore {
    load = vi.fn();
    save = vi.fn();
  }
  class MockNoOpTaskStore {
    constructor(public store: unknown) {}
  }
  return {
    GCSTaskStore: MockGCSTaskStore,
    NoOpTaskStore: MockNoOpTaskStore,
  };
});

// Mock Task.create to avoid its complex setup
vi.mock('../agent/task.js', () => {
  class MockTask {
    id: string;
    contextId: string;
    taskState = 'submitted';
    config = {
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue({ model: 'gemini-pro' }),
    };
    geminiClient = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };
    constructor(id: string, contextId: string) {
      this.id = id;
      this.contextId = contextId;
    }
    static create = vi
      .fn()
      .mockImplementation((id, contextId) =>
        Promise.resolve(new MockTask(id, contextId)),
      );
    getMetadata = vi.fn().mockImplementation(async () => ({
      id: this.id,
      contextId: this.contextId,
      taskState: this.taskState,
      model: 'gemini-pro',
      mcpServers: [],
      availableTools: [],
    }));
  }
  return { Task: MockTask };
});

vi.mock('../config/config.js', async () => {
  const actual = await vi.importActual('../config/config.js');
  return {
    ...actual,
    loadConfig: vi
      .fn()
      .mockImplementation(async () => createMockConfig({}) as Config),
  };
});

describe('Agent Server Endpoints', () => {
  let app: express.Express;
  let server: Server;
  let testWorkspace: string;

  const createTask = (contextId: string) =>
    authedAgent(app)
      .post('/tasks')
      .send({
        contextId,
        agentSettings: {
          kind: 'agent-settings',
          workspacePath: testWorkspace,
        },
      })
      .set('Content-Type', 'application/json');

  // Starts a separate app, for tests that vary the environment it is created
  // with.
  const withNewServer = async (run: (newServer: Server) => Promise<void>) => {
    const newApp = await createApp();
    const newServer = await new Promise<Server>((resolve) => {
      const listening = newApp.listen(0, '127.0.0.1', () => resolve(listening));
    });
    try {
      await run(newServer);
    } finally {
      await new Promise<void>((resolve, reject) => {
        newServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  };

  beforeAll(async () => {
    // Create a unique temporary directory for the workspace to avoid conflicts
    testWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-agent-test-'),
    );
    // createApp() reads the secret once, so it has to be set before the shared
    // app is created as well as for the tests that create their own.
    vi.stubEnv('GEMINI_IPC_SECRET', TEST_AUTH_TOKEN);
    app = await createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port;
        updateCoderAgentCardUrl(port);
        resolve();
      });
    });
  });

  beforeEach(() => {
    vi.stubEnv('GEMINI_IPC_SECRET', TEST_AUTH_TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    if (testWorkspace) {
      try {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
      } catch (e) {
        debugLogger.warn(`Could not remove temp dir '${testWorkspace}':`, e);
      }
    }
  });

  it('should create a new task via POST /tasks', async () => {
    const response = await createTask('test-context');
    expect(response.status).toBe(201);
    expect(response.body).toBeTypeOf('string'); // Should return the task ID
  }, 7000);

  it('should create a new task via POST /tasks when request body is empty', async () => {
    const response = await authedAgent(app).post('/tasks');
    expect(response.status).toBe(201);
    expect(response.body).toBeTypeOf('string');
  }, 7000);

  it('should get metadata for a specific task via GET /tasks/:taskId/metadata', async () => {
    const createResponse = await createTask('test-context-2');
    const taskId = createResponse.body;
    const response = await authedAgent(app).get(`/tasks/${taskId}/metadata`);
    expect(response.status).toBe(200);
    expect(response.body.metadata.id).toBe(taskId);
  }, 6000);

  it('should get metadata for all tasks via GET /tasks/metadata', async () => {
    const createResponse = await createTask('test-context-3');
    const taskId = createResponse.body;
    const response = await authedAgent(app).get('/tasks/metadata');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    const taskMetadata = response.body.find(
      (m: TaskMetadata) => m.id === taskId,
    );
    expect(taskMetadata).toBeDefined();
  });

  it('should return 404 for a non-existent task', async () => {
    const response = await authedAgent(app).get('/tasks/fake-task/metadata');
    expect(response.status).toBe(404);
  });

  it('should return agent metadata via GET /.well-known/agent-card.json', async () => {
    const response = await authedAgent(app).get('/.well-known/agent-card.json');
    const port = (server.address() as AddressInfo).port;
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Gemini SDLC Agent');
    expect(response.body.url).toBe(`http://localhost:${port}/`);
  });

  describe('GET /tasks/metadata with non-InMemoryTaskStore', () => {
    let nonInMemoryApp: express.Express;
    let nonInMemoryServer: Server;
    let nonInMemoryWorkspace: string;
    let originalCwd: string;

    beforeEach(async () => {
      originalCwd = process.cwd();
      nonInMemoryWorkspace = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-agent-gcs-test-'),
      );
      vi.stubEnv('CODER_AGENT_WORKSPACE_PATH', nonInMemoryWorkspace);
      vi.stubEnv('GCS_BUCKET_NAME', 'test-bucket');
      nonInMemoryApp = await createApp();
      await new Promise<void>((resolve) => {
        nonInMemoryServer = nonInMemoryApp.listen(0, () => {
          resolve();
        });
      });
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      if (nonInMemoryServer) {
        await new Promise<void>((resolve, reject) => {
          nonInMemoryServer.close((err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      }
      if (originalCwd) {
        process.chdir(originalCwd);
      }
      if (nonInMemoryWorkspace) {
        try {
          fs.rmSync(nonInMemoryWorkspace, { recursive: true, force: true });
        } catch (e) {
          debugLogger.warn(
            `Could not remove temp dir '${nonInMemoryWorkspace}':`,
            e,
          );
        }
      }
    });

    it('should return 501 and not fall through to send a second response', async () => {
      vi.mocked(logger.error).mockClear();
      const response = await authedAgent(nonInMemoryApp).get('/tasks/metadata');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({
        error:
          'Listing all task metadata is only supported when using InMemoryTaskStore.',
      });
      // Without return, the handler falls through and triggers ERR_HTTP_HEADERS_SENT
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('authentication', () => {
    beforeEach(() => {
      vi.mocked(Task.create).mockClear();
    });

    it.each([
      ['post', '/'],
      ['post', '/tasks'],
      ['post', '/executeCommand'],
      ['get', '/listCommands'],
      ['get', '/tasks/metadata'],
      ['get', '/tasks/some-task/metadata'],
      ['get', '/.well-known/agent-card.json'],
      ['get', '/no-such-route'],
    ] as const)(
      'should reject %s %s without an Authorization header',
      async (method, route) => {
        const response = await request(server)[method](route);
        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(response.body).toEqual({ error: 'Unauthorized' });
      },
    );

    it.each([
      ['a different bearer token', `Bearer ${randomUUID()}`],
      ['the bearer token "valid-token"', 'Bearer valid-token'],
      [
        'basic credentials',
        `Basic ${Buffer.from('admin:password').toString('base64')}`,
      ],
      ['unencoded basic credentials', 'Basic admin:password'],
      ['the token under the Basic scheme', `Basic ${TEST_AUTH_TOKEN}`],
      ['the token without a scheme', TEST_AUTH_TOKEN],
    ])('should reject %s', async (_description, authorization) => {
      const response = await request(server)
        .get('/listCommands')
        .set('Authorization', authorization);
      expect(response.status).toBe(401);
    });

    it('should not start a task for an unauthenticated JSON-RPC request', async () => {
      const response = await request(server)
        .post('/')
        .send({
          jsonrpc: '2.0',
          id: '1',
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              role: 'user',
              parts: [{ kind: 'text', text: 'hello' }],
              messageId: 'unauthenticated-message',
            },
            metadata: {
              coderAgent: {
                kind: 'agent-settings',
                workspacePath: testWorkspace,
              },
            },
          },
        });
      expect(response.status).toBe(401);
      expect(Task.create).not.toHaveBeenCalled();
    });

    it('should not create a task for an unauthenticated POST /tasks', async () => {
      const response = await request(server)
        .post('/tasks')
        .send({
          agentSettings: {
            kind: 'agent-settings',
            workspacePath: testWorkspace,
          },
        });
      expect(response.status).toBe(401);
      expect(Task.create).not.toHaveBeenCalled();
    });

    it('should accept GEMINI_IPC_SECRET as a bearer token', async () => {
      const response = await request(server)
        .get('/listCommands')
        .set('Authorization', BEARER);
      expect(response.status).toBe(200);
    });

    it('should accept CODER_AGENT_AUTH_TOKEN when GEMINI_IPC_SECRET is not set', async () => {
      const coderAgentToken = randomUUID();
      vi.stubEnv('GEMINI_IPC_SECRET', '');
      vi.stubEnv('CODER_AGENT_AUTH_TOKEN', coderAgentToken);

      await withNewServer(async (newServer) => {
        const accepted = await request(newServer)
          .get('/listCommands')
          .set('Authorization', `Bearer ${coderAgentToken}`);
        expect(accepted.status).toBe(200);

        const rejected = await request(newServer).get('/listCommands');
        expect(rejected.status).toBe(401);
      });
    });

    it('should only accept GEMINI_IPC_SECRET when both variables are set', async () => {
      const coderAgentToken = randomUUID();
      vi.stubEnv('CODER_AGENT_AUTH_TOKEN', coderAgentToken);

      await withNewServer(async (newServer) => {
        const accepted = await request(newServer)
          .get('/listCommands')
          .set('Authorization', BEARER);
        expect(accepted.status).toBe(200);

        const rejected = await request(newServer)
          .get('/listCommands')
          .set('Authorization', `Bearer ${coderAgentToken}`);
        expect(rejected.status).toBe(401);
      });
    });

    it('should reject every request when no secret is configured', async () => {
      vi.stubEnv('GEMINI_IPC_SECRET', '');
      vi.stubEnv('CODER_AGENT_AUTH_TOKEN', '');
      vi.mocked(logger.error).mockClear();

      await withNewServer(async (newServer) => {
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('GEMINI_IPC_SECRET'),
        );

        for (const authorization of [
          undefined,
          BEARER,
          'Bearer ',
          'Bearer undefined',
          'Bearer valid-token',
        ]) {
          const pending = request(newServer).post('/tasks');
          if (authorization !== undefined) {
            pending.set('Authorization', authorization);
          }
          const response = await pending;
          expect(response.status).toBe(500);
          expect(response.body).toEqual({
            error: 'Server authentication is not configured.',
          });
        }
        expect(Task.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('Host and Origin header validation', () => {
    beforeEach(() => {
      vi.mocked(Task.create).mockClear();
    });

    it.each([
      'external.example.com',
      'external.example.com:41242',
      'localhost.example.com',
    ])('should reject Host: %s', async (host) => {
      const response = await request(server)
        .get('/listCommands')
        .set('Host', host)
        .set('Authorization', BEARER);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Invalid Host header' });
    });

    it.each([
      'http://external.example.com',
      'https://external.example.com:8443',
      'null',
      'vscode-webview://0123abcd',
    ])('should reject Origin: %s', async (origin) => {
      const response = await request(server)
        .get('/listCommands')
        .set('Origin', origin)
        .set('Authorization', BEARER);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Origin not allowed' });
    });

    it.each(['localhost:1234', '127.0.0.1:1234', '[::1]:1234'])(
      'should accept Host: %s',
      async (host) => {
        const response = await request(server)
          .get('/listCommands')
          .set('Host', host)
          .set('Authorization', BEARER);
        expect(response.status).toBe(200);
      },
    );

    it.each(['http://localhost:1234', 'http://127.0.0.1:1234'])(
      'should accept Origin: %s',
      async (origin) => {
        const response = await request(server)
          .get('/listCommands')
          .set('Origin', origin)
          .set('Authorization', BEARER);
        expect(response.status).toBe(200);
      },
    );

    it('should still require authentication from a loopback origin', async () => {
      const response = await request(server)
        .get('/listCommands')
        .set('Origin', 'http://localhost:1234');
      expect(response.status).toBe(401);
    });

    it('should not create a task for a request with a non-loopback Origin', async () => {
      const response = await request(server)
        .post('/tasks')
        .set('Origin', 'http://external.example.com')
        .set('Authorization', BEARER)
        .send({
          agentSettings: {
            kind: 'agent-settings',
            workspacePath: testWorkspace,
          },
        });
      expect(response.status).toBe(403);
      expect(Task.create).not.toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    const LIMIT = 100;

    // Sends the requests one after the other and returns the distinct status
    // codes of the responses.
    const sendMany = async (
      target: Server,
      count: number,
      headers: Record<string, string> = {},
    ) => {
      const statuses = new Set<number>();
      for (let i = 0; i < count; i++) {
        const response = await request(target)
          .get('/listCommands')
          .set(headers);
        statuses.add(response.status);
      }
      return [...statuses];
    };

    it('should answer 429 after 100 requests without the token and still accept the token', async () => {
      await withNewServer(async (newServer) => {
        expect(await sendMany(newServer, LIMIT)).toEqual([401]);

        const limited = await request(newServer).get('/listCommands');
        expect(limited.status).toBe(429);
        expect(limited.body).toEqual({ error: 'Too many requests' });

        const authenticated = await request(newServer)
          .get('/listCommands')
          .set('Authorization', BEARER);
        expect(authenticated.status).toBe(200);
      });
    });

    it('should not count requests that fail Host header validation', async () => {
      await withNewServer(async (newServer) => {
        expect(
          await sendMany(newServer, LIMIT, { Host: 'external.example.com' }),
        ).toEqual([403]);

        const response = await request(newServer).get('/listCommands');
        expect(response.status).toBe(401);
      });
    });
  });

  describe('POST /tasks workspace trust', () => {
    const WORKSPACE_MCP_SERVER = 'workspace-server';
    const WORKSPACE_ENV_VAR = 'A2A_TEST_WORKSPACE_ENV_VAR';
    let workspace: string;
    let checkPathTrustSpy: MockInstance<typeof core.checkPathTrust>;

    // Creates the task and reports how its configuration was loaded.
    const createTaskIn = async (agentSettings: Record<string, unknown>) => {
      let envVarSeenByTask: string | undefined;
      vi.mocked(loadConfig).mockImplementationOnce(async () => {
        envVarSeenByTask = process.env[WORKSPACE_ENV_VAR];
        return createMockConfig({}) as Config;
      });

      const response = await request(server)
        .post('/tasks')
        .set('Authorization', BEARER)
        .send({ agentSettings });

      expect(response.status).toBe(201);
      expect(loadConfig).toHaveBeenCalledTimes(1);
      const [settings, , taskId, trusted, workspaceDir] =
        vi.mocked(loadConfig).mock.calls[0];
      expect(taskId).toBe(response.body);
      expect(workspaceDir).toBe(core.resolveToRealPath(workspace));
      return { settings, trusted, envVarSeenByTask, taskId };
    };

    beforeEach(() => {
      // A workspace with its own settings and .env file.
      workspace = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-agent-workspace-'),
      );
      const geminiDir = path.join(workspace, '.gemini');
      fs.mkdirSync(geminiDir);
      fs.writeFileSync(
        path.join(geminiDir, 'settings.json'),
        JSON.stringify({
          mcpServers: {
            [WORKSPACE_MCP_SERVER]: { command: 'node', args: ['--version'] },
          },
        }),
      );
      fs.writeFileSync(
        path.join(geminiDir, '.env'),
        `${WORKSPACE_ENV_VAR}=loaded\n`,
      );

      vi.stubEnv('GEMINI_CLI_TRUST_WORKSPACE', '');
      vi.stubEnv('GEMINI_FOLDER_TRUST', '');
      checkPathTrustSpy = vi.spyOn(core, 'checkPathTrust');
      vi.mocked(loadConfig).mockClear();
      vi.mocked(Task.create).mockClear();
    });

    afterEach(() => {
      checkPathTrustSpy.mockRestore();
      fs.rmSync(workspace, { recursive: true, force: true });
    });

    it('should ignore a client-supplied isTrusted for a workspace the server does not trust', async () => {
      // The server-side evaluation has no trust entry for this folder.
      checkPathTrustSpy.mockReturnValue({
        isTrusted: undefined,
        source: undefined,
      });

      const { settings, trusted, envVarSeenByTask, taskId } =
        await createTaskIn({
          kind: 'agent-settings',
          workspacePath: workspace,
          isTrusted: true,
          autoExecute: true,
        });

      expect(trusted).toBe(false);
      expect(settings.mcpServers?.[WORKSPACE_MCP_SERVER]).toBeUndefined();
      expect(envVarSeenByTask).toBeUndefined();
      // autoExecute is still taken from the request.
      expect(Task.create).toHaveBeenCalledWith(
        taskId,
        expect.any(String),
        expect.anything(),
        undefined,
        true,
      );
    });

    it('should ignore isTrusted when agentSettings has no kind', async () => {
      checkPathTrustSpy.mockReturnValue({
        isTrusted: undefined,
        source: undefined,
      });

      const { settings, trusted, envVarSeenByTask } = await createTaskIn({
        workspacePath: workspace,
        isTrusted: true,
        autoExecute: true,
      });

      expect(trusted).toBe(false);
      expect(settings.mcpServers?.[WORKSPACE_MCP_SERVER]).toBeUndefined();
      expect(envVarSeenByTask).toBeUndefined();
    });

    it('should not let isTrusted override GEMINI_CLI_TRUST_WORKSPACE=false', async () => {
      vi.stubEnv('GEMINI_CLI_TRUST_WORKSPACE', 'false');

      const { settings, trusted, envVarSeenByTask } = await createTaskIn({
        kind: 'agent-settings',
        workspacePath: workspace,
        isTrusted: true,
      });

      expect(trusted).toBe(false);
      expect(settings.mcpServers?.[WORKSPACE_MCP_SERVER]).toBeUndefined();
      expect(envVarSeenByTask).toBeUndefined();
    });

    it('should load the workspace configuration when the server trusts the folder', async () => {
      checkPathTrustSpy.mockReturnValue({ isTrusted: true, source: 'file' });

      const { settings, trusted, envVarSeenByTask } = await createTaskIn({
        kind: 'agent-settings',
        workspacePath: workspace,
      });

      expect(trusted).toBe(true);
      expect(settings.mcpServers?.[WORKSPACE_MCP_SERVER]).toBeDefined();
      expect(envVarSeenByTask).toBe('loaded');
    });
  });

  describe('POST /tasks workspacePath validation', () => {
    const postTask = (workspacePath: unknown) =>
      request(server)
        .post('/tasks')
        .set('Authorization', BEARER)
        .send({ agentSettings: { kind: 'agent-settings', workspacePath } });

    beforeEach(() => {
      vi.mocked(Task.create).mockClear();
    });

    it('should reject a workspacePath that is not a directory', async () => {
      const file = path.join(testWorkspace, 'not-a-directory.txt');
      fs.writeFileSync(file, '');

      const response = await postTask(file);

      expect(response.status).toBe(500);
      expect(response.body.error).toMatch(/is not a directory/);
      expect(Task.create).not.toHaveBeenCalled();
    });

    it('should reject a workspacePath outside the allowed root', async () => {
      const allowedRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-agent-allowed-root-'),
      );
      vi.stubEnv('CODER_AGENT_ALLOWED_ROOT', allowedRoot);

      try {
        const response = await postTask(testWorkspace);

        expect(response.status).toBe(500);
        expect(response.body.error).toMatch(
          /outside the allowed root directory/,
        );
        expect(Task.create).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(allowedRoot, { recursive: true, force: true });
      }
    });

    it.each([
      ['is not a string', 42, /expected a string/],
      ['contains a null byte', '/tmp/workspace\0', /Invalid path/],
    ])('should reject a workspacePath that %s', async (_, value, error) => {
      const response = await postTask(value);

      expect(response.status).toBe(500);
      expect(response.body.error).toMatch(error);
      expect(Task.create).not.toHaveBeenCalled();
    });
  });
});
