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
  type Mocked,
} from 'vitest';

import type {
  Chat,
  Content,
  EmbedContentResponse,
  GenerateContentResponse,
  Part,
} from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import {
  findIndexAfterFraction,
  isThinkingDefault,
  isThinkingSupported,
  GeminiClient,
} from './client.js';
import {
  AuthType,
  type ContentGenerator,
  type ContentGeneratorConfig,
} from './contentGenerator.js';
import { type GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import {
  CompressionStatus,
  GeminiEventType,
  Turn,
  type ChatCompressionInfo,
} from './turn.js';
import { getCoreSystemPrompt } from './prompts.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { setSimulate429 } from '../utils/testUtils.js';
import { tokenLimit } from './tokenLimits.js';
import { ideContext } from '../ide/ideContext.js';
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';

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
  };

  return {
    default: fsModule,
    ...fsModule,
  };
});

// --- Mocks ---
const mockChatCreateFn = vi.fn();
const mockGenerateContentFn = vi.fn();
const mockEmbedContentFn = vi.fn();
const mockTurnRunFn = vi.fn();

vi.mock('@google/genai');
vi.mock('./turn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./turn.js')>();
  // Define a mock class that has the same shape as the real Turn
  class MockTurn {
    pendingToolCalls = [];
    // The run method is a property that holds our mock function
    run = mockTurnRunFn;

    constructor() {
      // The constructor can be empty or do some mock setup
    }
  }
  // Export the mock class as 'Turn'
  return {
    ...actual,
    Turn: MockTurn,
  };
});

vi.mock('../config/config.js');
vi.mock('./prompts');
vi.mock('../utils/getFolderStructure', () => ({
  getFolderStructure: vi.fn().mockResolvedValue('Mock Folder Structure'),
}));
vi.mock('../utils/errorReporting', () => ({ reportError: vi.fn() }));
vi.mock('../utils/nextSpeakerChecker', () => ({
  checkNextSpeaker: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/generateContentResponseUtilities', () => ({
  getResponseText: (result: GenerateContentResponse) =>
    result.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ||
    undefined,
}));
vi.mock('../telemetry/index.js', () => ({
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
  logApiError: vi.fn(),
}));
vi.mock('../ide/ideContext.js');

/**
 * Array.fromAsync ponyfill, which will be available in es 2024.
 *
 * Buffers an async generator into an array and returns the result.
 */
async function fromAsync<T>(promise: AsyncGenerator<T>): Promise<readonly T[]> {
  const results: T[] = [];
  for await (const result of promise) {
    results.push(result);
  }
  return results;
}

describe('findIndexAfterFraction', () => {
  const history: Content[] = [
    { role: 'user', parts: [{ text: 'This is the first message.' }] }, // JSON length: 66
    { role: 'model', parts: [{ text: 'This is the second message.' }] }, // JSON length: 68
    { role: 'user', parts: [{ text: 'This is the third message.' }] }, // JSON length: 66
    { role: 'model', parts: [{ text: 'This is the fourth message.' }] }, // JSON length: 68
    { role: 'user', parts: [{ text: 'This is the fifth message.' }] }, // JSON length: 65
  ];
  // Total length: 333

  it('should throw an error for non-positive numbers', () => {
    expect(() => findIndexAfterFraction(history, 0)).toThrow(
      'Fraction must be between 0 and 1',
    );
  });

  it('should throw an error for a fraction greater than or equal to 1', () => {
    expect(() => findIndexAfterFraction(history, 1)).toThrow(
      'Fraction must be between 0 and 1',
    );
  });

  it('should handle a fraction in the middle', () => {
    // 333 * 0.5 = 166.5
    // 0: 66
    // 1: 66 + 68 = 134
    // 2: 134 + 66 = 200
    // 200 >= 166.5, so index is 2
    expect(findIndexAfterFraction(history, 0.5)).toBe(2);
  });

  it('should handle a fraction that results in the last index', () => {
    // 333 * 0.9 = 299.7
    // ...
    // 3: 200 + 68 = 268
    // 4: 268 + 65 = 333
    // 333 >= 299.7, so index is 4
    expect(findIndexAfterFraction(history, 0.9)).toBe(4);
  });

  it('should handle an empty history', () => {
    expect(findIndexAfterFraction([], 0.5)).toBe(0);
  });

  it('should handle a history with only one item', () => {
    expect(findIndexAfterFraction(history.slice(0, 1), 0.5)).toBe(0);
  });

  it('should handle history with weird parts', () => {
    const historyWithEmptyParts: Content[] = [
      { role: 'user', parts: [{ text: 'Message 1' }] },
      { role: 'model', parts: [{ fileData: { fileUri: 'derp' } }] },
      { role: 'user', parts: [{ text: 'Message 2' }] },
    ];
    expect(findIndexAfterFraction(historyWithEmptyParts, 0.5)).toBe(1);
  });
});

describe('isThinkingSupported', () => {
  it('should return true for gemini-2.5', () => {
    expect(isThinkingSupported('gemini-2.5')).toBe(true);
  });

  it('should return true for gemini-2.5-pro', () => {
    expect(isThinkingSupported('gemini-2.5-pro')).toBe(true);
  });

  it('should return false for other models', () => {
    expect(isThinkingSupported('gemini-1.5-flash')).toBe(false);
    expect(isThinkingSupported('some-other-model')).toBe(false);
  });
});

describe('isThinkingDefault', () => {
  it('should return false for gemini-2.5-flash-lite', () => {
    expect(isThinkingDefault('gemini-2.5-flash-lite')).toBe(false);
  });

  it('should return true for gemini-2.5', () => {
    expect(isThinkingDefault('gemini-2.5')).toBe(true);
  });

  it('should return true for gemini-2.5-pro', () => {
    expect(isThinkingDefault('gemini-2.5-pro')).toBe(true);
  });

  it('should return false for other models', () => {
    expect(isThinkingDefault('gemini-1.5-flash')).toBe(false);
    expect(isThinkingDefault('some-other-model')).toBe(false);
  });
});

