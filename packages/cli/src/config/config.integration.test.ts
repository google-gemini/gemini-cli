/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import type { ConfigParameters } from '@google/gemini-cli-core';
import {
  Config,
  DEFAULT_FILE_FILTERING_OPTIONS,
} from '@google/gemini-cli-core';
import { createTestMergedSettings } from './settings.js';
import { http, HttpResponse } from 'msw';

import { setupServer } from 'msw/node';

export const server = setupServer();

// TODO(richieforeman): Consider moving this to test setup globally.
beforeAll(() => {
  server.listen({});
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

const CLEARCUT_URL = 'https://play.googleapis.com/log';

// Mock file discovery service and tool registry
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    FileDiscoveryService: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(),
    })),
    createToolRegistry: vi.fn().mockResolvedValue({}),
  };
});

describe('Configuration Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    server.resetHandlers(http.post(CLEARCUT_URL, () => HttpResponse.text()));

    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'gemini-cli-test-'));
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('File Filtering and Configuration', () => {
    it.each([
      {
        description:
          'should load default file filtering settings when fileFiltering is missing',
        fileFiltering: undefined,
        expected: DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
      },
      {
        description:
          'should load custom file filtering settings from configuration',
        fileFiltering: { respectGitIgnore: false },
        expected: false,
      },
      {
        description:
          'should respect file filtering settings from configuration',
        fileFiltering: { respectGitIgnore: true },
        expected: true,
      },
      {
        description:
          'should handle empty fileFiltering object gracefully and use defaults',
        fileFiltering: {},
        expected: DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
      },
    ])('$description', async ({ fileFiltering, expected }) => {
      const configParams: ConfigParameters = {
        sessionId: 'test-session',
        cwd: '/tmp',
        model: 'test-model',
        embeddingModel: 'test-embedding-model',
        sandbox: undefined,
        targetDir: tempDir,
        debugMode: false,
        fileFiltering,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(expected);
    });
  });

  describe('Real-world Configuration Scenarios', () => {
    it.each([
      {
        description: 'should handle a security-focused configuration',
        respectGitIgnore: true,
      },
      {
        description: 'should handle a CI/CD environment configuration',
        respectGitIgnore: false,
      },
    ])('$description', async ({ respectGitIgnore }) => {
      const configParams: ConfigParameters = {
        sessionId: 'test-session',
        cwd: '/tmp',
        model: 'test-model',
        embeddingModel: 'test-embedding-model',
        sandbox: undefined,
        targetDir: tempDir,
        debugMode: false,
        fileFiltering: {
          respectGitIgnore,
        },
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(respectGitIgnore);
    });
  });

  describe('Checkpointing Configuration', () => {
    it('should enable checkpointing when the setting is true', async () => {
      const configParams: ConfigParameters = {
        sessionId: 'test-session',
        cwd: '/tmp',
        model: 'test-model',
        embeddingModel: 'test-embedding-model',
        sandbox: undefined,
        targetDir: tempDir,
        debugMode: false,
        checkpointing: true,
      };

      const config = new Config(configParams);

      expect(config.getCheckpointingEnabled()).toBe(true);
    });
  });

  describe('Approval Mode Integration Tests', () => {
    let parseArguments: typeof import('./config.js').parseArguments;

    beforeEach(async () => {
      // Import the argument parsing function for integration testing
      const { parseArguments: parseArgs } = await import('./config.js');
      parseArguments = parseArgs;
    });

    it.each([
      {
        description: 'should parse --approval-mode=auto_edit correctly',
        argv: [
          'node',
          'script.js',
          '--approval-mode',
          'auto_edit',
          '-p',
          'test',
        ],
        expected: { approvalMode: 'auto_edit', prompt: 'test', yolo: false },
      },
      {
        description: 'should parse --approval-mode=yolo correctly',
        argv: ['node', 'script.js', '--approval-mode', 'yolo', '-p', 'test'],
        expected: { approvalMode: 'yolo', prompt: 'test', yolo: false },
      },
      {
        description: 'should parse --approval-mode=default correctly',
        argv: ['node', 'script.js', '--approval-mode', 'default', '-p', 'test'],
        expected: { approvalMode: 'default', prompt: 'test', yolo: false },
      },
      {
        description: 'should parse legacy --yolo flag correctly',
        argv: ['node', 'script.js', '--yolo', '-p', 'test'],
        expected: { yolo: true, approvalMode: undefined, prompt: 'test' },
      },
      {
        description: 'should handle no approval mode arguments',
        argv: ['node', 'script.js', '-p', 'test'],
        expected: { approvalMode: undefined, yolo: false, prompt: 'test' },
      },
    ])('$description', async ({ argv, expected }) => {
      const originalArgv = process.argv;
      try {
        process.argv = argv;
        const parsedArgs = await parseArguments(createTestMergedSettings());
        expect(parsedArgs.approvalMode).toBe(expected.approvalMode);
        expect(parsedArgs.prompt).toBe(expected.prompt);
        expect(parsedArgs.yolo).toBe(expected.yolo);
      } finally {
        process.argv = originalArgv;
      }
    });

    it.each([
      {
        description: 'should reject invalid approval mode values',
        argv: ['node', 'script.js', '--approval-mode', 'invalid_mode'],
      },
      {
        description:
          'should reject conflicting --yolo and --approval-mode flags',
        argv: ['node', 'script.js', '--yolo', '--approval-mode', 'default'],
      },
    ])('$description', async ({ argv }) => {
      const originalArgv = process.argv;
      try {
        process.argv = argv;
        await expect(
          parseArguments(createTestMergedSettings()),
        ).rejects.toThrow();
      } finally {
        process.argv = originalArgv;
      }
    });
  });
});
