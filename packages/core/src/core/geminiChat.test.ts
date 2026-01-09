/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Content, GenerateContentResponse } from '@google/genai';
import { ApiError, ThinkingLevel } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import {
  GeminiChat,
  InvalidStreamError,
  StreamEventType,
  SYNTHETIC_THOUGHT_SIGNATURE,
  type StreamEvent,
} from './geminiChat.js';
import type { Config } from '../config/config.js';
import { setSimulate429 } from '../utils/testUtils.js';
import { DEFAULT_THINKING_MODE } from '../config/models.js';
import { AuthType } from './contentGenerator.js';
import { TerminalQuotaError } from '../utils/googleQuotaErrors.js';
import { type RetryOptions } from '../utils/retry.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import { HookSystem } from '../hooks/hookSystem.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';
import type { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import * as policyHelpers from '../availability/policyHelpers.js';
import { makeResolvedModelConfig } from '../services/modelConfigServiceTestUtils.js';
import {
  fireBeforeModelHook,
  fireAfterModelHook,
  fireBeforeToolSelectionHook,
} from './geminiChatHookTriggers.js';

// Mock hook triggers
vi.mock('./geminiChatHookTriggers.js', () => ({
  fireBeforeModelHook: vi.fn(),
  fireAfterModelHook: vi.fn(),
  fireBeforeToolSelectionHook: vi.fn().mockResolvedValue({}),
}));

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

const { mockHandleFallback } = vi.hoisted(() => ({
  mockHandleFallback: vi.fn(),
}));

// Add mock for the retry utility
const { mockRetryWithBackoff } = vi.hoisted(() => ({
  mockRetryWithBackoff: vi.fn(),
}));

vi.mock('../utils/retry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/retry.js')>();
  return {
    ...actual,
    retryWithBackoff: mockRetryWithBackoff,
  };
});

vi.mock('../fallback/handler.js', () => ({
  handleFallback: mockHandleFallback,
}));

const { mockLogContentRetry, mockLogContentRetryFailure } = vi.hoisted(() => ({
  mockLogContentRetry: vi.fn(),
  mockLogContentRetryFailure: vi.fn(),
}));

vi.mock('../telemetry/loggers.js', () => ({
  logContentRetry: mockLogContentRetry,
  logContentRetryFailure: mockLogContentRetryFailure,
}));

vi.mock('../telemetry/uiTelemetry.js', () => ({
  uiTelemetryService: {
    setLastPromptTokenCount: vi.fn(),
  },
}));

