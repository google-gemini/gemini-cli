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
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import type { Content } from '@google/genai';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import {
  checkMemoryConsolidation,
  type MemoryCheckResponse,
} from './memoryChecker.js';
import { GeminiChat } from '../core/geminiChat.js';

// Mock fs module to prevent actual file system operations during tests
const mockFileSystem = new Map<string, string>();

vi.mock('node:fs', () => {
  const fsModule = {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((path: string, data: string) => {
      mockFileSystem.set(path, data);
    }),
    readFileSync: vi.fn((path: string) => {
      if (mockFileSystem.has(path)) {
        return mockFileSystem.get(path);
      }
      throw Object.assign(new Error('ENOENT: no such file or directory'), {
        code: 'ENOENT',
      });
    }),
    existsSync: vi.fn((path: string) => mockFileSystem.has(path)),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      on: vi.fn(),
    })),
  };

  return {
    default: fsModule,
    ...fsModule,
  };
});

// Mock GeminiClient and Config constructor
vi.mock('../core/baseLlmClient.js');
vi.mock('../config/config.js');

describe('checkMemoryConsolidation', () => {
  let chatInstance: GeminiChat;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  const abortSignal = new AbortController().signal;
  const promptId = 'test-prompt-id';

  beforeEach(() => {
    vi.resetAllMocks();
    const mockResolvedConfig = {
      model: 'memory-checker-v1',
      generateContentConfig: {},
    };
    mockConfig = {
      get config() {
        return this;
      },
      promptId: 'test-session-id',
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getModel: () => 'test-model',
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/temp'),
      },
      modelConfigService: {
        getResolvedConfig: vi.fn().mockReturnValue(mockResolvedConfig),
      },
    } as unknown as Config;

    mockBaseLlmClient = new BaseLlmClient(
      {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
        countTokens: vi.fn(),
        embedContent: vi.fn(),
      } as ContentGenerator,
      mockConfig,
    );

    chatInstance = new GeminiChat(
      mockConfig,
      '', // empty system instruction
      [], // no tools
      [], // initial history
    );

    vi.spyOn(chatInstance, 'getHistory');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if history is empty', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([]);
    const result = await checkMemoryConsolidation(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
    expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
  });

  it('should return null if the last speaker was the user', async () => {
    vi.mocked(chatInstance.getHistory).mockReturnValue([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ]);
    const result = await checkMemoryConsolidation(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
    expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
  });

  it('should return { should_consolidate: true } when conversation contains memorable info', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'user', parts: [{ text: 'I prefer using pnpm over npm.' }] },
      {
        role: 'model',
        parts: [{ text: "Got it, I'll use pnpm for package management." }],
      },
    ] as Content[]);
    const mockApiResponse: MemoryCheckResponse = {
      reasoning: 'User expressed a preference for pnpm.',
      should_consolidate: true,
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkMemoryConsolidation(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toEqual(mockApiResponse);
    expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(1);
  });

  it('should return { should_consolidate: false } for transient task context', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'user', parts: [{ text: 'Fix the bug in line 42.' }] },
      { role: 'model', parts: [{ text: 'Done, I fixed the null check.' }] },
    ] as Content[]);
    const mockApiResponse: MemoryCheckResponse = {
      reasoning: 'Only transient task details, nothing to persist.',
      should_consolidate: false,
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkMemoryConsolidation(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it('should return null if generateJson throws an error', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockBaseLlmClient.generateJson as Mock).mockRejectedValue(
      new Error('API Error'),
    );

    const result = await checkMemoryConsolidation(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('should return null if generateJson returns invalid JSON (missing should_consolidate)', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'This is incomplete.',
    } as unknown as MemoryCheckResponse);

    const result = await checkMemoryConsolidation(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
  });

  it('should return null if generateJson returns a non-boolean should_consolidate', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'Some reasoning.',
      should_consolidate: 'yes',
    } as unknown as MemoryCheckResponse);

    const result = await checkMemoryConsolidation(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
  });

  it('should call generateJson with the correct parameters', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    const mockApiResponse: MemoryCheckResponse = {
      reasoning: 'Nothing to persist.',
      should_consolidate: false,
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    await checkMemoryConsolidation(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );

    expect(mockBaseLlmClient.generateJson).toHaveBeenCalled();
    const generateJsonCall = (mockBaseLlmClient.generateJson as Mock).mock
      .calls[0][0];
    expect(generateJsonCall.modelConfigKey.model).toBe('memory-checker');
    expect(generateJsonCall.promptId).toBe(promptId);
  });
});
