/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createApp, updateCoderAgentCardUrl } from './app.js';
import type { TaskMetadata } from '../types.js';
import { createMockConfig } from '../utils/testing_utils.js';
import { debugLogger, type Config } from '@google/gemini-cli-core';

// Mock the logger to avoid polluting test output
// Comment out to help debug
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock @google-cloud/storage so GCSTaskStore can be instantiated without
// a real GCS connection. This is only exercised when GCS_BUCKET_NAME is set.
vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({
    getBuckets: vi
      .fn()
      .mockResolvedValue([[{ name: 'test-bucket-for-metadata' }]]),
  })),
}));

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
    request(app)
      .post('/tasks')
      .send({
        contextId,
        agentSettings: {
          kind: 'agent-settings',
          workspacePath: testWorkspace,
        },
      })
      .set('Content-Type', 'application/json');

  beforeAll(async () => {
    // Create a unique temporary directory for the workspace to avoid conflicts
    testWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-agent-test-'),
    );
    app = await createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        updateCoderAgentCardUrl(port);
        resolve();
      });
    });
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

  it('should get metadata for a specific task via GET /tasks/:taskId/metadata', async () => {
    const createResponse = await createTask('test-context-2');
    const taskId = createResponse.body;
    const response = await request(app).get(`/tasks/${taskId}/metadata`);
    expect(response.status).toBe(200);
    expect(response.body.metadata.id).toBe(taskId);
  }, 6000);

  it('should get metadata for all tasks via GET /tasks/metadata', async () => {
    const createResponse = await createTask('test-context-3');
    const taskId = createResponse.body;
    const response = await request(app).get('/tasks/metadata');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    const taskMetadata = response.body.find(
      (m: TaskMetadata) => m.id === taskId,
    );
    expect(taskMetadata).toBeDefined();
  });

  it('should return 404 for a non-existent task', async () => {
    const response = await request(app).get('/tasks/fake-task/metadata');
    expect(response.status).toBe(404);
  });

  it('should return agent metadata via GET /.well-known/agent-card.json', async () => {
    const response = await request(app).get('/.well-known/agent-card.json');
    const port = (server.address() as AddressInfo).port;
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Gemini SDLC Agent');
    expect(response.body.url).toBe(`http://localhost:${port}/`);
  });
});

describe('Agent Server Endpoints (GCS Task Store)', () => {
  let gcsApp: express.Express;
  let gcsServer: Server;

  beforeAll(async () => {
    vi.stubEnv('GCS_BUCKET_NAME', 'test-bucket-for-metadata');
    gcsApp = await createApp();
    await new Promise<void>((resolve) => {
      gcsServer = gcsApp.listen(0, () => resolve());
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (gcsServer) {
      await new Promise<void>((resolve, reject) => {
        gcsServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('should return 501 for GET /tasks/metadata when not using InMemoryTaskStore', async () => {
    const response = await request(gcsApp).get('/tasks/metadata');
    expect(response.status).toBe(501);
    expect(response.body.error).toContain('InMemoryTaskStore');
  });
});