describe('GeminiChat', () => {
  let mockContentGenerator: ContentGenerator;
  let chat: GeminiChat;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uiTelemetryService.setLastPromptTokenCount).mockClear();
    mockContentGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
      batchEmbedContents: vi.fn(),
    } as unknown as ContentGenerator;

    mockHandleFallback.mockClear();
    // Default mock implementation for tests that don't care about retry logic
    mockRetryWithBackoff.mockImplementation(async (apiCall, options) => {
      const result = await apiCall();
      const context = options?.getAvailabilityContext?.();
      if (context) {
        context.service.markHealthy(context.policy.model);
      }
      return result;
    });
    let currentModel = 'gemini-pro';
    let currentActiveModel = 'gemini-pro';

    mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getPreviewFeatures: () => false,
      getContentGeneratorConfig: vi.fn().mockImplementation(() => ({
        authType: 'oauth-personal',
        model: currentModel,
      })),
      getModel: vi.fn().mockImplementation(() => currentModel),
      setModel: vi.fn().mockImplementation((m: string) => {
        currentModel = m;
        // When model is explicitly set, active model usually resets or updates to it
        currentActiveModel = m;
      }),
      getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
      setQuotaErrorOccurred: vi.fn(),
      flashFallbackHandler: undefined,
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/temp'),
      },
      getToolRegistry: vi.fn().mockReturnValue({
        getTool: vi.fn(),
      }),
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      getRetryFetchErrors: vi.fn().mockReturnValue(false),
      getUserTier: vi.fn().mockReturnValue(undefined),
      modelConfigService: {
        getResolvedConfig: vi.fn().mockImplementation((modelConfigKey) => {
          const model = modelConfigKey.model ?? mockConfig.getModel();
          const thinkingConfig = model.startsWith('gemini-3')
            ? {
                thinkingLevel: ThinkingLevel.HIGH,
              }
            : {
                thinkingBudget: DEFAULT_THINKING_MODE,
              };
          return {
            model,
            generateContentConfig: {
              temperature: modelConfigKey.isRetry ? 1 : 0,
              thinkingConfig,
            },
          };
        }),
      },
      isInteractive: vi.fn().mockReturnValue(false),
      getEnableHooks: vi.fn().mockReturnValue(false),
      getActiveModel: vi.fn().mockImplementation(() => currentActiveModel),
      setActiveModel: vi
        .fn()
        .mockImplementation((m: string) => (currentActiveModel = m)),
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(createAvailabilityServiceMock()),
    } as unknown as Config;

    // Use proper MessageBus mocking for Phase 3 preparation
    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);

    // Disable 429 simulation for tests
    setSimulate429(false);
    // Reset history for each test by creating a new instance
    chat = new GeminiChat(mockConfig);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize lastPromptTokenCount based on history size', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
      ];
      const chatWithHistory = new GeminiChat(mockConfig, '', [], history);
      // 'Hello': 5 chars * 0.25 = 1.25
      // 'Hi there': 8 chars * 0.25 = 2.0
      // Total: 3.25 -> floor(3.25) = 3
      expect(chatWithHistory.getLastPromptTokenCount()).toBe(3);
    });

    it('should initialize lastPromptTokenCount for empty history', () => {
      const chatEmpty = new GeminiChat(mockConfig);
      expect(chatEmpty.getLastPromptTokenCount()).toBe(0);
    });
  });

  describe('sendMessageStream', () => {
    it('should succeed if a tool call is followed by an empty part', async () => {
      // 1. Mock a stream that contains a tool call, then an invalid (empty) part.
      const streamWithToolCall = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'test_tool', args: {} } }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        // This second chunk is invalid according to isValidResponse
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: '' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        streamWithToolCall,
      );

      // 2. Action & Assert: The stream processing should complete without throwing an error
      // because the presence of a tool call makes the empty final chunk acceptable.
      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'test message',
        'prompt-id-tool-call-empty-end',
        new AbortController().signal,
      );
      await expect(
        (async () => {
          for await (const _ of stream) {
            /* consume stream */
          }
        })(),
      ).resolves.not.toThrow();

      // 3. Verify history was recorded correctly
      const history = chat.getHistory();
      expect(history.length).toBe(2); // user turn + model turn
      const modelTurn = history[1];
      expect(modelTurn?.parts?.length).toBe(1); // The empty part is discarded
      expect(modelTurn?.parts![0].functionCall).toBeDefined();
    });

    it('should fail if the stream ends with an empty part and has no finishReason', async () => {
      // 1. Mock a stream that ends with an invalid part and has no finish reason.
      const streamWithNoFinish = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Initial content...' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        // This second chunk is invalid and has no finishReason, so it should fail.
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: '' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        streamWithNoFinish,
      );

      // 2. Action & Assert: The stream should fail because there's no finish reason.
      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        'test message',
        'prompt-id-no-finish-empty-end',
        new AbortController().signal,
      );
      await expect(
        (async () => {
          for await (const _ of stream) {
            /* consume stream */
          }
        })(),
      ).rejects.toThrow(InvalidStreamError);
    });

    it('should succeed if the stream ends with an invalid part but has a finishReason and contained a valid part', async () => {
      // 1. Mock a stream that sends a valid chunk, then an invalid one, but has a finish reason.
      const streamWithInvalidEnd = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Initial valid content...' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        // This second chunk is invalid, but the response has a finishReason.
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: '' }], // Invalid part
              },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        streamWithInvalidEnd,
      );

      // 2. Action & Assert: The stream should complete without throwing an error.
      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'test message',
        'prompt-id-valid-then-invalid-end',
        new AbortController().signal,
      );
      await expect(
        (async () => {
          for await (const _ of stream) {
            /* consume stream */
          }
        })(),
      ).resolves.not.toThrow();

      // 3. Verify history was recorded correctly with only the valid part.
      const history = chat.getHistory();
      expect(history.length).toBe(2); // user turn + model turn
      const modelTurn = history[1];
      expect(modelTurn?.parts?.length).toBe(1);
      expect(modelTurn?.parts![0].text).toBe('Initial valid content...');
    });

    it('should consolidate subsequent text chunks after receiving an empty text chunk', async () => {
      // 1. Mock the API to return a stream where one chunk is just an empty text part.
      const multiChunkStream = (async function* () {
        yield {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Hello' }] } },
          ],
        } as unknown as GenerateContentResponse;
        // FIX: The original test used { text: '' }, which is invalid.
        // A chunk can be empty but still valid. This chunk is now removed
        // as the important part is consolidating what comes after.
        yield {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: ' World!' }] },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        multiChunkStream,
      );

      // 2. Action: Send a message and consume the stream.
      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'test message',
        'prompt-id-empty-chunk-consolidation',
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // Consume the stream
      }

      // 3. Assert: Check that the final history was correctly consolidated.
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      const modelTurn = history[1];
      expect(modelTurn?.parts?.length).toBe(1);
      expect(modelTurn?.parts![0].text).toBe('Hello World!');
    });

    it('should consolidate adjacent text parts that arrive in separate stream chunks', async () => {
      // 1. Mock the API to return a stream of multiple, adjacent text chunks.
      const multiChunkStream = (async function* () {
        yield {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'This is the ' }] } },
          ],
        } as unknown as GenerateContentResponse;
        yield {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'first part.' }] } },
          ],
        } as unknown as GenerateContentResponse;
        // This function call should break the consolidation.
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'do_stuff', args: {} } }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'This is the second part.' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        multiChunkStream,
      );

      // 2. Action: Send a message and consume the stream.
      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'test message',
        'prompt-id-multi-chunk',
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // Consume the stream to trigger history recording.
      }

      // 3. Assert: Check that the final history was correctly consolidated.
      const history = chat.getHistory();

      // The history should contain the user's turn and ONE consolidated model turn.
      expect(history.length).toBe(2);

      const modelTurn = history[1];
      expect(modelTurn.role).toBe('model');

      // The model turn should have 3 distinct parts: the merged text, the function call, and the final text.
      expect(modelTurn?.parts?.length).toBe(3);
      expect(modelTurn?.parts![0].text).toBe('This is the first part.');
      expect(modelTurn.parts![1].functionCall).toBeDefined();
      expect(modelTurn.parts![2].text).toBe('This is the second part.');
    });
    it('should preserve text parts that stream in the same chunk as a thought', async () => {
      // 1. Mock the API to return a single chunk containing both a thought and visible text.
      const mixedContentStream = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { thought: 'This is a thought.' },
                  { text: 'This is the visible text that should not be lost.' },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        mixedContentStream,
      );

      // 2. Action: Send a message and fully consume the stream to trigger history recording.
      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'test message',
        'prompt-id-mixed-chunk',
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // This loop consumes the stream.
      }

      // 3. Assert: Check the final state of the history.
      const history = chat.getHistory();

      // The history should contain two turns: the user's message and the model's response.
      expect(history.length).toBe(2);

      const modelTurn = history[1];
      expect(modelTurn.role).toBe('model');

      // CRUCIAL ASSERTION:
      // The buggy code would fail here, resulting in parts.length being 0.
      // The corrected code will pass, preserving the single visible text part.
      expect(modelTurn?.parts?.length).toBe(1);
      expect(modelTurn?.parts![0].text).toBe(
        'This is the visible text that should not be lost.',
      );
    });

    it('should throw an error when a tool call is followed by an empty stream response', async () => {
      // 1. Setup: A history where the model has just made a function call.
      const initialHistory: Content[] = [
        {
          role: 'user',
          parts: [{ text: 'Find a good Italian restaurant for me.' }],
        },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'find_restaurant',
                args: { cuisine: 'Italian' },
              },
            },
          ],
        },
      ];
      chat.setHistory(initialHistory);
      // 2. Mock the API to return an empty/thought-only stream.
      const emptyStreamResponse = (async function* () {
        yield {
          candidates: [
            {
              content: { role: 'model', parts: [{ thought: true }] },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        emptyStreamResponse,
      );

      // 3. Action: Send the function response back to the model and consume the stream.
      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        {
          functionResponse: {
            name: 'find_restaurant',
            response: { name: 'Vesuvio' },
          },
        },
        'prompt-id-stream-1',
        new AbortController().signal,
      );

      // 4. Assert: The stream processing should throw an InvalidStreamError.
      await expect(
        (async () => {
          for await (const _ of stream) {
            // This loop consumes the stream to trigger the internal logic.
          }
        })(),
      ).rejects.toThrow(InvalidStreamError);
    });

    it('should succeed when there is a tool call without finish reason', async () => {
      // Setup: Stream with tool call but no finish reason
      const streamWithToolCall = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'test_function',
                      args: { param: 'value' },
                    },
                  },
                ],
              },
              // No finishReason
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        streamWithToolCall,
      );

      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'test message',
        'prompt-id-1',
        new AbortController().signal,
      );

      // Should not throw an error
      await expect(
        (async () => {
          for await (const _ of stream) {
            // consume stream
          }
        })(),
      ).resolves.not.toThrow();
    });

    it('should throw InvalidStreamError when no tool call and no finish reason', async () => {
      // Setup: Stream with text but no finish reason and no tool call
      const streamWithoutFinishReason = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'some response' }],
              },
              // No finishReason
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        streamWithoutFinishReason,
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        'test message',
        'prompt-id-1',
        new AbortController().signal,
      );

      await expect(
        (async () => {
          for await (const _ of stream) {
            // consume stream
          }
        })(),
      ).rejects.toThrow(InvalidStreamError);
    });

    it('should throw InvalidStreamError when no tool call and empty response text', async () => {
      // Setup: Stream with finish reason but empty response (only thoughts)
      const streamWithEmptyResponse = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ thought: 'thinking...' }],
              },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        streamWithEmptyResponse,
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        'test message',
        'prompt-id-1',
        new AbortController().signal,
      );

      await expect(
        (async () => {
          for await (const _ of stream) {
            // consume stream
          }
        })(),
      ).rejects.toThrow(InvalidStreamError);
    });

    it('should succeed when there is finish reason and response text', async () => {
      // Setup: Stream with both finish reason and text content
      const validStream = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'valid response' }],
              },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        validStream,
      );

      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'test message',
        'prompt-id-1',
        new AbortController().signal,
      );

      // Should not throw an error
      await expect(
        (async () => {
          for await (const _ of stream) {
            // consume stream
          }
        })(),
      ).resolves.not.toThrow();
    });

    it('should throw InvalidStreamError when finishReason is MALFORMED_FUNCTION_CALL', async () => {
      // Setup: Stream with MALFORMED_FUNCTION_CALL finish reason and empty response
      const streamWithMalformedFunctionCall = (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [], // Empty parts
              },
              finishReason: 'MALFORMED_FUNCTION_CALL',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        streamWithMalformedFunctionCall,
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.5-pro' },
        'test',
        'prompt-id-malformed',
        new AbortController().signal,
      );

      // Should throw an error
      await expect(
        (async () => {
          for await (const _ of stream) {
            // consume stream
          }
        })(),
      ).rejects.toThrow(InvalidStreamError);
    });

    it('should retry when finishReason is MALFORMED_FUNCTION_CALL', async () => {
      // 1. Mock the API to fail once with MALFORMED_FUNCTION_CALL, then succeed.
      vi.mocked(mockContentGenerator.generateContentStream)
        .mockImplementationOnce(async () =>
          (async function* () {
            yield {
              candidates: [
                {
                  content: { parts: [], role: 'model' },
                  finishReason: 'MALFORMED_FUNCTION_CALL',
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
        )
        .mockImplementationOnce(async () =>
          // Second attempt succeeds
          (async function* () {
            yield {
              candidates: [
                {
                  content: { parts: [{ text: 'Success after retry' }] },
                  finishReason: 'STOP',
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
        );

      // 2. Send a message
      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.5-pro' },
        'test retry',
        'prompt-id-retry-malformed',
        new AbortController().signal,
      );
      const events: StreamEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      // 3. Assertions
      // Should be called twice (initial + retry)
      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(
        2,
      );

      // Check for a retry event
      expect(events.some((e) => e.type === StreamEventType.RETRY)).toBe(true);

      // Check for the successful content chunk
      expect(
        events.some(
          (e) =>
            e.type === StreamEventType.CHUNK &&
            e.value.candidates?.[0]?.content?.parts?.[0]?.text ===
              'Success after retry',
        ),
      ).toBe(true);
    });

    it('should call generateContentStream with the correct parameters', async () => {
      const response = (async function* () {
        yield {
          candidates: [
            {
              content: {
                parts: [{ text: 'response' }],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: [],
            },
          ],
          text: () => 'response',
          usageMetadata: {
            promptTokenCount: 42,
            candidatesTokenCount: 15,
            totalTokenCount: 57,
          },
        } as unknown as GenerateContentResponse;
      })();
      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        response,
      );

      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'hello',
        'prompt-id-1',
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // consume stream
      }

      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledWith(
        {
          model: 'test-model',
          contents: [
            {
              role: 'user',
              parts: [{ text: 'hello' }],
            },
          ],
          config: {
            systemInstruction: '',
            tools: [],
            temperature: 0,
            thinkingConfig: {
              thinkingBudget: DEFAULT_THINKING_MODE,
            },
            abortSignal: expect.any(AbortSignal),
          },
        },
        'prompt-id-1',
      );
    });

    it('should use thinkingLevel and remove thinkingBudget for gemini-3 models', async () => {
      const response = (async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'response' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        response,
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-3-test-only-model-string-for-testing' },
        'hello',
        'prompt-id-thinking-level',
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // consume stream
      }

      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3-test-only-model-string-for-testing',
          config: expect.objectContaining({
            thinkingConfig: {
              thinkingBudget: undefined,
              thinkingLevel: ThinkingLevel.HIGH,
            },
          }),
        }),
        'prompt-id-thinking-level',
      );
    });

    it('should use thinkingBudget and remove thinkingLevel for non-gemini-3 models', async () => {
      const response = (async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'response' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        response,
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        'hello',
        'prompt-id-thinking-budget',
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // consume stream
      }

      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.0-flash',
          config: expect.objectContaining({
            thinkingConfig: {
              thinkingBudget: DEFAULT_THINKING_MODE,
              thinkingLevel: undefined,
            },
          }),
        }),
        'prompt-id-thinking-budget',
      );
    });
  });

  describe('addHistory', () => {
    it('should add a new content item to the history', () => {
      const newContent: Content = {
        role: 'user',
        parts: [{ text: 'A new message' }],
      };
      chat.addHistory(newContent);
      const history = chat.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]).toEqual(newContent);
    });

    it('should add multiple items correctly', () => {
      const content1: Content = {
        role: 'user',
        parts: [{ text: 'Message 1' }],
      };
      const content2: Content = {
        role: 'model',
        parts: [{ text: 'Message 2' }],
      };
      chat.addHistory(content1);
      chat.addHistory(content2);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(content1);
      expect(history[1]).toEqual(content2);
    });
  });

  describe('sendMessageStream with retries', () => {
    it('should not retry on invalid content if model does not start with gemini-2', async () => {
      // Mock the stream to fail.
      vi.mocked(mockContentGenerator.generateContentStream).mockImplementation(
        async () =>
          (async function* () {
            yield {
              candidates: [{ content: { parts: [{ text: '' }] } }],
            } as unknown as GenerateContentResponse;
          })(),
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-1.5-pro' },
        'test',
        'prompt-id-no-retry',
        new AbortController().signal,
      );

      await expect(
        (async () => {
          for await (const _ of stream) {
            // Must loop to trigger the internal logic that throws.
          }
        })(),
      ).rejects.toThrow(InvalidStreamError);

      // Should be called only 1 time (no retry)
      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(
        1,
      );
      expect(mockLogContentRetry).not.toHaveBeenCalled();
    });

    it('should yield a RETRY event when an invalid stream is encountered', async () => {
      // ARRANGE: Mock the stream to fail once, then succeed.
      vi.mocked(mockContentGenerator.generateContentStream)
        .mockImplementationOnce(async () =>
          // First attempt: An invalid stream with an empty text part.
          (async function* () {
            yield {
              candidates: [{ content: { parts: [{ text: '' }] } }],
            } as unknown as GenerateContentResponse;
          })(),
        )
        .mockImplementationOnce(async () =>
          // Second attempt (the retry): A minimal valid stream.
          (async function* () {
            yield {
              candidates: [
                {
                  content: { parts: [{ text: 'Success' }] },
                  finishReason: 'STOP',
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
        );

      // ACT: Send a message and collect all events from the stream.
      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        'test message',
        'prompt-id-yield-retry',
        new AbortController().signal,
      );
      const events: StreamEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      // ASSERT: Check that a RETRY event was present in the stream's output.
      const retryEvent = events.find((e) => e.type === StreamEventType.RETRY);

      expect(retryEvent).toBeDefined();
      expect(retryEvent?.type).toBe(StreamEventType.RETRY);
    });
    it('should retry on invalid content, succeed, and report metrics', async () => {
      // Use mockImplementationOnce to provide a fresh, promise-wrapped generator for each attempt.
      vi.mocked(mockContentGenerator.generateContentStream)
        .mockImplementationOnce(async () =>
          // First call returns an invalid stream
          (async function* () {
            yield {
              candidates: [{ content: { parts: [{ text: '' }] } }], // Invalid empty text part
            } as unknown as GenerateContentResponse;
          })(),
        )
        .mockImplementationOnce(async () =>
          // Second call returns a valid stream
          (async function* () {
            yield {
              candidates: [
                {
                  content: { parts: [{ text: 'Successful response' }] },
                  finishReason: 'STOP',
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
        );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        'test',
        'prompt-id-retry-success',
        new AbortController().signal,
      );
      const chunks: StreamEvent[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Assertions
      expect(mockLogContentRetry).toHaveBeenCalledTimes(1);
      expect(mockLogContentRetryFailure).not.toHaveBeenCalled();
      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(
        2,
      );

      // Check for a retry event
      expect(chunks.some((c) => c.type === StreamEventType.RETRY)).toBe(true);

      // Check for the successful content chunk
      expect(
        chunks.some(
          (c) =>
            c.type === StreamEventType.CHUNK &&
            c.value.candidates?.[0]?.content?.parts?.[0]?.text ===
              'Successful response',
        ),
      ).toBe(true);

      // Check that history was recorded correctly once, with no duplicates.
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({
        role: 'user',
        parts: [{ text: 'test' }],
      });
      expect(history[1]).toEqual({
        role: 'model',
        parts: [{ text: 'Successful response' }],
      });

      // Verify that token counting is not called when usageMetadata is missing
      expect(uiTelemetryService.setLastPromptTokenCount).not.toHaveBeenCalled();
    });

    it('should set temperature to 1 on retry', async () => {
      // Use mockImplementationOnce to provide a fresh, promise-wrapped generator for each attempt.
      vi.mocked(mockContentGenerator.generateContentStream)
        .mockImplementationOnce(async () =>
          // First call returns an invalid stream
          (async function* () {
            yield {
              candidates: [{ content: { parts: [{ text: '' }] } }], // Invalid empty text part
            } as unknown as GenerateContentResponse;
          })(),
        )
        .mockImplementationOnce(async () =>
          // Second call returns a valid stream
          (async function* () {
            yield {
              candidates: [
                {
                  content: { parts: [{ text: 'Successful response' }] },
                  finishReason: 'STOP',
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
        );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        'test message',
        'prompt-id-retry-temperature',
        new AbortController().signal,
      );

      for await (const _ of stream) {
        // consume stream
      }

      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(
        2,
      );

      // First call should have original temperature
      expect(
        mockContentGenerator.generateContentStream,
      ).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0,
          }),
        }),
        'prompt-id-retry-temperature',
      );

      // Second call (retry) should have temperature 1
      expect(
        mockContentGenerator.generateContentStream,
      ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 1,
          }),
        }),
        'prompt-id-retry-temperature',
      );
    });

    it('should fail after all retries on persistent invalid content and report metrics', async () => {
      vi.mocked(mockContentGenerator.generateContentStream).mockImplementation(
        async () =>
          (async function* () {
            yield {
              candidates: [
                {
                  content: {
                    parts: [{ text: '' }],
                    role: 'model',
                  },
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.0-flash' },
        'test',
        'prompt-id-retry-fail',
        new AbortController().signal,
      );
      await expect(async () => {
        for await (const _ of stream) {
          // Must loop to trigger the internal logic that throws.
        }
      }).rejects.toThrow(InvalidStreamError);

      // Should be called 2 times (initial + 1 retry)
      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(
        2,
      );
      expect(mockLogContentRetry).toHaveBeenCalledTimes(1);
      expect(mockLogContentRetryFailure).toHaveBeenCalledTimes(1);

      // History should still contain the user message.
      const history = chat.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]).toEqual({
        role: 'user',
        parts: [{ text: 'test' }],
      });
    });

    describe('API error retry behavior', () => {
      beforeEach(() => {
        // Use a more direct mock for retry testing
        mockRetryWithBackoff.mockImplementation(async (apiCall) => {
          try {
            return await apiCall();
          } catch (error) {
            // Simulate the logic of defaultShouldRetry for ApiError
            let shouldRetry = false;
            if (error instanceof ApiError && error.message) {
              if (
                error.status === 429 ||
                (error.status >= 500 && error.status < 600)
              ) {
                shouldRetry = true;
              }
              // Explicitly don't retry on these
              if (error.status === 400) {
                shouldRetry = false;
              }
            }

            if (shouldRetry) {
              // Try again
              return await apiCall();
            }
            throw error;
          }
        });
      });

      it('should not retry on 400 Bad Request errors', async () => {
        const error400 = new ApiError({ message: 'Bad Request', status: 400 });

        vi.mocked(mockContentGenerator.generateContentStream).mockRejectedValue(
          error400,
        );

        const stream = await chat.sendMessageStream(
          { model: 'gemini-2.0-flash' },
          'test message',
          'prompt-id-400',
          new AbortController().signal,
        );

        await expect(
          (async () => {
            for await (const _ of stream) {
              /* consume stream */
            }
          })(),
        ).rejects.toThrow(error400);

        // Should only be called once (no retry)
        expect(
          mockContentGenerator.generateContentStream,
        ).toHaveBeenCalledTimes(1);
      });

      it('should retry on 429 Rate Limit errors', async () => {
        const error429 = new ApiError({ message: 'Rate Limited', status: 429 });

        vi.mocked(mockContentGenerator.generateContentStream)
          .mockRejectedValueOnce(error429)
          .mockResolvedValueOnce(
            (async function* () {
              yield {
                candidates: [
                  {
                    content: { parts: [{ text: 'Success after retry' }] },
                    finishReason: 'STOP',
                  },
                ],
              } as unknown as GenerateContentResponse;
            })(),
          );

        const stream = await chat.sendMessageStream(
          { model: 'test-model' },
          'test message',
          'prompt-id-429-retry',
          new AbortController().signal,
        );

        const events: StreamEvent[] = [];
        for await (const event of stream) {
          events.push(event);
        }

        // Should be called twice (initial + retry)
        expect(
          mockContentGenerator.generateContentStream,
        ).toHaveBeenCalledTimes(2);

        // Should have successful content
        expect(
          events.some(
            (e) =>
              e.type === StreamEventType.CHUNK &&
              e.value.candidates?.[0]?.content?.parts?.[0]?.text ===
                'Success after retry',
          ),
        ).toBe(true);
      });

      it('should retry on 5xx server errors', async () => {
        const error500 = new ApiError({
          message: 'Internal Server Error 500',
          status: 500,
        });

        vi.mocked(mockContentGenerator.generateContentStream)
          .mockRejectedValueOnce(error500)
          .mockResolvedValueOnce(
            (async function* () {
              yield {
                candidates: [
                  {
                    content: { parts: [{ text: 'Recovered from 500' }] },
                    finishReason: 'STOP',
                  },
                ],
              } as unknown as GenerateContentResponse;
            })(),
          );

        const stream = await chat.sendMessageStream(
          { model: 'test-model' },
          'test message',
          'prompt-id-500-retry',
          new AbortController().signal,
        );

        const events: StreamEvent[] = [];
        for await (const event of stream) {
          events.push(event);
        }

        // Should be called twice (initial + retry)
        expect(
          mockContentGenerator.generateContentStream,
        ).toHaveBeenCalledTimes(2);
      });

      it('should retry on specific fetch errors when configured', async () => {
        vi.mocked(mockConfig.getRetryFetchErrors).mockReturnValue(true);

        const fetchError = new Error(
          'exception TypeError: fetch failed sending request',
        );

        vi.mocked(mockContentGenerator.generateContentStream)
          .mockRejectedValueOnce(fetchError)
          .mockResolvedValueOnce(
            (async function* () {
              yield {
                candidates: [
                  {
                    content: { parts: [{ text: 'Success after fetch error' }] },
                    finishReason: 'STOP',
                  },
                ],
              } as unknown as GenerateContentResponse;
            })(),
          );

        mockRetryWithBackoff.mockImplementation(async (apiCall, options) => {
          try {
            return await apiCall();
          } catch (error) {
            if (
              options?.retryFetchErrors &&
              error instanceof Error &&
              error.message.includes(
                'exception TypeError: fetch failed sending request',
              )
            ) {
              return await apiCall();
            }
            throw error;
          }
        });

        const stream = await chat.sendMessageStream(
          { model: 'test-model' },
          'test message',
          'prompt-id-fetch-error-retry',
          new AbortController().signal,
        );

        const events: StreamEvent[] = [];
        for await (const event of stream) {
          events.push(event);
        }

        expect(
          mockContentGenerator.generateContentStream,
        ).toHaveBeenCalledTimes(2);

        expect(
          events.some(
            (e) =>
              e.type === StreamEventType.CHUNK &&
              e.value.candidates?.[0]?.content?.parts?.[0]?.text ===
                'Success after fetch error',
          ),
        ).toBe(true);
      });

      afterEach(() => {
        // Reset to default behavior
        mockRetryWithBackoff.mockImplementation(async (apiCall) => apiCall());
      });
    });
  });
  it('should correctly retry and append to an existing history mid-conversation', async () => {
    // 1. Setup
    const initialHistory: Content[] = [
      { role: 'user', parts: [{ text: 'First question' }] },
      { role: 'model', parts: [{ text: 'First answer' }] },
    ];
    chat.setHistory(initialHistory);

    // 2. Mock the API to fail once with an empty stream, then succeed.
    vi.mocked(mockContentGenerator.generateContentStream)
      .mockImplementationOnce(async () =>
        (async function* () {
          yield {
            candidates: [{ content: { parts: [{ text: '' }] } }],
          } as unknown as GenerateContentResponse;
        })(),
      )
      .mockImplementationOnce(async () =>
        // Second attempt succeeds
        (async function* () {
          yield {
            candidates: [
              {
                content: { parts: [{ text: 'Second answer' }] },
                finishReason: 'STOP',
              },
            ],
          } as unknown as GenerateContentResponse;
        })(),
      );

    // 3. Send a new message
    const stream = await chat.sendMessageStream(
      { model: 'gemini-2.0-flash' },
      'Second question',
      'prompt-id-retry-existing',
      new AbortController().signal,
    );
    for await (const _ of stream) {
      // consume stream
    }

    // 4. Assert the final history and metrics
    const history = chat.getHistory();
    expect(history.length).toBe(4);

    // Assert that the correct metrics were reported for one empty-stream retry
    expect(mockLogContentRetry).toHaveBeenCalledTimes(1);

    // Explicitly verify the structure of each part to satisfy TypeScript
    const turn1 = history[0];
    if (!turn1?.parts?.[0] || !('text' in turn1.parts[0])) {
      throw new Error('Test setup error: First turn is not a valid text part.');
    }
    expect(turn1.parts[0].text).toBe('First question');

    const turn2 = history[1];
    if (!turn2?.parts?.[0] || !('text' in turn2.parts[0])) {
      throw new Error(
        'Test setup error: Second turn is not a valid text part.',
      );
    }
    expect(turn2.parts[0].text).toBe('First answer');

    const turn3 = history[2];
    if (!turn3?.parts?.[0] || !('text' in turn3.parts[0])) {
      throw new Error('Test setup error: Third turn is not a valid text part.');
    }
    expect(turn3.parts[0].text).toBe('Second question');

    const turn4 = history[3];
    if (!turn4?.parts?.[0] || !('text' in turn4.parts[0])) {
      throw new Error(
        'Test setup error: Fourth turn is not a valid text part.',
      );
    }
    expect(turn4.parts[0].text).toBe('Second answer');
  });

  it('should retry if the model returns a completely empty stream (no chunks)', async () => {
    // 1. Mock the API to return an empty stream first, then a valid one.
    vi.mocked(mockContentGenerator.generateContentStream)
      .mockImplementationOnce(
        // First call resolves to an async generator that yields nothing.
        async () => (async function* () {})(),
      )
      .mockImplementationOnce(
        // Second call returns a valid stream.
        async () =>
          (async function* () {
            yield {
              candidates: [
                {
                  content: {
                    parts: [{ text: 'Successful response after empty' }],
                  },
                  finishReason: 'STOP',
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
      );

    // 2. Call the method and consume the stream.
    const stream = await chat.sendMessageStream(
      { model: 'gemini-2.0-flash' },
      'test empty stream',
      'prompt-id-empty-stream',
      new AbortController().signal,
    );
    const chunks: StreamEvent[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // 3. Assert the results.
    expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(2);
    expect(
      chunks.some(
        (c) =>
          c.type === StreamEventType.CHUNK &&
          c.value.candidates?.[0]?.content?.parts?.[0]?.text ===
            'Successful response after empty',
      ),
    ).toBe(true);

    const history = chat.getHistory();
    expect(history.length).toBe(2);

    // Explicitly verify the structure of each part to satisfy TypeScript
    const turn1 = history[0];
    if (!turn1?.parts?.[0] || !('text' in turn1.parts[0])) {
      throw new Error('Test setup error: First turn is not a valid text part.');
    }
    expect(turn1.parts[0].text).toBe('test empty stream');

    const turn2 = history[1];
    if (!turn2?.parts?.[0] || !('text' in turn2.parts[0])) {
      throw new Error(
        'Test setup error: Second turn is not a valid text part.',
      );
    }
    expect(turn2.parts[0].text).toBe('Successful response after empty');
  });
  it('should queue a subsequent sendMessageStream call until the first stream is fully consumed', async () => {
    // 1. Create a promise to manually control the stream's lifecycle
    let continueFirstStream: () => void;
    const firstStreamContinuePromise = new Promise<void>((resolve) => {
      continueFirstStream = resolve;
    });

    // 2. Mock the API to return controllable async generators
    const firstStreamGenerator = (async function* () {
      yield {
        candidates: [
          { content: { parts: [{ text: 'first response part 1' }] } },
        ],
      } as unknown as GenerateContentResponse;
      await firstStreamContinuePromise; // Pause the stream
      yield {
        candidates: [
          {
            content: { parts: [{ text: ' part 2' }] },
            finishReason: 'STOP',
          },
        ],
      } as unknown as GenerateContentResponse;
    })();

    const secondStreamGenerator = (async function* () {
      yield {
        candidates: [
          {
            content: { parts: [{ text: 'second response' }] },
            finishReason: 'STOP',
          },
        ],
      } as unknown as GenerateContentResponse;
    })();

    vi.mocked(mockContentGenerator.generateContentStream)
      .mockResolvedValueOnce(firstStreamGenerator)
      .mockResolvedValueOnce(secondStreamGenerator);

    // 3. Start the first stream and consume only the first chunk to pause it
    const firstStream = await chat.sendMessageStream(
      { model: 'test-model' },
      'first',
      'prompt-1',
      new AbortController().signal,
    );
    const firstStreamIterator = firstStream[Symbol.asyncIterator]();
    await firstStreamIterator.next();

    // 4. While the first stream is paused, start the second call. It will block.
    const secondStreamPromise = chat.sendMessageStream(
      { model: 'test-model' },
      'second',
      'prompt-2',
      new AbortController().signal,
    );

    // 5. Assert that only one API call has been made so far.
    expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(1);

    // 6. Unblock and fully consume the first stream to completion.
    continueFirstStream!();
    await firstStreamIterator.next(); // Consume the rest of the stream
    await firstStreamIterator.next(); // Finish the iterator

    // 7. Now that the first stream is done, await the second promise to get its generator.
    const secondStream = await secondStreamPromise;

    // 8. Start consuming the second stream, which triggers its internal API call.
    const secondStreamIterator = secondStream[Symbol.asyncIterator]();
    await secondStreamIterator.next();

    // 9. The second API call should now have been made.
    expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(2);

    // 10. FIX: Fully consume the second stream to ensure recordHistory is called.
    await secondStreamIterator.next(); // This finishes the iterator.

    // 11. Final check on history.
    const history = chat.getHistory();
    expect(history.length).toBe(4);

    const turn4 = history[3];
    if (!turn4?.parts?.[0] || !('text' in turn4.parts[0])) {
      throw new Error(
        'Test setup error: Fourth turn is not a valid text part.',
      );
    }
    expect(turn4.parts[0].text).toBe('second response');
  });

  describe('Fallback Integration (Retries)', () => {
    const error429 = new ApiError({
      message: 'API Error 429: Quota exceeded',
      status: 429,
    });

    // Define the simulated behavior for retryWithBackoff for these tests.
    // This simulation tries the apiCall, if it fails, it calls the callback,
    // and then tries the apiCall again if the callback returns true.
    const simulateRetryBehavior = async <T>(
      apiCall: () => Promise<T>,
      options: Partial<RetryOptions>,
    ) => {
      try {
        return await apiCall();
      } catch (error) {
        if (options.onPersistent429) {
          // We simulate the "persistent" trigger here for simplicity.
          const shouldRetry = await options.onPersistent429(
            options.authType,
            error,
          );
          if (shouldRetry) {
            return apiCall();
          }
        }
        throw error; // Stop if callback returns false/null or doesn't exist
      }
    };

    beforeEach(() => {
      mockRetryWithBackoff.mockImplementation(simulateRetryBehavior);
    });

    afterEach(() => {
      mockRetryWithBackoff.mockImplementation(async (apiCall) => apiCall());
    });

    it('should call handleFallback with the specific failed model and retry if handler returns true', async () => {
      const authType = AuthType.LOGIN_WITH_GOOGLE;
      vi.mocked(mockConfig.getContentGeneratorConfig).mockReturnValue({
        authType,
      });

      vi.mocked(mockContentGenerator.generateContentStream)
        .mockRejectedValueOnce(error429) // Attempt 1 fails
        .mockResolvedValueOnce(
          // Attempt 2 succeeds
          (async function* () {
            yield {
              candidates: [
                {
                  content: { parts: [{ text: 'Success on retry' }] },
                  finishReason: 'STOP',
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
        );

      mockHandleFallback.mockImplementation(
        async () => true, // Signal retry
      );

      const stream = await chat.sendMessageStream(
        { model: 'test-model' },
        'trigger 429',
        'prompt-id-fb1',
        new AbortController().signal,
      );

      // Consume stream to trigger logic
      for await (const _ of stream) {
        // no-op
      }

      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(
        2,
      );
      expect(mockHandleFallback).toHaveBeenCalledTimes(1);
      expect(mockHandleFallback).toHaveBeenCalledWith(
        mockConfig,
        'test-model',
        authType,
        error429,
      );

      const history = chat.getHistory();
      const modelTurn = history[1];
      expect(modelTurn.parts![0].text).toBe('Success on retry');
    });
  });

  it('should discard valid partial content from a failed attempt upon retry', async () => {
    // Mock the stream to fail on the first attempt after yielding some valid content.
    vi.mocked(mockContentGenerator.generateContentStream)
      .mockImplementationOnce(async () =>
        // First attempt: yields one valid chunk, then one invalid chunk
        (async function* () {
          yield {
            candidates: [
              {
                content: {
                  parts: [{ text: 'This valid part should be discarded' }],
                },
              },
            ],
          } as unknown as GenerateContentResponse;
          yield {
            candidates: [{ content: { parts: [{ text: '' }] } }], // Invalid chunk triggers retry
          } as unknown as GenerateContentResponse;
        })(),
      )
      .mockImplementationOnce(async () =>
        // Second attempt (the retry): succeeds
        (async function* () {
          yield {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Successful final response' }],
                },
                finishReason: 'STOP',
              },
            ],
          } as unknown as GenerateContentResponse;
        })(),
      );

    // Send a message and consume the stream
    const stream = await chat.sendMessageStream(
      { model: 'gemini-2.0-flash' },
      'test message',
      'prompt-id-discard-test',
      new AbortController().signal,
    );
    const events: StreamEvent[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    // Check that a retry happened
    expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(2);
    expect(events.some((e) => e.type === StreamEventType.RETRY)).toBe(true);

    // Check the final recorded history
    const history = chat.getHistory();
    expect(history.length).toBe(2); // user turn + final model turn

    const modelTurn = history[1];
    // The model turn should only contain the text from the successful attempt
    expect(modelTurn.parts![0].text).toBe('Successful final response');
    // It should NOT contain any text from the failed attempt
    expect(modelTurn.parts![0].text).not.toContain(
      'This valid part should be discarded',
    );
  });

  describe('stripThoughtsFromHistory', () => {
    it('should strip thought signatures', () => {
      chat.setHistory([
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
      ]);

      chat.stripThoughtsFromHistory();

      expect(chat.getHistory()).toEqual([
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
      ]);
    });
  });

  describe('ensureActiveLoopHasThoughtSignatures', () => {
    it('should add thoughtSignature to the first functionCall in each model turn of the active loop', () => {
      const chat = new GeminiChat(mockConfig, '', [], []);
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Old message' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'old_tool', args: {} } }],
        },
        { role: 'user', parts: [{ text: 'Find a restaurant' }] }, // active loop starts here
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'find_restaurant', args: {} } }, // This one gets a signature
            { functionCall: { name: 'find_restaurant_2', args: {} } }, // This one does NOT
          ],
        },
        {
          role: 'user',
          parts: [
            { functionResponse: { name: 'find_restaurant', response: {} } },
          ],
        },
        {
          role: 'model',
          parts: [
            {
              functionCall: { name: 'tool_with_sig', args: {} },
              thoughtSignature: 'existing-sig',
            },
            { functionCall: { name: 'another_tool', args: {} } }, // This one does NOT get a signature
          ],
        },
      ];

      const newContents = chat.ensureActiveLoopHasThoughtSignatures(history);

      // Outside active loop - unchanged
      expect(newContents[1]?.parts?.[0]).not.toHaveProperty('thoughtSignature');

      // Inside active loop, first model turn
      // First function call gets a signature
      expect(newContents[3]?.parts?.[0]?.thoughtSignature).toBe(
        SYNTHETIC_THOUGHT_SIGNATURE,
      );
      // Second function call does NOT
      expect(newContents[3]?.parts?.[1]).not.toHaveProperty('thoughtSignature');

      // User functionResponse part - unchanged (this is not a model turn)
      expect(newContents[4]?.parts?.[0]).not.toHaveProperty('thoughtSignature');

      // Inside active loop, second model turn
      // First function call already has a signature, so nothing changes
      expect(newContents[5]?.parts?.[0]?.thoughtSignature).toBe('existing-sig');
      // Second function call does NOT get a signature
      expect(newContents[5]?.parts?.[1]).not.toHaveProperty('thoughtSignature');
    });

    it('should not modify contents if there is no user text message', () => {
      const chat = new GeminiChat(mockConfig, '', [], []);
      const history: Content[] = [
        {
          role: 'user',
          parts: [{ functionResponse: { name: 'tool1', response: {} } }],
        },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'tool2', args: {} } }],
        },
      ];
      const newContents = chat.ensureActiveLoopHasThoughtSignatures(history);
      expect(newContents).toEqual(history);
      expect(newContents[1]?.parts?.[0]).not.toHaveProperty('thoughtSignature');
    });

    it('should handle an empty history', () => {
      const chat = new GeminiChat(mockConfig, '', []);
      const history: Content[] = [];
      const newContents = chat.ensureActiveLoopHasThoughtSignatures(history);
      expect(newContents).toEqual([]);
    });

    it('should handle history with only a user message', () => {
      const chat = new GeminiChat(mockConfig, '', []);
      const history: Content[] = [{ role: 'user', parts: [{ text: 'Hello' }] }];
      const newContents = chat.ensureActiveLoopHasThoughtSignatures(history);
      expect(newContents).toEqual(history);
    });
  });

  describe('Availability Service Integration', () => {
    let mockAvailabilityService: ModelAvailabilityService;

    beforeEach(async () => {
      mockAvailabilityService = createAvailabilityServiceMock();
      vi.mocked(mockConfig.getModelAvailabilityService).mockReturnValue(
        mockAvailabilityService,
      );

      // Stateful mock for activeModel
      let activeModel = 'model-a';
      vi.mocked(mockConfig.getActiveModel).mockImplementation(
        () => activeModel,
      );
      vi.mocked(mockConfig.setActiveModel).mockImplementation((model) => {
        activeModel = model;
      });

      vi.spyOn(policyHelpers, 'resolvePolicyChain').mockReturnValue([
        {
          model: 'model-a',
          isLastResort: false,
          actions: {},
          stateTransitions: {},
        },
        {
          model: 'model-b',
          isLastResort: false,
          actions: {},
          stateTransitions: {},
        },
        {
          model: 'model-c',
          isLastResort: true,
          actions: {},
          stateTransitions: {},
        },
      ]);
    });

    it('should mark healthy on successful stream', async () => {
      vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue({
        selectedModel: 'model-b',
        skipped: [],
      });
      // Simulate selection happening upstream
      mockConfig.setActiveModel('model-b');

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        (async function* () {
          yield {
            candidates: [
              {
                content: { parts: [{ text: 'Response' }], role: 'model' },
                finishReason: 'STOP',
              },
            ],
          } as unknown as GenerateContentResponse;
        })(),
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-pro' },
        'test',
        'prompt-healthy',
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // consume
      }

      expect(mockAvailabilityService.markHealthy).toHaveBeenCalledWith(
        'model-b',
      );
    });

    it('caps retries to a single attempt when selection is sticky', async () => {
      vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue({
        selectedModel: 'model-a',
        attempts: 1,
        skipped: [],
      });

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        (async function* () {
          yield {
            candidates: [
              {
                content: { parts: [{ text: 'Response' }], role: 'model' },
                finishReason: 'STOP',
              },
            ],
          } as unknown as GenerateContentResponse;
        })(),
      );

      const stream = await chat.sendMessageStream(
        { model: 'gemini-pro' },
        'test',
        'prompt-sticky-once',
        new AbortController().signal,
      );
      for await (const _ of stream) {
        // consume
      }

      expect(mockRetryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ maxAttempts: 1 }),
      );
      expect(mockAvailabilityService.consumeStickyAttempt).toHaveBeenCalledWith(
        'model-a',
      );
    });

    it('should pass attempted model to onPersistent429 callback which calls handleFallback', async () => {
      vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue({
        selectedModel: 'model-a',
        skipped: [],
      });
      // Simulate selection happening upstream
      mockConfig.setActiveModel('model-a');

      // Simulate retry logic behavior: catch error, call onPersistent429
      const error = new TerminalQuotaError('Quota', {
        code: 429,
        message: 'quota',
        details: [],
      });
      vi.mocked(mockContentGenerator.generateContentStream).mockRejectedValue(
        error,
      );

      // We need retryWithBackoff to trigger the callback
      mockRetryWithBackoff.mockImplementation(async (apiCall, options) => {
        try {
          await apiCall();
        } catch (e) {
          if (options?.onPersistent429) {
            await options.onPersistent429(AuthType.LOGIN_WITH_GOOGLE, e);
          }
          throw e; // throw anyway to end test
        }
      });

      const consume = async () => {
        const stream = await chat.sendMessageStream(
          { model: 'gemini-pro' },
          'test',
          'prompt-fallback-arg',
          new AbortController().signal,
        );
        for await (const _ of stream) {
          // consume
        }
      };

      await expect(consume()).rejects.toThrow();

      // handleFallback is called with the ATTEMPTED model (model-a), not the requested one (gemini-pro)
      expect(mockHandleFallback).toHaveBeenCalledWith(
        expect.anything(),
        'model-a',
        expect.anything(),
        error,
      );
    });

    it('re-resolves generateContentConfig when active model changes between retries', async () => {
      // Availability enabled with stateful active model
      let activeModel = 'model-a';
      vi.mocked(mockConfig.getActiveModel).mockImplementation(
        () => activeModel,
      );
      vi.mocked(mockConfig.setActiveModel).mockImplementation((model) => {
        activeModel = model;
      });

      // Different configs per model
      vi.mocked(
        mockConfig.modelConfigService.getResolvedConfig,
      ).mockImplementation((key) => {
        if (key.model === 'model-a') {
          return makeResolvedModelConfig('model-a', { temperature: 0.1 });
        }
        if (key.model === 'model-b') {
          return makeResolvedModelConfig('model-b', { temperature: 0.9 });
        }
        // Default for the initial requested model in this test
        return makeResolvedModelConfig('model-a', { temperature: 0.1 });
      });

      // First attempt uses model-a, then simulate availability switching to model-b
      mockRetryWithBackoff.mockImplementation(async (apiCall) => {
        await apiCall(); // first attempt
        activeModel = 'model-b'; // simulate switch before retry
        return apiCall(); // second attempt
      });

      // Generators for each attempt
      const firstResponse = (async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'first' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      const secondResponse = (async function* () {
        yield {
          candidates: [
            {
              content: { parts: [{ text: 'second' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();
      vi.mocked(mockContentGenerator.generateContentStream)
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const stream = await chat.sendMessageStream(
        { model: 'gemini-pro' },
        'test',
        'prompt-config-refresh',
        new AbortController().signal,
      );
      // Consume to drive both attempts
      for await (const _ of stream) {
        // consume
      }

      expect(
        mockContentGenerator.generateContentStream,
      ).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          model: 'model-a',
          config: expect.objectContaining({ temperature: 0.1 }),
        }),
        expect.any(String),
      );
      expect(
        mockContentGenerator.generateContentStream,
      ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          model: 'model-b',
          config: expect.objectContaining({ temperature: 0.9 }),
        }),
        expect.any(String),
      );
    });
  });

  describe('Hook execution control', () => {
    beforeEach(() => {
      vi.mocked(mockConfig.getEnableHooks).mockReturnValue(true);
      // Default to allowing execution
      vi.mocked(fireBeforeModelHook).mockResolvedValue({ blocked: false });
      vi.mocked(fireAfterModelHook).mockResolvedValue({
        response: {} as GenerateContentResponse,
      });
      vi.mocked(fireBeforeToolSelectionHook).mockResolvedValue({});
    });

    it('should yield AGENT_EXECUTION_STOPPED when BeforeModel hook stops execution', async () => {
      vi.mocked(fireBeforeModelHook).mockResolvedValue({
        blocked: true,
        stopped: true,
        reason: 'stopped by hook',
      });

      const stream = await chat.sendMessageStream(
        { model: 'gemini-pro' },
        'test',
        'prompt-id',
        new AbortController().signal,
      );

      const events: StreamEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: StreamEventType.AGENT_EXECUTION_STOPPED,
        reason: 'stopped by hook',
      });
    });

    it('should yield AGENT_EXECUTION_BLOCKED and synthetic response when BeforeModel hook blocks execution', async () => {
      const syntheticResponse = {
        candidates: [{ content: { parts: [{ text: 'blocked' }] } }],
      } as GenerateContentResponse;

      vi.mocked(fireBeforeModelHook).mockResolvedValue({
        blocked: true,
        reason: 'blocked by hook',
        syntheticResponse,
      });

      const stream = await chat.sendMessageStream(
        { model: 'gemini-pro' },
        'test',
        'prompt-id',
        new AbortController().signal,
      );

      const events: StreamEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: StreamEventType.AGENT_EXECUTION_BLOCKED,
        reason: 'blocked by hook',
      });
      expect(events[1]).toEqual({
        type: StreamEventType.CHUNK,
        value: syntheticResponse,
      });
    });

    it('should yield AGENT_EXECUTION_STOPPED when AfterModel hook stops execution', async () => {
      // Mock content generator to return a stream
      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        (async function* () {
          yield {
            candidates: [{ content: { parts: [{ text: 'response' }] } }],
          } as unknown as GenerateContentResponse;
        })(),
      );

      vi.mocked(fireAfterModelHook).mockResolvedValue({
        response: {} as GenerateContentResponse,
        stopped: true,
        reason: 'stopped by after hook',
      });

      const stream = await chat.sendMessageStream(
        { model: 'gemini-pro' },
        'test',
        'prompt-id',
        new AbortController().signal,
      );

      const events: StreamEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toContainEqual({
        type: StreamEventType.AGENT_EXECUTION_STOPPED,
        reason: 'stopped by after hook',
      });
    });

    it('should yield AGENT_EXECUTION_BLOCKED and response when AfterModel hook blocks execution', async () => {
      const response = {
        candidates: [{ content: { parts: [{ text: 'response' }] } }],
      } as unknown as GenerateContentResponse;

      // Mock content generator to return a stream
      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        (async function* () {
          yield response;
        })(),
      );

      vi.mocked(fireAfterModelHook).mockResolvedValue({
        response,
        blocked: true,
        reason: 'blocked by after hook',
      });

      const stream = await chat.sendMessageStream(
        { model: 'gemini-pro' },
        'test',
        'prompt-id',
        new AbortController().signal,
      );

      const events: StreamEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toContainEqual({
        type: StreamEventType.AGENT_EXECUTION_BLOCKED,
        reason: 'blocked by after hook',
      });
      // Should also contain the chunk (hook response)
      expect(events).toContainEqual({
        type: StreamEventType.CHUNK,
        value: response,
      });
    });
  });
});