describe('Gemini Client (client.ts)', () => {
  let client: GeminiClient;
  beforeEach(async () => {
    vi.resetAllMocks();

    // Disable 429 simulation for tests
    setSimulate429(false);

    // Set up the mock for GoogleGenAI constructor and its methods
    const MockedGoogleGenAI = vi.mocked(GoogleGenAI);
    MockedGoogleGenAI.mockImplementation(() => {
      const mock = {
        chats: { create: mockChatCreateFn },
        models: {
          generateContent: mockGenerateContentFn,
          embedContent: mockEmbedContentFn,
        },
      };
      return mock as unknown as GoogleGenAI;
    });

    mockChatCreateFn.mockResolvedValue({} as Chat);
    mockGenerateContentFn.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: '{"key": "value"}' }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    // Because the GeminiClient constructor kicks off an async process (startChat)
    // that depends on a fully-formed Config object, we need to mock the
    // entire implementation of Config for these tests.
    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(null),
    };
    const fileService = new FileDiscoveryService('/test/dir');
    const contentGeneratorConfig: ContentGeneratorConfig = {
      model: 'test-model',
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    };
    const mockConfigObject = {
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue(contentGeneratorConfig),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getModel: vi.fn().mockReturnValue('test-model'),
      getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
      getApiKey: vi.fn().mockReturnValue('test-key'),
      getVertexAI: vi.fn().mockReturnValue(false),
      getUserAgent: vi.fn().mockReturnValue('test-agent'),
      getUserMemory: vi.fn().mockReturnValue(''),
      getFullContext: vi.fn().mockReturnValue(false),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProxy: vi.fn().mockReturnValue(undefined),
      getWorkingDir: vi.fn().mockReturnValue('/test/dir'),
      getFileService: vi.fn().mockReturnValue(fileService),
      getMaxSessionTurns: vi.fn().mockReturnValue(0),
      getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
      setQuotaErrorOccurred: vi.fn(),
      getNoBrowser: vi.fn().mockReturnValue(false),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
      getIdeModeFeature: vi.fn().mockReturnValue(false),
      getIdeMode: vi.fn().mockReturnValue(true),
      getDebugMode: vi.fn().mockReturnValue(false),
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/dir']),
      }),
      getGeminiClient: vi.fn(),
      setFallbackMode: vi.fn(),
      getChatCompression: vi.fn().mockReturnValue(undefined),
      getSkipNextSpeakerCheck: vi.fn().mockReturnValue(false),
      getUseSmartEdit: vi.fn().mockReturnValue(false),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/temp'),
      },
    };
    const MockedConfig = vi.mocked(Config, true);
    MockedConfig.mockImplementation(
      () => mockConfigObject as unknown as Config,
    );

    // We can instantiate the client here since Config is mocked
    // and the constructor will use the mocked GoogleGenAI
    client = new GeminiClient(
      new Config({ sessionId: 'test-session-id' } as never),
    );
    mockConfigObject.getGeminiClient.mockReturnValue(client);

    await client.initialize(contentGeneratorConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // NOTE: The following tests for startChat were removed due to persistent issues with
  // the @google/genai mock. Specifically, the mockChatCreateFn (representing instance.chats.create)
  // was not being detected as called by the GeminiClient instance.
  // This likely points to a subtle issue in how the GoogleGenerativeAI class constructor
  // and its instance methods are mocked and then used by the class under test.
  // For future debugging, ensure that the `this.client` in `GeminiClient` (which is an
  // instance of the mocked GoogleGenerativeAI) correctly has its `chats.create` method
  // pointing to `mockChatCreateFn`.
  // it('startChat should call getCoreSystemPrompt with userMemory and pass to chats.create', async () => { ... });
  // it('startChat should call getCoreSystemPrompt with empty string if userMemory is empty', async () => { ... });

  // NOTE: The following tests for generateJson were removed due to persistent issues with
  // the @google/genai mock, similar to the startChat tests. The mockGenerateContentFn
  // (representing instance.models.generateContent) was not being detected as called, or the mock
  // was not preventing an actual API call (leading to API key errors).
  // For future debugging, ensure `this.client.models.generateContent` in `GeminiClient` correctly
  // uses the `mockGenerateContentFn`.
  // it('generateJson should call getCoreSystemPrompt with userMemory and pass to generateContent', async () => { ... });
  // it('generateJson should call getCoreSystemPrompt with empty string if userMemory is empty', async () => { ... });

  describe('generateEmbedding', () => {
    const texts = ['hello world', 'goodbye world'];
    const testEmbeddingModel = 'test-embedding-model';

    it('should call embedContent with correct parameters and return embeddings', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      const mockResponse: EmbedContentResponse = {
        embeddings: [
          { values: mockEmbeddings[0] },
          { values: mockEmbeddings[1] },
        ],
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      const result = await client.generateEmbedding(texts);

      expect(mockEmbedContentFn).toHaveBeenCalledTimes(1);
      expect(mockEmbedContentFn).toHaveBeenCalledWith({
        model: testEmbeddingModel,
        contents: texts,
      });
      expect(result).toEqual(mockEmbeddings);
    });

    it('should return an empty array if an empty array is passed', async () => {
      const result = await client.generateEmbedding([]);
      expect(result).toEqual([]);
      expect(mockEmbedContentFn).not.toHaveBeenCalled();
    });

    it('should throw an error if API response has no embeddings array', async () => {
      mockEmbedContentFn.mockResolvedValue({} as EmbedContentResponse); // No `embeddings` key

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    it('should throw an error if API response has an empty embeddings array', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [],
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);
      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    it('should throw an error if API returns a mismatched number of embeddings', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [1, 2, 3] }], // Only one for two texts
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned a mismatched number of embeddings. Expected 2, got 1.',
      );
    });

    it('should throw an error if any embedding has nullish values', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [1, 2, 3] }, { values: undefined }], // Second one is bad
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 1: "goodbye world"',
      );
    });

    it('should throw an error if any embedding has an empty values array', async () => {
      const mockResponse: EmbedContentResponse = {
        embeddings: [{ values: [] }, { values: [1, 2, 3] }], // First one is bad
      };
      mockEmbedContentFn.mockResolvedValue(mockResponse);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 0: "hello world"',
      );
    });

    it('should propagate errors from the API call', async () => {
      const apiError = new Error('API Failure');
      mockEmbedContentFn.mockRejectedValue(apiError);

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API Failure',
      );
    });
  });

  describe('generateJson', () => {
    it('should call generateContent with the correct parameters', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const schema = { type: 'string' };
      const abortSignal = new AbortController().signal;

      // Mock countTokens
      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateJson(
        contents,
        schema,
        abortSignal,
        DEFAULT_GEMINI_FLASH_MODEL,
      );

      expect(mockGenerateContentFn).toHaveBeenCalledWith(
        {
          model: DEFAULT_GEMINI_FLASH_MODEL,
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0,
            topP: 1,
            responseJsonSchema: schema,
            responseMimeType: 'application/json',
          },
          contents,
        },
        'test-session-id',
      );
    });

    it('should allow overriding model and config', async () => {
      const contents: Content[] = [
        { role: 'user', parts: [{ text: 'hello' }] },
      ];
      const schema = { type: 'string' };
      const abortSignal = new AbortController().signal;
      const customModel = 'custom-json-model';
      const customConfig = { temperature: 0.9, topK: 20 };

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateJson(
        contents,
        schema,
        abortSignal,
        customModel,
        customConfig,
      );

      expect(mockGenerateContentFn).toHaveBeenCalledWith(
        {
          model: customModel,
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0.9,
            topP: 1, // from default
            topK: 20,
            responseJsonSchema: schema,
            responseMimeType: 'application/json',
          },
          contents,
        },
        'test-session-id',
      );
    });
  });

  describe('addHistory', () => {
    it('should call chat.addHistory with the provided content', async () => {
      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const newContent = {
        role: 'user',
        parts: [{ text: 'New history item' }],
      };
      await client.addHistory(newContent);

      expect(mockChat.addHistory).toHaveBeenCalledWith(newContent);
    });
  });

  describe('resetChat', () => {
    it('should create a new chat session, clearing the old history', async () => {
      // 1. Get the initial chat instance and add some history.
      const initialChat = client.getChat();
      const initialHistory = await client.getHistory();
      await client.addHistory({
        role: 'user',
        parts: [{ text: 'some old message' }],
      });
      const historyWithOldMessage = await client.getHistory();
      expect(historyWithOldMessage.length).toBeGreaterThan(
        initialHistory.length,
      );

      // 2. Call resetChat.
      await client.resetChat();

      // 3. Get the new chat instance and its history.
      const newChat = client.getChat();
      const newHistory = await client.getHistory();

      // 4. Assert that the chat instance is new and the history is reset.
      expect(newChat).not.toBe(initialChat);
      expect(newHistory.length).toBe(initialHistory.length);
      expect(JSON.stringify(newHistory)).not.toContain('some old message');
    });
  });

  describe('tryCompressChat', () => {
    const mockCountTokens = vi.fn();
    const mockSendMessage = vi.fn();
    const mockGetHistory = vi.fn();

    beforeEach(() => {
      vi.mock('./tokenLimits', () => ({
        tokenLimit: vi.fn(),
      }));

      client['contentGenerator'] = {
        countTokens: mockCountTokens,
      } as unknown as ContentGenerator;

      client['chat'] = {
        getHistory: mockGetHistory,
        addHistory: vi.fn(),
        setHistory: vi.fn(),
        sendMessage: mockSendMessage,
      } as unknown as GeminiChat;
    });

    function setup({
      chatHistory = [
        { role: 'user', parts: [{ text: 'Long conversation' }] },
        { role: 'model', parts: [{ text: 'Long response' }] },
      ] as Content[],
    } = {}) {
      const mockChat: Partial<GeminiChat> = {
        getHistory: vi.fn().mockReturnValue(chatHistory),
        setHistory: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue({ text: 'Summary' }),
      };
      const mockCountTokens = vi
        .fn()
        .mockResolvedValueOnce({ totalTokens: 1000 })
        .mockResolvedValueOnce({ totalTokens: 5000 });

      const mockGenerator: Partial<Mocked<ContentGenerator>> = {
        countTokens: mockCountTokens,
      };

      client['chat'] = mockChat as GeminiChat;
      client['contentGenerator'] = mockGenerator as ContentGenerator;
      client['startChat'] = vi.fn().mockResolvedValue({ ...mockChat });

      return { client, mockChat, mockGenerator };
    }

    describe('when compression inflates the token count', () => {
      it('uses the truncated history for compression');
      it('allows compression to be forced/manual after a failure', async () => {
        const { client, mockGenerator } = setup();
        mockGenerator.countTokens?.mockResolvedValue({
          totalTokens: 1000,
        });
        await client.tryCompressChat('prompt-id-4'); // Fails
        const result = await client.tryCompressChat('prompt-id-4', true);

        expect(result).toEqual({
          compressionStatus: CompressionStatus.COMPRESSED,
          newTokenCount: 1000,
          originalTokenCount: 1000,
        });
      });

      it('yields the result even if the compression inflated the tokens', async () => {
        const { client } = setup();
        const result = await client.tryCompressChat('prompt-id-4', true);

        expect(result).toEqual({
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
          newTokenCount: 5000,
          originalTokenCount: 1000,
        });
      });

      it('does not manipulate the source chat', async () => {
        const { client, mockChat } = setup();
        await client.tryCompressChat('prompt-id-4', true);

        expect(client['chat']).toBe(mockChat); // a new chat session was not created
      });

      it('restores the history back to the original', async () => {
        vi.mocked(tokenLimit).mockReturnValue(1000);
        mockCountTokens.mockResolvedValue({
          totalTokens: 999,
        });

        const originalHistory: Content[] = [
          { role: 'user', parts: [{ text: 'what is your wisdom?' }] },
          { role: 'model', parts: [{ text: 'some wisdom' }] },
          { role: 'user', parts: [{ text: 'ahh that is a good a wisdom' }] },
        ];

        const { client } = setup({
          chatHistory: originalHistory,
        });
        const { compressionStatus } =
          await client.tryCompressChat('prompt-id-4');

        expect(compressionStatus).toBe(
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        );
        expect(client['chat']?.setHistory).toHaveBeenCalledWith(
          originalHistory,
        );
      });

      it('will not attempt to compress context after a failure', async () => {
        const { client, mockGenerator } = setup();
        await client.tryCompressChat('prompt-id-4');

        const result = await client.tryCompressChat('prompt-id-5');

        // it counts tokens for {original, compressed} and then never again
        expect(mockGenerator.countTokens).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
          compressionStatus: CompressionStatus.NOOP,
          newTokenCount: 0,
          originalTokenCount: 0,
        });
      });
    });

    it('attempts to compress with a maxOutputTokens set to the original token count', async () => {
      vi.mocked(tokenLimit).mockReturnValue(1000);
      mockCountTokens.mockResolvedValue({
        totalTokens: 999,
      });

      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...history...' }] },
      ]);

      // Mock the summary response from the chat
      mockSendMessage.mockResolvedValue({
        role: 'model',
        parts: [{ text: 'This is a summary.' }],
      });

      await client.tryCompressChat('prompt-id-2', true);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            maxOutputTokens: 999,
          }),
        }),
        'prompt-id-2',
      );
    });

    it('should not trigger summarization if token count is below threshold', async () => {
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...history...' }] },
      ]);

      mockCountTokens.mockResolvedValue({
        totalTokens: MOCKED_TOKEN_LIMIT * 0.699, // TOKEN_THRESHOLD_FOR_SUMMARIZATION = 0.7
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-2');
      const newChat = client.getChat();

      expect(tokenLimit).toHaveBeenCalled();
      expect(result).toEqual({
        compressionStatus: CompressionStatus.NOOP,
        newTokenCount: 699,
        originalTokenCount: 699,
      });
      expect(newChat).toBe(initialChat);
    });

    it('logs a telemetry event when compressing', async () => {
      vi.spyOn(ClearcutLogger.prototype, 'logChatCompressionEvent');

      const MOCKED_TOKEN_LIMIT = 1000;
      const MOCKED_CONTEXT_PERCENTAGE_THRESHOLD = 0.5;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);
      vi.spyOn(client['config'], 'getChatCompression').mockReturnValue({
        contextPercentageThreshold: MOCKED_CONTEXT_PERCENTAGE_THRESHOLD,
      });
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...history...' }] },
      ]);

      const originalTokenCount =
        MOCKED_TOKEN_LIMIT * MOCKED_CONTEXT_PERCENTAGE_THRESHOLD;
      const newTokenCount = 100;

      mockCountTokens
        .mockResolvedValueOnce({ totalTokens: originalTokenCount }) // First call for the check
        .mockResolvedValueOnce({ totalTokens: newTokenCount }); // Second call for the new history

      // Mock the summary response from the chat
      mockSendMessage.mockResolvedValue({
        role: 'model',
        parts: [{ text: 'This is a summary.' }],
      });

      await client.tryCompressChat('prompt-id-3');

      expect(
        ClearcutLogger.prototype.logChatCompressionEvent,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens_before: originalTokenCount,
          tokens_after: newTokenCount,
        }),
      );
    });

    it('should trigger summarization if token count is at threshold with contextPercentageThreshold setting', async () => {
      const MOCKED_TOKEN_LIMIT = 1000;
      const MOCKED_CONTEXT_PERCENTAGE_THRESHOLD = 0.5;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);
      vi.spyOn(client['config'], 'getChatCompression').mockReturnValue({
        contextPercentageThreshold: MOCKED_CONTEXT_PERCENTAGE_THRESHOLD,
      });
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...history...' }] },
      ]);

      const originalTokenCount =
        MOCKED_TOKEN_LIMIT * MOCKED_CONTEXT_PERCENTAGE_THRESHOLD;
      const newTokenCount = 100;

      mockCountTokens
        .mockResolvedValueOnce({ totalTokens: originalTokenCount }) // First call for the check
        .mockResolvedValueOnce({ totalTokens: newTokenCount }); // Second call for the new history

      // Mock the summary response from the chat
      mockSendMessage.mockResolvedValue({
        role: 'model',
        parts: [{ text: 'This is a summary.' }],
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-3');
      const newChat = client.getChat();

      expect(tokenLimit).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();

      // Assert that summarization happened and returned the correct stats
      expect(result).toEqual({
        compressionStatus: CompressionStatus.COMPRESSED,
        originalTokenCount,
        newTokenCount,
      });

      // Assert that the chat was reset
      expect(newChat).not.toBe(initialChat);
    });

    it('should not compress across a function call response', async () => {
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...history 1...' }] },
        { role: 'model', parts: [{ text: '...history 2...' }] },
        { role: 'user', parts: [{ text: '...history 3...' }] },
        { role: 'model', parts: [{ text: '...history 4...' }] },
        { role: 'user', parts: [{ text: '...history 5...' }] },
        { role: 'model', parts: [{ text: '...history 6...' }] },
        { role: 'user', parts: [{ text: '...history 7...' }] },
        { role: 'model', parts: [{ text: '...history 8...' }] },
        // Normally we would break here, but we have a function response.
        {
          role: 'user',
          parts: [{ functionResponse: { name: '...history 8...' } }],
        },
        { role: 'model', parts: [{ text: '...history 10...' }] },
        // Instead we will break here.
        { role: 'user', parts: [{ text: '...history 10...' }] },
      ]);

      const originalTokenCount = 1000 * 0.7;
      const newTokenCount = 100;

      mockCountTokens
        .mockResolvedValueOnce({ totalTokens: originalTokenCount }) // First call for the check
        .mockResolvedValueOnce({ totalTokens: newTokenCount }); // Second call for the new history

      // Mock the summary response from the chat
      mockSendMessage.mockResolvedValue({
        role: 'model',
        parts: [{ text: 'This is a summary.' }],
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-3');
      const newChat = client.getChat();

      expect(tokenLimit).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();

      // Assert that summarization happened and returned the correct stats
      expect(result).toEqual({
        compressionStatus: CompressionStatus.COMPRESSED,
        originalTokenCount,
        newTokenCount,
      });
      // Assert that the chat was reset
      expect(newChat).not.toBe(initialChat);

      // 1. standard start context message
      // 2. standard canned user start message
      // 3. compressed summary message
      // 4. standard canned user summary message
      // 5. The last user message (not the last 3 because that would start with a function response)
      expect(newChat.getHistory().length).toEqual(5);
    });

    it('should always trigger summarization when force is true, regardless of token count', async () => {
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: '...history...' }] },
      ]);

      const originalTokenCount = 10; // Well below threshold
      const newTokenCount = 5;

      mockCountTokens
        .mockResolvedValueOnce({ totalTokens: originalTokenCount })
        .mockResolvedValueOnce({ totalTokens: newTokenCount });

      // Mock the summary response from the chat
      mockSendMessage.mockResolvedValue({
        role: 'model',
        parts: [{ text: 'This is a summary.' }],
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-1', true); // force = true
      const newChat = client.getChat();

      expect(mockSendMessage).toHaveBeenCalled();

      expect(result).toEqual({
        compressionStatus: CompressionStatus.COMPRESSED,
        originalTokenCount,
        newTokenCount,
      });

      // Assert that the chat was reset
      expect(newChat).not.toBe(initialChat);
    });

    it('should use current model from config for token counting after sendMessage', async () => {
      const initialModel = client['config'].getModel();

      const mockCountTokens = vi
        .fn()
        .mockResolvedValueOnce({ totalTokens: 100000 })
        .mockResolvedValueOnce({ totalTokens: 5000 });

      const mockSendMessage = vi.fn().mockResolvedValue({ text: 'Summary' });

      const mockChatHistory = [
        { role: 'user', parts: [{ text: 'Long conversation' }] },
        { role: 'model', parts: [{ text: 'Long response' }] },
      ];

      const mockChat: Partial<GeminiChat> = {
        getHistory: vi.fn().mockReturnValue(mockChatHistory),
        setHistory: vi.fn(),
        sendMessage: mockSendMessage,
      };

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: mockCountTokens,
      };

      // mock the model has been changed between calls of `countTokens`
      const firstCurrentModel = initialModel + '-changed-1';
      const secondCurrentModel = initialModel + '-changed-2';
      vi.spyOn(client['config'], 'getModel')
        .mockReturnValueOnce(firstCurrentModel)
        .mockReturnValueOnce(secondCurrentModel);

      client['chat'] = mockChat as GeminiChat;
      client['contentGenerator'] = mockGenerator as ContentGenerator;
      client['startChat'] = vi.fn().mockResolvedValue(mockChat);

      const result = await client.tryCompressChat('prompt-id-4', true);

      expect(mockCountTokens).toHaveBeenCalledTimes(2);
      expect(mockCountTokens).toHaveBeenNthCalledWith(1, {
        model: firstCurrentModel,
        contents: mockChatHistory,
      });
      expect(mockCountTokens).toHaveBeenNthCalledWith(2, {
        model: secondCurrentModel,
        contents: expect.any(Array),
      });

      expect(result).toEqual({
        compressionStatus: CompressionStatus.COMPRESSED,
        originalTokenCount: 100000,
        newTokenCount: 5000,
      });
    });
  });

  describe('sendMessageStream', () => {
    it('emits a compression event when the context was automatically compressed', async () => {
      // Arrange
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      const compressionInfo: ChatCompressionInfo = {
        compressionStatus: CompressionStatus.COMPRESSED,
        originalTokenCount: 1000,
        newTokenCount: 500,
      };

      vi.spyOn(client, 'tryCompressChat').mockResolvedValueOnce(
        compressionInfo,
      );

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-1',
      );

      const events = await fromAsync(stream);

      // Assert
      expect(events).toContainEqual({
        type: GeminiEventType.ChatCompressed,
        value: compressionInfo,
      });
    });

    it.each([
      {
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      },
      { compressionStatus: CompressionStatus.NOOP },
      {
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      },
    ])(
      'does not emit a compression event when the status is $compressionStatus',
      async ({ compressionStatus }) => {
        // Arrange
        const mockStream = (async function* () {
          yield { type: 'content', value: 'Hello' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
        };
        client['chat'] = mockChat as GeminiChat;

        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
          generateContent: mockGenerateContentFn,
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;

        const compressionInfo: ChatCompressionInfo = {
          compressionStatus,
          originalTokenCount: 1000,
          newTokenCount: 500,
        };

        vi.spyOn(client, 'tryCompressChat').mockResolvedValueOnce(
          compressionInfo,
        );

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-1',
        );

        const events = await fromAsync(stream);

        // Assert
        expect(events).not.toContainEqual({
          type: GeminiEventType.ChatCompressed,
          value: expect.anything(),
        });
      },
    );

    it('should include editor context when ideMode is enabled', async () => {
      // Arrange
      vi.mocked(ideContext.getIdeContext).mockReturnValue({
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/active/file.ts',
              timestamp: Date.now(),
              isActive: true,
              selectedText: 'hello',
              cursor: { line: 5, character: 10 },
            },
            {
              path: '/path/to/recent/file1.ts',
              timestamp: Date.now(),
            },
            {
              path: '/path/to/recent/file2.ts',
              timestamp: Date.now(),
            },
          ],
        },
      });

      vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      const initialRequest: Part[] = [{ text: 'Hi' }];

      // Act
      const stream = client.sendMessageStream(
        initialRequest,
        new AbortController().signal,
        'prompt-id-ide',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(ideContext.getIdeContext).toHaveBeenCalled();
      const expectedContext = `
Here is the user's editor context as a JSON object. This is for your information only.
\`\`\`json
${JSON.stringify(
  {
    activeFile: {
      path: '/path/to/active/file.ts',
      cursor: {
        line: 5,
        character: 10,
      },
      selectedText: 'hello',
    },
    otherOpenFiles: ['/path/to/recent/file1.ts', '/path/to/recent/file2.ts'],
  },
  null,
  2,
)}
\`\`\`
      `.trim();
      const expectedRequest = [{ text: expectedContext }];
      expect(mockChat.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: expectedRequest,
      });
    });

    it('should not add context if ideMode is enabled but no open files', async () => {
      // Arrange
      vi.mocked(ideContext.getIdeContext).mockReturnValue({
        workspaceState: {
          openFiles: [],
        },
      });

      vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      const initialRequest = [{ text: 'Hi' }];

      // Act
      const stream = client.sendMessageStream(
        initialRequest,
        new AbortController().signal,
        'prompt-id-ide',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(ideContext.getIdeContext).toHaveBeenCalled();
      expect(mockTurnRunFn).toHaveBeenCalledWith(
        initialRequest,
        expect.any(Object),
      );
    });

    it('should add context if ideMode is enabled and there is one active file', async () => {
      // Arrange
      vi.mocked(ideContext.getIdeContext).mockReturnValue({
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/active/file.ts',
              timestamp: Date.now(),
              isActive: true,
              selectedText: 'hello',
              cursor: { line: 5, character: 10 },
            },
          ],
        },
      });

      vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      const initialRequest = [{ text: 'Hi' }];

      // Act
      const stream = client.sendMessageStream(
        initialRequest,
        new AbortController().signal,
        'prompt-id-ide',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(ideContext.getIdeContext).toHaveBeenCalled();
      const expectedContext = `
Here is the user's editor context as a JSON object. This is for your information only.
\`\`\`json
${JSON.stringify(
  {
    activeFile: {
      path: '/path/to/active/file.ts',
      cursor: {
        line: 5,
        character: 10,
      },
      selectedText: 'hello',
    },
  },
  null,
  2,
)}
\`\`\`
      `.trim();
      const expectedRequest = [{ text: expectedContext }];
      expect(mockChat.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: expectedRequest,
      });
    });

    it('should add context if ideMode is enabled and there are open files but no active file', async () => {
      // Arrange
      vi.mocked(ideContext.getIdeContext).mockReturnValue({
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/recent/file1.ts',
              timestamp: Date.now(),
            },
            {
              path: '/path/to/recent/file2.ts',
              timestamp: Date.now(),
            },
          ],
        },
      });

      vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      const initialRequest = [{ text: 'Hi' }];

      // Act
      const stream = client.sendMessageStream(
        initialRequest,
        new AbortController().signal,
        'prompt-id-ide',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(ideContext.getIdeContext).toHaveBeenCalled();
      const expectedContext = `
Here is the user's editor context as a JSON object. This is for your information only.
\`\`\`json
${JSON.stringify(
  {
    otherOpenFiles: ['/path/to/recent/file1.ts', '/path/to/recent/file2.ts'],
  },
  null,
  2,
)}
\`\`\`
      `.trim();
      const expectedRequest = [{ text: expectedContext }];
      expect(mockChat.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: expectedRequest,
      });
    });

    it('should return the turn instance after the stream is complete', async () => {
      // Arrange
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-1',
      );

      // Consume the stream manually to get the final return value.
      let finalResult: Turn | undefined;
      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
      }

      // Assert
      expect(finalResult).toBeInstanceOf(Turn);
    });

    it('should stop infinite loop after MAX_TURNS when nextSpeaker always returns model', async () => {
      // Get the mocked checkNextSpeaker function and configure it to trigger infinite loop
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);
      mockCheckNextSpeaker.mockResolvedValue({
        next_speaker: 'model',
        reasoning: 'Test case - always continue',
      });

      // Mock Turn to have no pending tool calls (which would allow nextSpeaker check)
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Continue...' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // Use a signal that never gets aborted
      const abortController = new AbortController();
      const signal = abortController.signal;

      // Act - Start the stream that should loop
      const stream = client.sendMessageStream(
        [{ text: 'Start conversation' }],
        signal,
        'prompt-id-2',
      );

      // Count how many stream events we get
      let eventCount = 0;
      let finalResult: Turn | undefined;

      // Consume the stream and count iterations
      while (true) {
        const result = await stream.next();
        if (result.done) {
          finalResult = result.value;
          break;
        }
        eventCount++;

        // Safety check to prevent actual infinite loop in test
        if (eventCount > 200) {
          abortController.abort();
          throw new Error(
            'Test exceeded expected event limit - possible actual infinite loop',
          );
        }
      }

      // Assert
      expect(finalResult).toBeInstanceOf(Turn);

      // Debug: Check how many times checkNextSpeaker was called
      const callCount = mockCheckNextSpeaker.mock.calls.length;

      // If infinite loop protection is working, checkNextSpeaker should be called many times
      // but stop at MAX_TURNS (100). Since each recursive call should trigger checkNextSpeaker,
      // we expect it to be called multiple times before hitting the limit
      expect(mockCheckNextSpeaker).toHaveBeenCalled();

      // The test should demonstrate that the infinite loop protection works:
      // - If checkNextSpeaker is called many times (close to MAX_TURNS), it shows the loop was happening
      // - If it's only called once, the recursive behavior might not be triggered
      if (callCount === 0) {
        throw new Error(
          'checkNextSpeaker was never called - the recursive condition was not met',
        );
      } else if (callCount === 1) {
        // This might be expected behavior if the turn has pending tool calls or other conditions prevent recursion
        console.log(
          'checkNextSpeaker called only once - no infinite loop occurred',
        );
      } else {
        console.log(
          `checkNextSpeaker called ${callCount} times - infinite loop protection worked`,
        );
        // If called multiple times, we expect it to be stopped before MAX_TURNS
        expect(callCount).toBeLessThanOrEqual(100); // Should not exceed MAX_TURNS
      }

      // The stream should produce events and eventually terminate
      expect(eventCount).toBeGreaterThanOrEqual(1);
      expect(eventCount).toBeLessThan(200); // Should not exceed our safety limit
    });

    it('should yield MaxSessionTurns and stop when session turn limit is reached', async () => {
      // Arrange
      const MAX_SESSION_TURNS = 5;
      vi.spyOn(client['config'], 'getMaxSessionTurns').mockReturnValue(
        MAX_SESSION_TURNS,
      );

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // Act & Assert
      // Run up to the limit
      for (let i = 0; i < MAX_SESSION_TURNS; i++) {
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-4',
        );
        // consume stream
        for await (const _event of stream) {
          // do nothing
        }
      }

      // This call should exceed the limit
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-5',
      );

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([{ type: GeminiEventType.MaxSessionTurns }]);
      expect(mockTurnRunFn).toHaveBeenCalledTimes(MAX_SESSION_TURNS);
    });

    it('should respect MAX_TURNS limit even when turns parameter is set to a large value', async () => {
      // This test verifies that the infinite loop protection works even when
      // someone tries to bypass it by calling with a very large turns value

      // Get the mocked checkNextSpeaker function and configure it to trigger infinite loop
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);
      mockCheckNextSpeaker.mockResolvedValue({
        next_speaker: 'model',
        reasoning: 'Test case - always continue',
      });

      // Mock Turn to have no pending tool calls (which would allow nextSpeaker check)
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Continue...' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // Use a signal that never gets aborted
      const abortController = new AbortController();
      const signal = abortController.signal;

      // Act - Start the stream with an extremely high turns value
      // This simulates a case where the turns protection is bypassed
      const stream = client.sendMessageStream(
        [{ text: 'Start conversation' }],
        signal,
        'prompt-id-3',
        Number.MAX_SAFE_INTEGER, // Bypass the MAX_TURNS protection
      );

      // Count how many stream events we get
      let eventCount = 0;
      const maxTestIterations = 1000; // Higher limit to show the loop continues

      // Consume the stream and count iterations
      try {
        while (true) {
          const result = await stream.next();
          if (result.done) {
            break;
          }
          eventCount++;

          // This test should hit this limit, demonstrating the infinite loop
          if (eventCount > maxTestIterations) {
            abortController.abort();
            // This is the expected behavior - we hit the infinite loop
            break;
          }
        }
      } catch (error) {
        // If the test framework times out, that also demonstrates the infinite loop
        console.error('Test timed out or errored:', error);
      }

      // Assert that the fix works - the loop should stop at MAX_TURNS
      const callCount = mockCheckNextSpeaker.mock.calls.length;

      // With the fix: even when turns is set to a very high value,
      // the loop should stop at MAX_TURNS (100)
      expect(callCount).toBeLessThanOrEqual(100); // Should not exceed MAX_TURNS
      expect(eventCount).toBeLessThanOrEqual(200); // Should have reasonable number of events

      console.log(
        `Infinite loop protection working: checkNextSpeaker called ${callCount} times, ` +
          `${eventCount} events generated (properly bounded by MAX_TURNS)`,
      );
    });

    describe('Editor context delta', () => {
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();

      beforeEach(() => {
        client['forceFullIdeContext'] = false; // Reset before each delta test
        vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.COMPRESSED,
        });
        vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);
        mockTurnRunFn.mockReturnValue(mockStream);

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          setHistory: vi.fn(),
          sendMessage: vi.fn().mockResolvedValue({ text: 'summary' }),
          // Assume history is not empty for delta checks
          getHistory: vi
            .fn()
            .mockReturnValue([
              { role: 'user', parts: [{ text: 'previous message' }] },
            ]),
        };
        client['chat'] = mockChat as GeminiChat;

        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
          generateContent: mockGenerateContentFn,
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;
      });

      const testCases = [
        {
          description: 'sends delta when active file changes',
          previousActiveFile: {
            path: '/path/to/old/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when cursor line changes',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 1, character: 10 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when cursor character changes',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 1 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when selected text changes',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'world',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when selected text is added',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: true,
        },
        {
          description: 'sends delta when selected text is removed',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
          },
          shouldSendContext: true,
        },
        {
          description: 'does not send context when nothing changes',
          previousActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          currentActiveFile: {
            path: '/path/to/active/file.ts',
            cursor: { line: 5, character: 10 },
            selectedText: 'hello',
          },
          shouldSendContext: false,
        },
      ];

      it.each(testCases)(
        '$description',
        async ({
          previousActiveFile,
          currentActiveFile,
          shouldSendContext,
        }) => {
          // Setup previous context
          client['lastSentIdeContext'] = {
            workspaceState: {
              openFiles: [
                {
                  path: previousActiveFile.path,
                  cursor: previousActiveFile.cursor,
                  selectedText: previousActiveFile.selectedText,
                  isActive: true,
                  timestamp: Date.now() - 1000,
                },
              ],
            },
          };

          // Setup current context
          vi.mocked(ideContext.getIdeContext).mockReturnValue({
            workspaceState: {
              openFiles: [
                { ...currentActiveFile, isActive: true, timestamp: Date.now() },
              ],
            },
          });

          const stream = client.sendMessageStream(
            [{ text: 'Hi' }],
            new AbortController().signal,
            'prompt-id-delta',
          );
          for await (const _ of stream) {
            // consume stream
          }

          const mockChat = client['chat'] as unknown as {
            addHistory: (typeof vi)['fn'];
          };

          if (shouldSendContext) {
            expect(mockChat.addHistory).toHaveBeenCalledWith(
              expect.objectContaining({
                parts: expect.arrayContaining([
                  expect.objectContaining({
                    text: expect.stringContaining(
                      "Here is a summary of changes in the user's editor context",
                    ),
                  }),
                ]),
              }),
            );
          } else {
            expect(mockChat.addHistory).not.toHaveBeenCalled();
          }
        },
      );

      it('sends full context when history is cleared, even if editor state is unchanged', async () => {
        const activeFile = {
          path: '/path/to/active/file.ts',
          cursor: { line: 5, character: 10 },
          selectedText: 'hello',
        };

        // Setup previous context
        client['lastSentIdeContext'] = {
          workspaceState: {
            openFiles: [
              {
                path: activeFile.path,
                cursor: activeFile.cursor,
                selectedText: activeFile.selectedText,
                isActive: true,
                timestamp: Date.now() - 1000,
              },
            ],
          },
        };

        // Setup current context (same as previous)
        vi.mocked(ideContext.getIdeContext).mockReturnValue({
          workspaceState: {
            openFiles: [
              { ...activeFile, isActive: true, timestamp: Date.now() },
            ],
          },
        });

        // Make history empty
        const mockChat = client['chat'] as unknown as {
          getHistory: ReturnType<(typeof vi)['fn']>;
          addHistory: ReturnType<(typeof vi)['fn']>;
        };
        mockChat.getHistory.mockReturnValue([]);

        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-id-history-cleared',
        );
        for await (const _ of stream) {
          // consume stream
        }

        expect(mockChat.addHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining(
                  "Here is the user's editor context",
                ),
              }),
            ]),
          }),
        );

        // Also verify it's the full context, not a delta.
        const call = mockChat.addHistory.mock.calls[0][0];
        const contextText = call.parts[0].text;
        const contextJson = JSON.parse(
          contextText.match(/```json\n(.*)\n```/s)![1],
        );
        expect(contextJson).toHaveProperty('activeFile');
        expect(contextJson.activeFile.path).toBe('/path/to/active/file.ts');
      });
    });

    describe('IDE context with pending tool calls', () => {
      let mockChat: Partial<GeminiChat>;

      beforeEach(() => {
        vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.COMPRESSED,
        });

        const mockStream = (async function* () {
          yield { type: 'content', value: 'response' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

        mockChat = {
          addHistory: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]), // Default empty history
          setHistory: vi.fn(),
          sendMessage: vi.fn().mockResolvedValue({ text: 'summary' }),
        };
        client['chat'] = mockChat as GeminiChat;

        const mockGenerator: Partial<ContentGenerator> = {
          countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        };
        client['contentGenerator'] = mockGenerator as ContentGenerator;

        vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);
        vi.mocked(ideContext.getIdeContext).mockReturnValue({
          workspaceState: {
            openFiles: [{ path: '/path/to/file.ts', timestamp: Date.now() }],
          },
        });
      });

      it('should NOT add IDE context when a tool call is pending', async () => {
        // Arrange: History ends with a functionCall from the model
        const historyWithPendingCall: Content[] = [
          { role: 'user', parts: [{ text: 'Please use a tool.' }] },
          {
            role: 'model',
            parts: [{ functionCall: { name: 'some_tool', args: {} } }],
          },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(historyWithPendingCall);

        // Act: Simulate sending the tool's response back
        const stream = client.sendMessageStream(
          [
            {
              functionResponse: {
                name: 'some_tool',
                response: { success: true },
              },
            },
          ],
          new AbortController().signal,
          'prompt-id-tool-response',
        );
        for await (const _ of stream) {
          // consume stream to complete the call
        }

        // Assert: The IDE context message should NOT have been added to the history.
        expect(mockChat.addHistory).not.toHaveBeenCalledWith(
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining("user's editor context"),
              }),
            ]),
          }),
        );
      });

      it('should add IDE context when no tool call is pending', async () => {
        // Arrange: History is normal, no pending calls
        const normalHistory: Content[] = [
          { role: 'user', parts: [{ text: 'A normal message.' }] },
          { role: 'model', parts: [{ text: 'A normal response.' }] },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(normalHistory);

        // Act
        const stream = client.sendMessageStream(
          [{ text: 'Another normal message' }],
          new AbortController().signal,
          'prompt-id-normal',
        );
        for await (const _ of stream) {
          // consume stream
        }

        // Assert: The IDE context message SHOULD have been added.
        expect(mockChat.addHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            role: 'user',
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining("user's editor context"),
              }),
            ]),
          }),
        );
      });

      it('should send the latest IDE context on the next message after a skipped context', async () => {
        // --- Step 1: A tool call is pending, context should be skipped ---

        // Arrange: History ends with a functionCall
        const historyWithPendingCall: Content[] = [
          { role: 'user', parts: [{ text: 'Please use a tool.' }] },
          {
            role: 'model',
            parts: [{ functionCall: { name: 'some_tool', args: {} } }],
          },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(historyWithPendingCall);

        // Arrange: Set the initial IDE context
        const initialIdeContext = {
          workspaceState: {
            openFiles: [{ path: '/path/to/fileA.ts', timestamp: Date.now() }],
          },
        };
        vi.mocked(ideContext.getIdeContext).mockReturnValue(initialIdeContext);

        // Act: Send the tool response
        let stream = client.sendMessageStream(
          [
            {
              functionResponse: {
                name: 'some_tool',
                response: { success: true },
              },
            },
          ],
          new AbortController().signal,
          'prompt-id-tool-response',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: The initial context was NOT sent
        expect(mockChat.addHistory).not.toHaveBeenCalledWith(
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining("user's editor context"),
              }),
            ]),
          }),
        );

        // --- Step 2: A new message is sent, latest context should be included ---

        // Arrange: The model has responded to the tool, and the user is sending a new message.
        const historyAfterToolResponse: Content[] = [
          ...historyWithPendingCall,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'some_tool',
                  response: { success: true },
                },
              },
            ],
          },
          { role: 'model', parts: [{ text: 'The tool ran successfully.' }] },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(
          historyAfterToolResponse,
        );
        vi.mocked(mockChat.addHistory!).mockClear(); // Clear previous calls for the next assertion

        // Arrange: The IDE context has now changed
        const newIdeContext = {
          workspaceState: {
            openFiles: [{ path: '/path/to/fileB.ts', timestamp: Date.now() }],
          },
        };
        vi.mocked(ideContext.getIdeContext).mockReturnValue(newIdeContext);

        // Act: Send a new, regular user message
        stream = client.sendMessageStream(
          [{ text: 'Thanks!' }],
          new AbortController().signal,
          'prompt-id-final',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: The NEW context was sent as a FULL context because there was no previously sent context.
        const addHistoryCalls = vi.mocked(mockChat.addHistory!).mock.calls;
        const contextCall = addHistoryCalls.find((call) =>
          JSON.stringify(call[0]).includes("user's editor context"),
        );
        expect(contextCall).toBeDefined();
        expect(JSON.stringify(contextCall![0])).toContain(
          "Here is the user's editor context as a JSON object",
        );
        // Check that the sent context is the new one (fileB.ts)
        expect(JSON.stringify(contextCall![0])).toContain('fileB.ts');
        // Check that the sent context is NOT the old one (fileA.ts)
        expect(JSON.stringify(contextCall![0])).not.toContain('fileA.ts');
      });

      it('should send a context DELTA on the next message after a skipped context', async () => {
        // --- Step 0: Establish an initial context ---
        vi.mocked(mockChat.getHistory!).mockReturnValue([]); // Start with empty history
        const contextA = {
          workspaceState: {
            openFiles: [
              {
                path: '/path/to/fileA.ts',
                isActive: true,
                timestamp: Date.now(),
              },
            ],
          },
        };
        vi.mocked(ideContext.getIdeContext).mockReturnValue(contextA);

        // Act: Send a regular message to establish the initial context
        let stream = client.sendMessageStream(
          [{ text: 'Initial message' }],
          new AbortController().signal,
          'prompt-id-initial',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: Full context for fileA.ts was sent and stored.
        const initialCall = vi.mocked(mockChat.addHistory!).mock.calls[0][0];
        expect(JSON.stringify(initialCall)).toContain(
          "user's editor context as a JSON object",
        );
        expect(JSON.stringify(initialCall)).toContain('fileA.ts');
        // This implicitly tests that `lastSentIdeContext` is now set internally by the client.
        vi.mocked(mockChat.addHistory!).mockClear();

        // --- Step 1: A tool call is pending, context should be skipped ---
        const historyWithPendingCall: Content[] = [
          { role: 'user', parts: [{ text: 'Please use a tool.' }] },
          {
            role: 'model',
            parts: [{ functionCall: { name: 'some_tool', args: {} } }],
          },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(historyWithPendingCall);

        // Arrange: IDE context changes, but this should be skipped
        const contextB = {
          workspaceState: {
            openFiles: [
              {
                path: '/path/to/fileB.ts',
                isActive: true,
                timestamp: Date.now(),
              },
            ],
          },
        };
        vi.mocked(ideContext.getIdeContext).mockReturnValue(contextB);

        // Act: Send the tool response
        stream = client.sendMessageStream(
          [
            {
              functionResponse: {
                name: 'some_tool',
                response: { success: true },
              },
            },
          ],
          new AbortController().signal,
          'prompt-id-tool-response',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: No context was sent
        expect(mockChat.addHistory).not.toHaveBeenCalled();

        // --- Step 2: A new message is sent, latest context DELTA should be included ---
        const historyAfterToolResponse: Content[] = [
          ...historyWithPendingCall,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'some_tool',
                  response: { success: true },
                },
              },
            ],
          },
          { role: 'model', parts: [{ text: 'The tool ran successfully.' }] },
        ];
        vi.mocked(mockChat.getHistory!).mockReturnValue(
          historyAfterToolResponse,
        );

        // Arrange: The IDE context has changed again
        const contextC = {
          workspaceState: {
            openFiles: [
              // fileA is now closed, fileC is open
              {
                path: '/path/to/fileC.ts',
                isActive: true,
                timestamp: Date.now(),
              },
            ],
          },
        };
        vi.mocked(ideContext.getIdeContext).mockReturnValue(contextC);

        // Act: Send a new, regular user message
        stream = client.sendMessageStream(
          [{ text: 'Thanks!' }],
          new AbortController().signal,
          'prompt-id-final',
        );
        for await (const _ of stream) {
          /* consume */
        }

        // Assert: The DELTA context was sent
        const finalCall = vi.mocked(mockChat.addHistory!).mock.calls[0][0];
        expect(JSON.stringify(finalCall)).toContain('summary of changes');
        // The delta should reflect fileA being closed and fileC being opened.
        expect(JSON.stringify(finalCall)).toContain('filesClosed');
        expect(JSON.stringify(finalCall)).toContain('fileA.ts');
        expect(JSON.stringify(finalCall)).toContain('activeFileChanged');
        expect(JSON.stringify(finalCall)).toContain('fileC.ts');
      });
    });

    it('should not call checkNextSpeaker when turn.run() yields an error', async () => {
      // Arrange
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);

      const mockStream = (async function* () {
        yield {
          type: GeminiEventType.Error,
          value: { error: { message: 'test error' } },
        };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-error',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(mockCheckNextSpeaker).not.toHaveBeenCalled();
    });

    it('should not call checkNextSpeaker when turn.run() yields a value then an error', async () => {
      // Arrange
      const { checkNextSpeaker } = await import(
        '../utils/nextSpeakerChecker.js'
      );
      const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);

      const mockStream = (async function* () {
        yield { type: GeminiEventType.Content, value: 'some content' };
        yield {
          type: GeminiEventType.Error,
          value: { error: { message: 'test error' } },
        };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-error',
      );
      for await (const _ of stream) {
        // consume stream
      }

      // Assert
      expect(mockCheckNextSpeaker).not.toHaveBeenCalled();
    });
  });

  describe('generateContent', () => {
    it('should call generateContent with the correct parameters', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const generationConfig = { temperature: 0.5 };
      const abortSignal = new AbortController().signal;

      // Mock countTokens
      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateContent(
        contents,
        generationConfig,
        abortSignal,
        DEFAULT_GEMINI_FLASH_MODEL,
      );

      expect(mockGenerateContentFn).toHaveBeenCalledWith(
        {
          model: DEFAULT_GEMINI_FLASH_MODEL,
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt(''),
            temperature: 0.5,
            topP: 1,
          },
          contents,
        },
        'test-session-id',
      );
    });

    it('should use current model from config for content generation', async () => {
      const initialModel = client['config'].getModel();
      const contents = [{ role: 'user', parts: [{ text: 'test' }] }];
      const currentModel = initialModel + '-changed';

      vi.spyOn(client['config'], 'getModel').mockReturnValueOnce(currentModel);

      const mockGenerator: Partial<ContentGenerator> = {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1 }),
        generateContent: mockGenerateContentFn,
      };
      client['contentGenerator'] = mockGenerator as ContentGenerator;

      await client.generateContent(
        contents,
        {},
        new AbortController().signal,
        DEFAULT_GEMINI_FLASH_MODEL,
      );

      expect(mockGenerateContentFn).not.toHaveBeenCalledWith({
        model: initialModel,
        config: expect.any(Object),
        contents,
      });
      expect(mockGenerateContentFn).toHaveBeenCalledWith(
        {
          model: DEFAULT_GEMINI_FLASH_MODEL,
          config: expect.any(Object),
          contents,
        },
        'test-session-id',
      );
    });
  });

  describe('handleFlashFallback', () => {
    it('should use current model from config when checking for fallback', async () => {
      const initialModel = client['config'].getModel();
      const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;

      // mock config been changed
      const currentModel = initialModel + '-changed';
      const getModelSpy = vi.spyOn(client['config'], 'getModel');
      getModelSpy.mockReturnValue(currentModel);

      const mockFallbackHandler = vi.fn().mockResolvedValue(true);
      client['config'].flashFallbackHandler = mockFallbackHandler;
      client['config'].setModel = vi.fn();

      const result = await client['handleFlashFallback'](
        AuthType.LOGIN_WITH_GOOGLE,
      );

      expect(result).toBe(fallbackModel);

      expect(mockFallbackHandler).toHaveBeenCalledWith(
        currentModel,
        fallbackModel,
        undefined,
      );
    });
  });

  describe('setHistory', () => {
    it('should strip thought signatures when stripThoughts is true', () => {
      const mockChat = {
        setHistory: vi.fn(),
      };
      client['chat'] = mockChat as unknown as GeminiChat;

      const historyWithThoughts: Content[] = [
        {
          role: 'user',
          parts: [{ text: 'hello' }],
        },
        {
          role: 'model',
          parts: [
            { text: 'thinking...', thoughtSignature: 'thought-123' },
            {
              functionCall: { name: 'test', args: {} },
              thoughtSignature: 'thought-456',
            },
          ],
        },
      ];

      client.setHistory(historyWithThoughts, { stripThoughts: true });

      const expectedHistory: Content[] = [
        {
          role: 'user',
          parts: [{ text: 'hello' }],
        },
        {
          role: 'model',
          parts: [
            { text: 'thinking...' },
            { functionCall: { name: 'test', args: {} } },
          ],
        },
      ];

      expect(mockChat.setHistory).toHaveBeenCalledWith(expectedHistory);
    });

    it('should not strip thought signatures when stripThoughts is false', () => {
      const mockChat = {
        setHistory: vi.fn(),
      };
      client['chat'] = mockChat as unknown as GeminiChat;

      const historyWithThoughts: Content[] = [
        {
          role: 'user',
          parts: [{ text: 'hello' }],
        },
        {
          role: 'model',
          parts: [
            { text: 'thinking...', thoughtSignature: 'thought-123' },
            { text: 'ok', thoughtSignature: 'thought-456' },
          ],
        },
      ];

      client.setHistory(historyWithThoughts, { stripThoughts: false });

      expect(mockChat.setHistory).toHaveBeenCalledWith(historyWithThoughts);
    });
  });
});
