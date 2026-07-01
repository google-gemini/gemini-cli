/**
 * @license
 * Copyright 2026 Google LLC
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
} from 'vitest';
import request from 'supertest';
import type express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Server } from 'node:http';
import { createMockConfig } from '../utils/testing_utils.js';
import type { Config } from '@google/gemini-cli-core';

// Stub GCS_BUCKET_NAME in beforeEach to switch to GCSTaskStore
beforeEach(() => {
  vi.stubEnv('GCS_BUCKET_NAME', 'test-bucket');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Mock Storage before importing app to avoid real GCP calls
vi.mock('@google-cloud/storage', () => {
  const mockStorage = {
    getBuckets: vi.fn().mockResolvedValue([[{ name: 'test-bucket' }]]),
    createBucket: vi.fn().mockResolvedValue([]),
  };
  return {
    Storage: vi.fn().mockImplementation(() => mockStorage),
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

// Mock the logger to avoid polluting test output
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createApp } from './app.js';

describe('Agent Server Endpoints with GCSTaskStore', () => {
  let app: express.Express;
  let server: Server;
  let testWorkspace: string;

  beforeAll(async () => {
    testWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-agent-test-gcs-'),
    );
    app = await createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
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
      } catch {
        // ignore
      }
    }
  });

  it('should return 501 and not crash when calling GET /tasks/metadata', async () => {
    const response = await request(app).get('/tasks/metadata');
    expect(response.status).toBe(501);
    expect(response.body.error).toBe(
      'Listing all task metadata is only supported when using InMemoryTaskStore.',
    );
  });
});
