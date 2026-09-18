/**
 * @license
 * Copyright 2025 Google LLC
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
  checkNextSpeaker,
  type NextSpeakerResponse,
} from './nextSpeakerChecker.js';
import {
  GeminiChat,
  INTERRUPTED_RESPONSE_PLACEHOLDER,
} from '../core/geminiChat.js';

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

describe('checkNextSpeaker', () => {
  let chatInstance: GeminiChat;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  const abortSignal = new AbortController().signal;
  const promptId = 'test-prompt-id';

  beforeEach(() => {
    vi.resetAllMocks();
    const mockResolvedConfig = {
      model: 'next-speaker-v1',
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

    // GeminiChat will receive the mocked instances via the mocked GoogleGenAI constructor
    chatInstance = new GeminiChat(
      mockConfig,
      '', // empty system instruction
      [], // no tools
      [], // initial history
    );

    // Spy on getHistory for chatInstance
    vi.spyOn(chatInstance, 'getHistory');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if history is empty', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([]);
    const result = await checkNextSpeaker(
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
    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
    expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
  });

  it("should return { next_speaker: 'model' } when model intends to continue", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'I will now do something.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model stated it will do something.',
      next_speaker: 'model',
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toEqual(mockApiResponse);
    expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(1);
  });

  it("should return { next_speaker: 'user' } when model asks a question", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'What would you like to do?' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model asked a question.',
      next_speaker: 'user',
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it("should return { next_speaker: 'user' } when model makes a statement", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'This is a statement.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'user',
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it('should return null if baseLlmClient.generateJson throws an error', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockBaseLlmClient.generateJson as Mock).mockRejectedValue(
      new Error('API Error'),
    );

    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('should return null if baseLlmClient.generateJson returns invalid JSON (missing next_speaker)', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'This is incomplete.',
    } as unknown as NextSpeakerResponse); // Type assertion to simulate invalid response

    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
  });

  it('should return null if baseLlmClient.generateJson returns a non-string next_speaker', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 123, // Invalid type
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toBeNull();
  });

  it('should return null if baseLlmClient.generateJson returns an invalid next_speaker string value', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue({
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'neither', // Invalid enum value
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
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
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'user',
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );

    expect(mockBaseLlmClient.generateJson).toHaveBeenCalled();
    const generateJsonCall = (mockBaseLlmClient.generateJson as Mock).mock
      .calls[0][0];
    expect(generateJsonCall.modelConfigKey.model).toBe('next-speaker-checker');
    expect(generateJsonCall.promptId).toBe(promptId);
  });

  it.each([
    ['raw placeholder', INTERRUPTED_RESPONSE_PLACEHOLDER],
    ['sanitized placeholder', 'Continuing.'],
  ])(
    "should return { next_speaker: 'model' } when last message is %s",
    async (_label, placeholderText) => {
      (chatInstance.getHistory as Mock).mockImplementation(
        (curated?: boolean) => {
          if (curated) {
            return [
              {
                role: 'model',
                parts: [{ text: placeholderText }],
              },
            ] as Content[];
          }
          return [
            {
              role: 'model',
              parts: [{ text: placeholderText }],
            },
          ] as Content[];
        },
      );
      const result = await checkNextSpeaker(
        chatInstance,
        mockBaseLlmClient,
        abortSignal,
        promptId,
      );
      expect(result).toEqual({
        reasoning:
          'The last model response was an interruption placeholder, so the model should speak next to provide a real response.',
        next_speaker: 'model',
      });
      // Should NOT make an LLM call - this is a short-circuit
      expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
    },
  );

  it('should not short-circuit for normal model responses containing the word interrupted', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      {
        role: 'model',
        parts: [{ text: 'The process was interrupted by the user.' }],
      },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model described an interruption event.',
      next_speaker: 'user',
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    expect(result).toEqual(mockApiResponse);
    expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(1);
  });

  it('should NOT short-circuit when multi-part response contains "Continuing." alongside a tool call', async () => {
    // This tests the critical bug fix: a model response like
    // [{ text: "Continuing." }, { functionCall: ... }] must NOT be
    // treated as an interruption placeholder.
    (chatInstance.getHistory as Mock).mockReturnValue([
      {
        role: 'model',
        parts: [
          { text: 'Continuing.' },
          { functionCall: { name: 'read_file', args: { path: '/tmp/x' } } },
        ],
      },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model is calling a tool.',
      next_speaker: 'model',
    };
    (mockBaseLlmClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockBaseLlmClient,
      abortSignal,
      promptId,
    );
    // Should proceed to LLM call, NOT short-circuit
    expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockApiResponse);
  });
});
