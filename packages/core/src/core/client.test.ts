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

import type { Content, GenerateContentResponse, Part } from '@google/genai';
import { GeminiClient } from './client.js';
import {
  AuthType,
  type ContentGenerator,
  type ContentGeneratorConfig,
} from './contentGenerator.js';
import { type GeminiChat } from './geminiChat.js';
import type { Config } from '../config/config.js';
import {
  CompressionStatus,
  GeminiEventType,
  Turn,
  type ChatCompressionInfo,
} from './turn.js';
import { getCoreSystemPrompt } from './prompts.js';
import { DEFAULT_GEMINI_MODEL_AUTO } from '../config/models.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { setSimulate429 } from '../utils/testUtils.js';
import { tokenLimit } from './tokenLimits.js';
import { ideContextStore } from '../ide/ideContext.js';
import type { ModelRouterService } from '../routing/modelRouterService.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import type { ChatRecordingService } from '../services/chatRecordingService.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';
import type { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import type {
  ModelConfigKey,
  ResolvedModelConfig,
} from '../services/modelConfigService.js';
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';
import { HookSystem } from '../hooks/hookSystem.js';
import type { DefaultHookOutput } from '../hooks/types.js';
import * as policyCatalog from '../availability/policyCatalog.js';

vi.mock('../services/chatCompressionService.js');

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

// --- Mocks ---
interface MockTurnContext {
  getResponseText: Mock<() => string>;
}

const mockTurnRunFn = vi.fn();

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

    getResponseText = vi.fn().mockReturnValue('Mock Response');
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
vi.mock('../telemetry/uiTelemetry.js', () => ({
  uiTelemetryService: {
    setLastPromptTokenCount: vi.fn(),
    getLastPromptTokenCount: vi.fn(),
  },
}));
vi.mock('../hooks/hookSystem.js');
vi.mock('./clientHookTriggers.js', () => ({
  fireBeforeAgentHook: vi.fn(),
  fireAfterAgentHook: vi.fn().mockResolvedValue({
    decision: 'allow',
    continue: false,
    suppressOutput: false,
    systemMessage: undefined,
  }),
}));

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

describe('Gemini Client (client.ts)', () => {
  let mockContentGenerator: ContentGenerator;
  let mockConfig: Config;
  let client: GeminiClient;
  let mockGenerateContentFn: Mock;
  let mockRouterService: { route: Mock };
  beforeEach(async () => {
    vi.resetAllMocks();
    ClearcutLogger.clearInstance();
    vi.mocked(uiTelemetryService.setLastPromptTokenCount).mockClear();

    vi.mocked(ChatCompressionService.prototype.compress).mockResolvedValue({
      newHistory: null,
      info: {
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.NOOP,
      },
    });

    mockGenerateContentFn = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: '{"key": "value"}' }] } }],
    });

    // Disable 429 simulation for tests
    setSimulate429(false);

    mockRouterService = {
      route: vi
        .fn()
        .mockResolvedValue({ model: 'default-routed-model', reason: 'test' }),
    };

    mockContentGenerator = {
      generateContent: mockGenerateContentFn,
      generateContentStream: vi.fn(),
      batchEmbedContents: vi.fn(),
      countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
    } as unknown as ContentGenerator;

    // Because the GeminiClient constructor kicks off an async process (startChat)
    // that depends on a fully-formed Config object, we need to mock the
    // entire implementation of Config for these tests.
    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(null),
    };
    const fileService = new FileDiscoveryService('/test/dir');
    const contentGeneratorConfig: ContentGeneratorConfig = {
      apiKey: 'test-key',
      vertexai: false,
      authType: AuthType.USE_GEMINI,
    };
    mockConfig = {
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue(contentGeneratorConfig),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getModel: vi.fn().mockReturnValue('test-model'),
      getUserTier: vi.fn().mockReturnValue(undefined),
      getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
      getApiKey: vi.fn().mockReturnValue('test-key'),
      getVertexAI: vi.fn().mockReturnValue(false),
      getUserAgent: vi.fn().mockReturnValue('test-agent'),
      getUserMemory: vi.fn().mockReturnValue(''),
      getGlobalMemory: vi.fn().mockReturnValue(''),
      getEnvironmentMemory: vi.fn().mockReturnValue(''),
      isJitContextEnabled: vi.fn().mockReturnValue(false),

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
      getPreviewFeatures: vi.fn().mockReturnValue(false),
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/dir']),
      }),
      getGeminiClient: vi.fn(),
      getModelRouterService: vi
        .fn()
        .mockReturnValue(mockRouterService as unknown as ModelRouterService),
      getMessageBus: vi.fn().mockReturnValue(undefined),
      getEnableHooks: vi.fn().mockReturnValue(false),
      getChatCompression: vi.fn().mockReturnValue(undefined),
      getSkipNextSpeakerCheck: vi.fn().mockReturnValue(false),
      getShowModelInfoInChat: vi.fn().mockReturnValue(false),
      getContinueOnFailedApiCall: vi.fn(),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/temp'),
      },
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateJson: vi.fn().mockResolvedValue({
          next_speaker: 'user',
          reasoning: 'test',
        }),
      }),
      modelConfigService: {
        getResolvedConfig(modelConfigKey: ModelConfigKey) {
          return {
            model: modelConfigKey.model,
            generateContentConfig: {
              temperature: 0,
              topP: 1,
            } as unknown as ResolvedModelConfig,
          };
        },
      },
      isInteractive: vi.fn().mockReturnValue(false),
      getExperiments: () => {},
      getActiveModel: vi.fn().mockReturnValue('test-model'),
      setActiveModel: vi.fn(),
      resetTurn: vi.fn(),
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(createAvailabilityServiceMock()),
    } as unknown as Config;
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    client = new GeminiClient(mockConfig);
    await client.initialize();
    vi.mocked(mockConfig.getGeminiClient).mockReturnValue(client);

    vi.mocked(uiTelemetryService.setLastPromptTokenCount).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addHistory', () => {
    it('should call chat.addHistory with the provided content', async () => {
      const mockChat = {
        addHistory: vi.fn(),
      } as unknown as GeminiChat;
      client['chat'] = mockChat;

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
      const initialHistory = client.getHistory();
      await client.addHistory({
        role: 'user',
        parts: [{ text: 'some old message' }],
      });
      const historyWithOldMessage = client.getHistory();
      expect(historyWithOldMessage.length).toBeGreaterThan(
        initialHistory.length,
      );

      // 2. Call resetChat.
      await client.resetChat();

      // 3. Get the new chat instance and its history.
      const newChat = client.getChat();
      const newHistory = client.getHistory();

      // 4. Assert that the chat instance is new and the history is reset.
      expect(newChat).not.toBe(initialChat);
      expect(newHistory.length).toBe(initialHistory.length);
      expect(JSON.stringify(newHistory)).not.toContain('some old message');
    });
  });

  describe('startChat', () => {
    it('should include environment context when resuming a session', async () => {
      const extraHistory: Content[] = [
        { role: 'user', parts: [{ text: 'Old message' }] },
        { role: 'model', parts: [{ text: 'Old response' }] },
      ];

      const chat = await client.startChat(extraHistory);
      const history = chat.getHistory();

      // The first message should be the environment context
      expect(history[0].role).toBe('user');
      expect(history[0].parts?.[0]?.text).toContain('This is the Gemini CLI');
      expect(history[0].parts?.[0]?.text).toContain(
        "The project's temporary directory is:",
      );

      // The subsequent messages should be the extra history
      expect(history[1]).toEqual(extraHistory[0]);
      expect(history[2]).toEqual(extraHistory[1]);
    });
  });

  describe('tryCompressChat', () => {
    const mockGetHistory = vi.fn();

    beforeEach(() => {
      vi.mock('./tokenLimits', () => ({
        tokenLimit: vi.fn(),
      }));

      client['chat'] = {
        getHistory: mockGetHistory,
        addHistory: vi.fn(),
        setHistory: vi.fn(),
        getLastPromptTokenCount: vi.fn(),
      } as unknown as GeminiChat;
    });

    function setup({
      chatHistory = [
        { role: 'user', parts: [{ text: 'Long conversation' }] },
        { role: 'model', parts: [{ text: 'Long response' }] },
      ] as Content[],
      originalTokenCount = 1000,
      newTokenCount = 500,
      compressionStatus = CompressionStatus.COMPRESSED,
    } = {}) {
      const mockOriginalChat: Partial<GeminiChat> = {
        getHistory: vi.fn((_curated?: boolean) => chatHistory),
        setHistory: vi.fn(),
        getLastPromptTokenCount: vi.fn().mockReturnValue(originalTokenCount),
        getChatRecordingService: vi.fn().mockReturnValue({
          getConversation: vi.fn().mockReturnValue(null),
          getConversationFilePath: vi.fn().mockReturnValue(null),
        }),
      };
      client['chat'] = mockOriginalChat as GeminiChat;

      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        originalTokenCount,
      );

      const newHistory: Content[] = [
        { role: 'user', parts: [{ text: 'Summary' }] },
        { role: 'model', parts: [{ text: 'Got it' }] },
      ];

      vi.mocked(ChatCompressionService.prototype.compress).mockResolvedValue({
        newHistory:
          compressionStatus === CompressionStatus.COMPRESSED
            ? newHistory
            : null,
        info: {
          originalTokenCount,
          newTokenCount,
          compressionStatus,
        },
      });

      const mockNewChat: Partial<GeminiChat> = {
        getHistory: vi.fn().mockReturnValue(newHistory),
        setHistory: vi.fn(),
        getLastPromptTokenCount: vi.fn().mockReturnValue(newTokenCount),
      };

      client['startChat'] = vi
        .fn()
        .mockResolvedValue(mockNewChat as GeminiChat);

      return {
        client,
        mockOriginalChat,
        mockNewChat,
        estimatedNewTokenCount: newTokenCount,
      };
    }

    describe('when compression inflates the token count', () => {
      it('allows compression to be forced/manual after a failure', async () => {
        // Call 1 (Fails): Setup with inflated tokens
        setup({
          originalTokenCount: 100,
          newTokenCount: 200,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });

        await client.tryCompressChat('prompt-id-4', false); // Fails

        // Call 2 (Forced): Re-setup with compressed tokens
        const { estimatedNewTokenCount: compressedTokenCount } = setup({
          originalTokenCount: 100,
          newTokenCount: 50,
          compressionStatus: CompressionStatus.COMPRESSED,
        });

        const result = await client.tryCompressChat('prompt-id-4', true); // Forced

        expect(result).toEqual({
          compressionStatus: CompressionStatus.COMPRESSED,
          newTokenCount: compressedTokenCount,
          originalTokenCount: 100,
        });
      });

      it('yields the result even if the compression inflated the tokens', async () => {
        const { client, estimatedNewTokenCount } = setup({
          originalTokenCount: 100,
          newTokenCount: 200,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });

        const result = await client.tryCompressChat('prompt-id-4', false);

        expect(result).toEqual({
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
          newTokenCount: estimatedNewTokenCount,
          originalTokenCount: 100,
        });
        // IMPORTANT: The change in client.ts means setLastPromptTokenCount is NOT called on failure
        expect(
          uiTelemetryService.setLastPromptTokenCount,
        ).not.toHaveBeenCalled();
      });

      it('does not manipulate the source chat', async () => {
        const { client, mockOriginalChat } = setup({
          originalTokenCount: 100,
          newTokenCount: 200,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });

        await client.tryCompressChat('prompt-id-4', false);

        // On failure, the chat should NOT be replaced
        expect(client['chat']).toBe(mockOriginalChat);
      });

      it.skip('will not attempt to compress context after a failure', async () => {
        const { client } = setup({
          originalTokenCount: 100,
          newTokenCount: 200,
          compressionStatus:
            CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
        });

        await client.tryCompressChat('prompt-id-4', false); // This fails and sets hasFailedCompressionAttempt = true

        // Mock the next call to return NOOP
        vi.mocked(
          ChatCompressionService.prototype.compress,
        ).mockResolvedValueOnce({
          newHistory: null,
          info: {
            originalTokenCount: 0,
            newTokenCount: 0,
            compressionStatus: CompressionStatus.NOOP,
          },
        });

        // This call should now be a NOOP
        const result = await client.tryCompressChat('prompt-id-5', false);

        expect(result.compressionStatus).toBe(CompressionStatus.NOOP);
        expect(ChatCompressionService.prototype.compress).toHaveBeenCalledTimes(
          2,
        );
        expect(
          ChatCompressionService.prototype.compress,
        ).toHaveBeenLastCalledWith(
          expect.anything(),
          'prompt-id-5',
          false,
          expect.anything(),
          expect.anything(),
          true, // hasFailedCompressionAttempt
        );
      });
    });
    it('should correctly latch hasFailedCompressionAttempt flag', async () => {
      // 1. Setup: Call setup() from this test file
      // This helper function mocks the compression service for us.
      const { client } = setup({
        originalTokenCount: 100,
        newTokenCount: 200, // Inflated
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      });

      // 2. Test Step 1: Trigger a non-forced failure
      await client.tryCompressChat('prompt-1', false); // force = false

      // 3. Assert Step 1: Check that the flag became true
      // 3. Assert Step 1: Check that the flag became true
      expect(
        (client as unknown as { hasFailedCompressionAttempt: boolean })
          .hasFailedCompressionAttempt,
      ).toBe(true);

      // 4. Test Step 2: Trigger a forced failure

      await client.tryCompressChat('prompt-2', true); // force = true

      // 5. Assert Step 2: Check that the flag REMAINS true
      // 5. Assert Step 2: Check that the flag REMAINS true
      expect(
        (client as unknown as { hasFailedCompressionAttempt: boolean })
          .hasFailedCompressionAttempt,
      ).toBe(true);
    });

    it('should not trigger summarization if token count is below threshold', async () => {
      const MOCKED_TOKEN_LIMIT = 1000;
      const originalTokenCount = MOCKED_TOKEN_LIMIT * 0.699;

      vi.mocked(ChatCompressionService.prototype.compress).mockResolvedValue({
        newHistory: null,
        info: {
          originalTokenCount,
          newTokenCount: originalTokenCount,
          compressionStatus: CompressionStatus.NOOP,
        },
      });

      const initialChat = client.getChat();
      const result = await client.tryCompressChat('prompt-id-2', false);
      const newChat = client.getChat();

      expect(result).toEqual({
        compressionStatus: CompressionStatus.NOOP,
        newTokenCount: originalTokenCount,
        originalTokenCount,
      });
      expect(newChat).toBe(initialChat);
    });

    it('should return NOOP if history is too short to compress', async () => {
      const { client } = setup({
        chatHistory: [{ role: 'user', parts: [{ text: 'hi' }] }],
        originalTokenCount: 50,
        newTokenCount: 50,
        compressionStatus: CompressionStatus.NOOP,
      });

      const result = await client.tryCompressChat('prompt-id-noop', false);

      expect(result).toEqual({
        compressionStatus: CompressionStatus.NOOP,
        originalTokenCount: 50,
        newTokenCount: 50,
      });
    });

    it('should resume the session file when compression succeeds', async () => {
      const { client, mockOriginalChat } = setup({
        compressionStatus: CompressionStatus.COMPRESSED,
      });

      const mockConversation = { some: 'conversation' };
      const mockFilePath = '/tmp/session.json';

      // Override the mock to return values
      const mockRecordingService = {
        getConversation: vi.fn().mockReturnValue(mockConversation),
        getConversationFilePath: vi.fn().mockReturnValue(mockFilePath),
      };
      vi.mocked(mockOriginalChat.getChatRecordingService!).mockReturnValue(
        mockRecordingService as unknown as ChatRecordingService,
      );

      await client.tryCompressChat('prompt-id', false);

      expect(client['startChat']).toHaveBeenCalledWith(
        expect.anything(), // newHistory
        {
          conversation: mockConversation,
          filePath: mockFilePath,
        },
      );
    });
  });

  describe('sendMessageStream', () => {
    it('emits a compression event when the context was automatically compressed', async () => {
      // Arrange
      mockTurnRunFn.mockReturnValue(
        (async function* () {
          yield { type: 'content', value: 'Hello' };
        })(),
      );

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
    ])(
      'does not emit a compression event when the status is $compressionStatus',
      async ({ compressionStatus }) => {
        // Arrange
        const mockStream = (async function* () {
          yield { type: 'content', value: 'Hello' };
        })();
        mockTurnRunFn.mockReturnValue(mockStream);

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
      vi.mocked(ideContextStore.get).mockReturnValue({
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

      vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);

      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.COMPRESSED,
      });

      mockTurnRunFn.mockReturnValue(
        (async function* () {
          yield { type: 'content', value: 'Hello' };
        })(),
      );

      const mockChat = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      } as unknown as GeminiChat;
      client['chat'] = mockChat;

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
      expect(ideContextStore.get).toHaveBeenCalled();
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
      vi.mocked(ideContextStore.get).mockReturnValue({
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
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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
      expect(ideContextStore.get).toHaveBeenCalled();
      expect(mockTurnRunFn).toHaveBeenCalledWith(
        { model: 'default-routed-model' },
        initialRequest,
        expect.any(AbortSignal),
      );
    });

    it('should add context if ideMode is enabled and there is one active file', async () => {
      // Arrange
      vi.mocked(ideContextStore.get).mockReturnValue({
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

      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.COMPRESSED,
      });

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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
      expect(ideContextStore.get).toHaveBeenCalled();
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
      vi.mocked(ideContextStore.get).mockReturnValue({
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

      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.COMPRESSED,
      });

      const mockStream = (async function* () {
        yield { type: 'content', value: 'Hello' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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
      expect(ideContextStore.get).toHaveBeenCalled();
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

    it('should use local estimation for text-only requests and NOT call countTokens', async () => {
      const request = [{ text: 'Hello world' }];
      const generator = client['getContentGeneratorOrFail']();
      const countTokensSpy = vi.spyOn(generator, 'countTokens');

      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'test-prompt-id',
      );
      await stream.next(); // Trigger the generator

      expect(countTokensSpy).not.toHaveBeenCalled();
    });

    it('should use countTokens API for requests with non-text parts', async () => {
      const request = [
        { text: 'Describe this image' },
        { inlineData: { mimeType: 'image/png', data: 'base64...' } },
      ];
      const generator = client['getContentGeneratorOrFail']();
      const countTokensSpy = vi
        .spyOn(generator, 'countTokens')
        .mockResolvedValue({ totalTokens: 123 });

      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'test-prompt-id',
      );
      await stream.next(); // Trigger the generator

      expect(countTokensSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                { text: 'Describe this image' },
                { inlineData: { mimeType: 'image/png', data: 'base64...' } },
              ]),
            }),
          ]),
        }),
      );
    });

    it('should estimate CJK characters more conservatively (closer to 1 token/char)', async () => {
      const request = [{ text: '你好世界' }]; // 4 chars
      const generator = client['getContentGeneratorOrFail']();
      const countTokensSpy = vi.spyOn(generator, 'countTokens');

      // 4 chars.
      // Old logic: 4/4 = 1.
      // New logic (heuristic): 4 * 1 = 4. (Or at least > 1).
      // Let's assert it's roughly accurate.

      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'test-prompt-id',
      );
      await stream.next();

      // Should NOT call countTokens (it's text only)
      expect(countTokensSpy).not.toHaveBeenCalled();

      // The actual token calculation is unit tested in tokenCalculation.test.ts
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
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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
      vi.spyOn(client['config'], 'getContinueOnFailedApiCall').mockReturnValue(
        true,
      );
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
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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

      // If infinite loop protection is working, checkNextSpeaker should be called many times
      // but stop at MAX_TURNS (100). Since each recursive call should trigger checkNextSpeaker,
      // we expect it to be called multiple times before hitting the limit
      expect(mockCheckNextSpeaker).toHaveBeenCalled();

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
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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
      } catch (_) {
        // If the test framework times out, that also demonstrates the infinite loop
      }

      // Assert that the fix works - the loop should stop at MAX_TURNS
      const callCount = mockCheckNextSpeaker.mock.calls.length;

      // With the fix: even when turns is set to a very high value,
      // the loop should stop at MAX_TURNS (100)
      expect(callCount).toBeLessThanOrEqual(100); // Should not exceed MAX_TURNS
      expect(eventCount).toBeLessThanOrEqual(200); // Should have reasonable number of events
    });

    it('should yield ContextWindowWillOverflow when the context window is about to overflow', async () => {
      // Arrange
      const MOCKED_TOKEN_LIMIT = 1000;
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);

      // Set last prompt token count
      const lastPromptTokenCount = 900;
      const mockChat: Partial<GeminiChat> = {
        getLastPromptTokenCount: vi.fn().mockReturnValue(lastPromptTokenCount),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      // Remaining = 100. Threshold (95%) = 95.
      // We need a request > 95 tokens.
      // A string of length 400 is roughly 100 tokens.
      const longText = 'a'.repeat(400);
      const request: Part[] = [{ text: longText }];
      // estimateTextOnlyLength counts only text content (400 chars), not JSON structure
      const estimatedRequestTokenCount = Math.floor(longText.length / 4);
      const remainingTokenCount = MOCKED_TOKEN_LIMIT - lastPromptTokenCount;

      // Mock tryCompressChat to not compress
      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: lastPromptTokenCount,
        newTokenCount: lastPromptTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      });

      // Act
      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'prompt-id-overflow',
      );

      const events = await fromAsync(stream);

      // Assert
      expect(events).toContainEqual({
        type: GeminiEventType.ContextWindowWillOverflow,
        value: {
          estimatedRequestTokenCount,
          remainingTokenCount,
        },
      });
      // Ensure turn.run is not called
      expect(mockTurnRunFn).not.toHaveBeenCalled();
    });

    it("should use the sticky model's token limit for the overflow check", async () => {
      // Arrange
      const STICKY_MODEL = 'gemini-1.5-flash';
      const STICKY_MODEL_LIMIT = 1000;
      const CONFIG_MODEL_LIMIT = 2000;

      // Set up token limits
      vi.mocked(tokenLimit).mockImplementation((model) => {
        if (model === STICKY_MODEL) return STICKY_MODEL_LIMIT;
        return CONFIG_MODEL_LIMIT;
      });

      // Set the sticky model
      client['currentSequenceModel'] = STICKY_MODEL;

      // Set token count
      const lastPromptTokenCount = 900;
      const mockChat: Partial<GeminiChat> = {
        getLastPromptTokenCount: vi.fn().mockReturnValue(lastPromptTokenCount),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      // Remaining (sticky) = 100. Threshold (95%) = 95.
      // We need a request > 95 tokens.
      const longText = 'a'.repeat(400);
      const request: Part[] = [{ text: longText }];
      // estimateTextOnlyLength counts only text content (400 chars), not JSON structure
      const estimatedRequestTokenCount = Math.floor(longText.length / 4);
      const remainingTokenCount = STICKY_MODEL_LIMIT - lastPromptTokenCount;

      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: lastPromptTokenCount,
        newTokenCount: lastPromptTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      });

      // Act
      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'test-session-id', // Use the same ID as the session to keep stickiness
      );

      const events = await fromAsync(stream);

      // Assert
      // Should overflow based on the sticky model's limit
      expect(events).toContainEqual({
        type: GeminiEventType.ContextWindowWillOverflow,
        value: {
          estimatedRequestTokenCount,
          remainingTokenCount,
        },
      });
      expect(tokenLimit).toHaveBeenCalledWith(STICKY_MODEL);
      expect(mockTurnRunFn).not.toHaveBeenCalled();
    });

    it('should not trigger overflow warning for requests with large binary data (PDFs/images)', async () => {
      // Arrange
      const MOCKED_TOKEN_LIMIT = 1000000; // 1M tokens
      vi.mocked(tokenLimit).mockReturnValue(MOCKED_TOKEN_LIMIT);

      const lastPromptTokenCount = 10000;
      const mockChat: Partial<GeminiChat> = {
        getLastPromptTokenCount: vi.fn().mockReturnValue(lastPromptTokenCount),
        getHistory: vi.fn().mockReturnValue([]),
      };
      client['chat'] = mockChat as GeminiChat;

      // Simulate a PDF file with large base64 data (11MB when encoded)
      // In the old implementation, this would incorrectly estimate ~2.7M tokens
      // In the new implementation, only the text part is counted
      const largePdfBase64 = 'A'.repeat(11 * 1024 * 1024);
      const request: Part[] = [
        { text: 'Please analyze this PDF document' }, // ~35 chars = ~8 tokens
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: largePdfBase64, // This should be ignored in token estimation
          },
        },
      ];

      // Mock tryCompressChat to not compress
      vi.spyOn(client, 'tryCompressChat').mockResolvedValue({
        originalTokenCount: lastPromptTokenCount,
        newTokenCount: lastPromptTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      });

      // Mock Turn.run to simulate successful processing
      const mockStream = (async function* () {
        yield { type: 'content', value: 'Analysis complete' };
      })();
      mockTurnRunFn.mockReturnValue(mockStream);

      // Act
      const stream = client.sendMessageStream(
        request,
        new AbortController().signal,
        'prompt-id-pdf-test',
      );

      const events = await fromAsync(stream);

      // Assert
      // Should NOT contain overflow warning
      expect(events).not.toContainEqual(
        expect.objectContaining({
          type: GeminiEventType.ContextWindowWillOverflow,
        }),
      );

      // Turn.run should be called (processing should continue)
      expect(mockTurnRunFn).toHaveBeenCalled();
    });

    describe('Model Routing', () => {
      let mockRouterService: { route: Mock };

      beforeEach(() => {
        mockRouterService = {
          route: vi
            .fn()
            .mockResolvedValue({ model: 'routed-model', reason: 'test' }),
        };
        vi.mocked(mockConfig.getModelRouterService).mockReturnValue(
          mockRouterService as unknown as ModelRouterService,
        );

        mockTurnRunFn.mockReturnValue(
          (async function* () {
            yield { type: 'content', value: 'Hello' };
          })(),
        );

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;
      });

      it('should use the model router service to select a model on the first turn', async () => {
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream); // consume stream

        expect(mockConfig.getModelRouterService).toHaveBeenCalled();
        expect(mockRouterService.route).toHaveBeenCalled();
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'routed-model' },
          [{ text: 'Hi' }],
          expect.any(AbortSignal),
        );
      });

      it('should use the same model for subsequent turns in the same prompt (stickiness)', async () => {
        // First turn
        let stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream);

        expect(mockRouterService.route).toHaveBeenCalledTimes(1);
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'routed-model' },
          [{ text: 'Hi' }],
          expect.any(AbortSignal),
        );

        // Second turn
        stream = client.sendMessageStream(
          [{ text: 'Continue' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream);

        // Router should not be called again
        expect(mockRouterService.route).toHaveBeenCalledTimes(1);
        // Should stick to the first model
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'routed-model' },
          [{ text: 'Continue' }],
          expect.any(AbortSignal),
        );
      });

      it('should reset the sticky model and re-route when the prompt_id changes', async () => {
        // First prompt
        let stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-1',
        );
        await fromAsync(stream);

        expect(mockRouterService.route).toHaveBeenCalledTimes(1);
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'routed-model' },
          [{ text: 'Hi' }],
          expect.any(AbortSignal),
        );

        // New prompt
        mockRouterService.route.mockResolvedValue({
          model: 'new-routed-model',
          reason: 'test',
        });
        stream = client.sendMessageStream(
          [{ text: 'A new topic' }],
          new AbortController().signal,
          'prompt-2',
        );
        await fromAsync(stream);

        // Router should be called again for the new prompt
        expect(mockRouterService.route).toHaveBeenCalledTimes(2);
        // Should use the newly routed model
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          { model: 'new-routed-model' },
          [{ text: 'A new topic' }],
          expect.any(AbortSignal),
        );
      });
    });

    it('should use getGlobalMemory for system instruction when JIT is enabled', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(true);
      vi.mocked(mockConfig.getGlobalMemory).mockReturnValue(
        'Global JIT Memory',
      );
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('Full JIT Memory');

      const { getCoreSystemPrompt } = await import('./prompts.js');
      const mockGetCoreSystemPrompt = vi.mocked(getCoreSystemPrompt);

      await client.updateSystemInstruction();

      expect(mockGetCoreSystemPrompt).toHaveBeenCalledWith(
        mockConfig,
        'Global JIT Memory',
      );
    });

    it('should use getUserMemory for system instruction when JIT is disabled', async () => {
      vi.mocked(mockConfig.isJitContextEnabled).mockReturnValue(false);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('Legacy Memory');

      const { getCoreSystemPrompt } = await import('./prompts.js');
      const mockGetCoreSystemPrompt = vi.mocked(getCoreSystemPrompt);

      await client.updateSystemInstruction();

      expect(mockGetCoreSystemPrompt).toHaveBeenCalledWith(
        mockConfig,
        'Legacy Memory',
      );
    });

    it('should recursively call sendMessageStream with "Please continue." when InvalidStream event is received', async () => {
      vi.spyOn(client['config'], 'getContinueOnFailedApiCall').mockReturnValue(
        true,
      );
      // Arrange
      const mockStream1 = (async function* () {
        yield { type: GeminiEventType.InvalidStream };
      })();
      const mockStream2 = (async function* () {
        yield { type: GeminiEventType.Content, value: 'Continued content' };
      })();

      mockTurnRunFn
        .mockReturnValueOnce(mockStream1)
        .mockReturnValueOnce(mockStream2);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];
      const promptId = 'prompt-id-invalid-stream';
      const signal = new AbortController().signal;

      // Act
      const stream = client.sendMessageStream(initialRequest, signal, promptId);
      const events = await fromAsync(stream);

      // Assert
      expect(events).toEqual([
        { type: GeminiEventType.ModelInfo, value: 'default-routed-model' },
        { type: GeminiEventType.InvalidStream },
        { type: GeminiEventType.ModelInfo, value: 'default-routed-model' },
        { type: GeminiEventType.Content, value: 'Continued content' },
      ]);

      // Verify that turn.run was called twice
      expect(mockTurnRunFn).toHaveBeenCalledTimes(2);

      // First call with original request
      expect(mockTurnRunFn).toHaveBeenNthCalledWith(
        1,
        { model: 'default-routed-model' },
        initialRequest,
        expect.any(AbortSignal),
      );

      // Second call with "Please continue."
      expect(mockTurnRunFn).toHaveBeenNthCalledWith(
        2,
        { model: 'default-routed-model' },
        [{ text: 'System: Please continue.' }],
        expect.any(AbortSignal),
      );
    });

    it('should not recursively call sendMessageStream with "Please continue." when InvalidStream event is received and flag is false', async () => {
      vi.spyOn(client['config'], 'getContinueOnFailedApiCall').mockReturnValue(
        false,
      );
      // Arrange
      const mockStream1 = (async function* () {
        yield { type: GeminiEventType.InvalidStream };
      })();

      mockTurnRunFn.mockReturnValueOnce(mockStream1);

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];
      const promptId = 'prompt-id-invalid-stream';
      const signal = new AbortController().signal;

      // Act
      const stream = client.sendMessageStream(initialRequest, signal, promptId);
      const events = await fromAsync(stream);

      // Assert
      expect(events).toEqual([
        { type: GeminiEventType.ModelInfo, value: 'default-routed-model' },
        { type: GeminiEventType.InvalidStream },
      ]);

      // Verify that turn.run was called only once
      expect(mockTurnRunFn).toHaveBeenCalledTimes(1);
    });

    it('should stop recursing after one retry when InvalidStream events are repeatedly received', async () => {
      vi.spyOn(client['config'], 'getContinueOnFailedApiCall').mockReturnValue(
        true,
      );
      // Arrange
      // Always return a new invalid stream
      mockTurnRunFn.mockImplementation(() =>
        (async function* () {
          yield { type: GeminiEventType.InvalidStream };
        })(),
      );

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      const initialRequest = [{ text: 'Hi' }];
      const promptId = 'prompt-id-infinite-invalid-stream';
      const signal = new AbortController().signal;

      // Act
      const stream = client.sendMessageStream(initialRequest, signal, promptId);
      const events = await fromAsync(stream);

      // Assert
      // We expect 4 events (model_info + original + model_info + 1 retry)
      expect(events.length).toBe(4);
      expect(
        events
          .filter((e) => e.type !== GeminiEventType.ModelInfo)
          .every((e) => e.type === GeminiEventType.InvalidStream),
      ).toBe(true);

      // Verify that turn.run was called twice
      expect(mockTurnRunFn).toHaveBeenCalledTimes(2);
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
          // Assume history is not empty for delta checks
          getHistory: vi
            .fn()
            .mockReturnValue([
              { role: 'user', parts: [{ text: 'previous message' }] },
            ]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;
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
          vi.mocked(ideContextStore.get).mockReturnValue({
            workspaceState: {
              openFiles: [
                {
                  ...currentActiveFile,
                  isActive: true,
                  timestamp: Date.now(),
                },
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
        vi.mocked(ideContextStore.get).mockReturnValue({
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

    describe('Availability Service Integration', () => {
      let mockAvailabilityService: ModelAvailabilityService;

      beforeEach(() => {
        mockAvailabilityService = createAvailabilityServiceMock();

        vi.mocked(mockConfig.getModelAvailabilityService).mockReturnValue(
          mockAvailabilityService,
        );
        vi.mocked(mockConfig.setActiveModel).mockClear();
        mockRouterService.route.mockResolvedValue({
          model: 'model-a',
          reason: 'test',
        });
        vi.mocked(mockConfig.getModelRouterService).mockReturnValue(
          mockRouterService as unknown as ModelRouterService,
        );
        vi.spyOn(policyCatalog, 'getModelPolicyChain').mockReturnValue([
          {
            model: 'model-a',
            isLastResort: false,
            actions: {},
            stateTransitions: {},
          },
          {
            model: 'model-b',
            isLastResort: true,
            actions: {},
            stateTransitions: {},
          },
        ]);

        mockTurnRunFn.mockReturnValue(
          (async function* () {
            yield { type: 'content', value: 'Hello' };
          })(),
        );
      });

      it('should select first available model, set active, and not consume sticky attempt (done lower in chain)', async () => {
        vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue(
          {
            selectedModel: 'model-a',
            attempts: 1,
            skipped: [],
          },
        );
        vi.mocked(mockConfig.getModel).mockReturnValue(
          DEFAULT_GEMINI_MODEL_AUTO,
        );
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-avail',
        );
        await fromAsync(stream);

        expect(
          mockAvailabilityService.selectFirstAvailable,
        ).toHaveBeenCalledWith(['model-a', 'model-b']);
        expect(mockConfig.setActiveModel).toHaveBeenCalledWith('model-a');
        expect(
          mockAvailabilityService.consumeStickyAttempt,
        ).not.toHaveBeenCalled();
        // Ensure turn.run used the selected model
        expect(mockTurnRunFn).toHaveBeenCalledWith(
          expect.objectContaining({ model: 'model-a' }),
          expect.anything(),
          expect.anything(),
        );
      });

      it('should default to last resort model if selection returns null', async () => {
        vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue(
          {
            selectedModel: null,
            skipped: [],
          },
        );
        vi.mocked(mockConfig.getModel).mockReturnValue(
          DEFAULT_GEMINI_MODEL_AUTO,
        );
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-avail-fallback',
        );
        await fromAsync(stream);

        expect(mockConfig.setActiveModel).toHaveBeenCalledWith('model-b'); // Last resort
        expect(
          mockAvailabilityService.consumeStickyAttempt,
        ).not.toHaveBeenCalled();
      });

      it('should reset turn on new message stream', async () => {
        vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue(
          {
            selectedModel: 'model-a',
            skipped: [],
          },
        );
        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-reset',
        );
        await fromAsync(stream);

        expect(mockConfig.resetTurn).toHaveBeenCalled();
      });

      it('should NOT reset turn on invalid stream retry', async () => {
        vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue(
          {
            selectedModel: 'model-a',
            skipped: [],
          },
        );
        // We simulate a retry by calling sendMessageStream with isInvalidStreamRetry=true
        // But the public API doesn't expose that argument directly unless we use the private method or simulate the recursion.
        // We can simulate recursion by mocking turn run to return invalid stream once.

        vi.spyOn(
          client['config'],
          'getContinueOnFailedApiCall',
        ).mockReturnValue(true);
        const mockStream1 = (async function* () {
          yield { type: GeminiEventType.InvalidStream };
        })();
        const mockStream2 = (async function* () {
          yield { type: 'content', value: 'ok' };
        })();
        mockTurnRunFn
          .mockReturnValueOnce(mockStream1)
          .mockReturnValueOnce(mockStream2);

        const stream = client.sendMessageStream(
          [{ text: 'Hi' }],
          new AbortController().signal,
          'prompt-retry',
        );
        await fromAsync(stream);

        // resetTurn should be called once (for the initial call) but NOT for the recursive call
        expect(mockConfig.resetTurn).toHaveBeenCalledTimes(1);
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
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;

        vi.spyOn(client['config'], 'getIdeMode').mockReturnValue(true);
        vi.mocked(ideContextStore.get).mockReturnValue({
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
        vi.mocked(ideContextStore.get).mockReturnValue(initialIdeContext);

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
        vi.mocked(ideContextStore.get).mockReturnValue(newIdeContext);

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
        vi.mocked(ideContextStore.get).mockReturnValue(contextA);

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
        vi.mocked(ideContextStore.get).mockReturnValue(contextB);

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
        vi.mocked(ideContextStore.get).mockReturnValue(contextC);

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
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

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

    it('should abort linked signal when loop is detected', async () => {
      // Arrange
      vi.spyOn(client['loopDetector'], 'turnStarted').mockResolvedValue(false);
      vi.spyOn(client['loopDetector'], 'addAndCheck')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      let capturedSignal: AbortSignal;
      mockTurnRunFn.mockImplementation((_modelConfigKey, _request, signal) => {
        capturedSignal = signal;
        return (async function* () {
          yield { type: 'content', value: 'First event' };
          yield { type: 'content', value: 'Second event' };
        })();
      });

      const mockChat: Partial<GeminiChat> = {
        addHistory: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        getLastPromptTokenCount: vi.fn(),
      };
      client['chat'] = mockChat as GeminiChat;

      // Act
      const stream = client.sendMessageStream(
        [{ text: 'Hi' }],
        new AbortController().signal,
        'prompt-id-loop',
      );

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Assert
      expect(events).toContainEqual({ type: GeminiEventType.LoopDetected });
      expect(capturedSignal!.aborted).toBe(true);
    });
  });

  describe('generateContent', () => {
    it('should call generateContent with the correct parameters', async () => {
      const contents = [{ role: 'user', parts: [{ text: 'hello' }] }];
      const abortSignal = new AbortController().signal;

      await client.generateContent(
        { model: 'test-model' },
        contents,
        abortSignal,
      );

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        {
          model: 'test-model',
          config: {
            abortSignal,
            systemInstruction: getCoreSystemPrompt({} as unknown as Config, ''),
            temperature: 0,
            topP: 1,
          },
          contents,
        },
        'test-session-id',
      );
    });

    it('should use current model from config for content generation', async () => {
      const initialModel = 'test-model';
      const contents = [{ role: 'user', parts: [{ text: 'test' }] }];

      await client.generateContent(
        { model: initialModel },
        contents,
        new AbortController().signal,
      );

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: initialModel,
        }),
        'test-session-id',
      );
    });

    describe('Hook System', () => {
      let mockMessageBus: { publish: Mock; subscribe: Mock };

      beforeEach(() => {
        vi.clearAllMocks();
        mockMessageBus = { publish: vi.fn(), subscribe: vi.fn() };

        // Force override config methods on the client instance
        client['config'].getEnableHooks = vi.fn().mockReturnValue(true);
        client['config'].getMessageBus = vi
          .fn()
          .mockReturnValue(mockMessageBus);
      });

      it('should fire BeforeAgent and AfterAgent exactly once for a simple turn', async () => {
        const promptId = 'test-prompt-hook-1';
        const request = { text: 'Hello Hooks' };
        const signal = new AbortController().signal;
        const { fireBeforeAgentHook, fireAfterAgentHook } = await import(
          './clientHookTriggers.js'
        );

        mockTurnRunFn.mockImplementation(async function* (
          this: MockTurnContext,
        ) {
          this.getResponseText.mockReturnValue('Hook Response');
          yield { type: GeminiEventType.Content, value: 'Hook Response' };
        });

        const stream = client.sendMessageStream(request, signal, promptId);
        while (!(await stream.next()).done);

        expect(fireBeforeAgentHook).toHaveBeenCalledTimes(1);
        expect(fireAfterAgentHook).toHaveBeenCalledTimes(1);
        expect(fireAfterAgentHook).toHaveBeenCalledWith(
          expect.anything(),
          request,
          'Hook Response',
        );

        // Map should be empty
        expect(client['hookStateMap'].size).toBe(0);
      });

      it('should fire BeforeAgent once and AfterAgent once even with recursion', async () => {
        const { checkNextSpeaker } = await import(
          '../utils/nextSpeakerChecker.js'
        );
        vi.mocked(checkNextSpeaker)
          .mockResolvedValueOnce({ next_speaker: 'model', reasoning: 'more' })
          .mockResolvedValueOnce(null);

        const promptId = 'test-prompt-hook-recursive';
        const request = { text: 'Recursion Test' };
        const signal = new AbortController().signal;
        const { fireBeforeAgentHook, fireAfterAgentHook } = await import(
          './clientHookTriggers.js'
        );

        let callCount = 0;
        mockTurnRunFn.mockImplementation(async function* (
          this: MockTurnContext,
        ) {
          callCount++;
          const response = `Response ${callCount}`;
          this.getResponseText.mockReturnValue(response);
          yield { type: GeminiEventType.Content, value: response };
        });

        const stream = client.sendMessageStream(request, signal, promptId);
        while (!(await stream.next()).done);

        // BeforeAgent should fire ONLY once despite multiple internal turns
        expect(fireBeforeAgentHook).toHaveBeenCalledTimes(1);

        // AfterAgent should fire ONLY when the stack unwinds
        expect(fireAfterAgentHook).toHaveBeenCalledTimes(1);

        // Check cumulative response (separated by newline)
        expect(fireAfterAgentHook).toHaveBeenCalledWith(
          expect.anything(),
          request,
          'Response 1\nResponse 2',
        );

        expect(client['hookStateMap'].size).toBe(0);
      });

      it('should use original request in AfterAgent hook even when continuation happened', async () => {
        const { checkNextSpeaker } = await import(
          '../utils/nextSpeakerChecker.js'
        );
        vi.mocked(checkNextSpeaker)
          .mockResolvedValueOnce({ next_speaker: 'model', reasoning: 'more' })
          .mockResolvedValueOnce(null);

        const promptId = 'test-prompt-hook-original-req';
        const request = { text: 'Do something' };
        const signal = new AbortController().signal;
        const { fireAfterAgentHook } = await import('./clientHookTriggers.js');

        mockTurnRunFn.mockImplementation(async function* (
          this: MockTurnContext,
        ) {
          this.getResponseText.mockReturnValue('Ok');
          yield { type: GeminiEventType.Content, value: 'Ok' };
        });

        const stream = client.sendMessageStream(request, signal, promptId);
        while (!(await stream.next()).done);

        expect(fireAfterAgentHook).toHaveBeenCalledWith(
          expect.anything(),
          request, // Should be 'Do something'
          expect.stringContaining('Ok'),
        );
      });

      it('should cleanup state when prompt_id changes', async () => {
        const signal = new AbortController().signal;
        mockTurnRunFn.mockImplementation(async function* (
          this: MockTurnContext,
        ) {
          this.getResponseText.mockReturnValue('Ok');
          yield { type: GeminiEventType.Content, value: 'Ok' };
        });

        client['hookStateMap'].set('old-id', {
          hasFiredBeforeAgent: true,
          cumulativeResponse: 'Old',
          activeCalls: 0,
          originalRequest: { text: 'Old' },
        });
        client['lastPromptId'] = 'old-id';

        const stream = client.sendMessageStream(
          { text: 'New' },
          signal,
          'new-id',
        );
        await stream.next();

        expect(client['hookStateMap'].has('old-id')).toBe(false);
        expect(client['hookStateMap'].has('new-id')).toBe(true);
      });

      it('should stop execution in BeforeAgent when hook returns continue: false', async () => {
        const { fireBeforeAgentHook } = await import('./clientHookTriggers.js');
        vi.mocked(fireBeforeAgentHook).mockResolvedValue({
          shouldStopExecution: () => true,
          getEffectiveReason: () => 'Stopped by hook',
        } as DefaultHookOutput);

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;

        const request = [{ text: 'Hello' }];
        const stream = client.sendMessageStream(
          request,
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual({
          type: GeminiEventType.AgentExecutionStopped,
          value: { reason: 'Stopped by hook' },
        });
        expect(mockChat.addHistory).toHaveBeenCalledWith({
          role: 'user',
          parts: request,
        });
        expect(mockTurnRunFn).not.toHaveBeenCalled();
      });

      it('should block execution in BeforeAgent when hook returns decision: block', async () => {
        const { fireBeforeAgentHook } = await import('./clientHookTriggers.js');
        vi.mocked(fireBeforeAgentHook).mockResolvedValue({
          shouldStopExecution: () => false,
          isBlockingDecision: () => true,
          getEffectiveReason: () => 'Blocked by hook',
        } as DefaultHookOutput);

        const mockChat: Partial<GeminiChat> = {
          addHistory: vi.fn(),
          getHistory: vi.fn().mockReturnValue([]),
          getLastPromptTokenCount: vi.fn(),
        };
        client['chat'] = mockChat as GeminiChat;

        const request = [{ text: 'Hello' }];
        const stream = client.sendMessageStream(
          request,
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual({
          type: GeminiEventType.AgentExecutionBlocked,
          value: {
            reason: 'Blocked by hook',
          },
        });
        expect(mockChat.addHistory).not.toHaveBeenCalled();
        expect(mockTurnRunFn).not.toHaveBeenCalled();
      });

      it('should stop execution in AfterAgent when hook returns continue: false', async () => {
        const { fireAfterAgentHook } = await import('./clientHookTriggers.js');
        vi.mocked(fireAfterAgentHook).mockResolvedValue({
          shouldStopExecution: () => true,
          getEffectiveReason: () => 'Stopped after agent',
        } as DefaultHookOutput);

        mockTurnRunFn.mockImplementation(async function* () {
          yield { type: GeminiEventType.Content, value: 'Hello' };
        });

        const stream = client.sendMessageStream(
          { text: 'Hi' },
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual({
          type: GeminiEventType.AgentExecutionStopped,
          value: { reason: 'Stopped after agent' },
        });
        // sendMessageStream should not recurse
        expect(mockTurnRunFn).toHaveBeenCalledTimes(1);
      });

      it('should yield AgentExecutionBlocked and recurse in AfterAgent when hook returns decision: block', async () => {
        const { fireAfterAgentHook } = await import('./clientHookTriggers.js');
        vi.mocked(fireAfterAgentHook)
          .mockResolvedValueOnce({
            shouldStopExecution: () => false,
            isBlockingDecision: () => true,
            getEffectiveReason: () => 'Please explain',
          } as DefaultHookOutput)
          .mockResolvedValueOnce({
            shouldStopExecution: () => false,
            isBlockingDecision: () => false,
          } as DefaultHookOutput);

        mockTurnRunFn.mockImplementation(async function* () {
          yield { type: GeminiEventType.Content, value: 'Response' };
        });

        const stream = client.sendMessageStream(
          { text: 'Hi' },
          new AbortController().signal,
          'test-prompt',
        );
        const events = await fromAsync(stream);

        expect(events).toContainEqual({
          type: GeminiEventType.AgentExecutionBlocked,
          value: { reason: 'Please explain' },
        });
        // Should have called turn run twice (original + re-prompt)
        expect(mockTurnRunFn).toHaveBeenCalledTimes(2);
        expect(mockTurnRunFn).toHaveBeenNthCalledWith(
          2,
          expect.anything(),
          [{ text: 'Please explain' }],
          expect.anything(),
        );
      });
    });
  });
});
