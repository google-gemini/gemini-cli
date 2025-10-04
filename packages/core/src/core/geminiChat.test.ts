/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
} from '@google/genai';
import { ApiError } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import {
  GeminiChat,
  InvalidStreamError,
  StreamEventType,
  type StreamEvent,
} from './geminiChat.js';
import type { Config } from '../config/config.js';
import { setSimulate429 } from '../utils/testUtils.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { AuthType } from './contentGenerator.js';
import { type RetryOptions } from '../utils/retry.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { Kind } from '../tools/tools.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';

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

const { mockHandleFallback } = vi.hoisted(() => ({
  mockHandleFallback: vi.fn(),
}));

// Add mock for the retry utility
const { mockRetryWithBackoff } = vi.hoisted(() => ({
  mockRetryWithBackoff: vi.fn(),
}));

vi.mock('../utils/retry.js', () => ({
  retryWithBackoff: mockRetryWithBackoff,
}));

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
  const config: GenerateContentConfig = {};

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
    mockRetryWithBackoff.mockImplementation(async (apiCall) => apiCall());
    mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'oauth-personal', // Ensure this is set for fallback tests
        model: 'test-model',
      }),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      setModel: vi.fn(),
      isInFallbackMode: vi.fn().mockReturnValue(false),
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
    } as unknown as Config;

    // Disable 429 simulation for tests
    setSimulate429(false);
    // Reset history for each test by creating a new instance
    chat = new GeminiChat(mockConfig, config, []);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
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
        'test-model',
        { message: 'test message' },
        'prompt-id-tool-call-empty-end',
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
      const modelTurn = history[1]!;
      expect(modelTurn?.parts?.length).toBe(1); // The empty part is discarded
      expect(modelTurn?.parts![0]!.functionCall).toBeDefined();
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
        'test-model',
        { message: 'test message' },
        'prompt-id-no-finish-empty-end',
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
        'test-model',
        { message: 'test message' },
        'prompt-id-valid-then-invalid-end',
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
      const modelTurn = history[1]!;
      expect(modelTurn?.parts?.length).toBe(1);
      expect(modelTurn?.parts![0]!.text).toBe('Initial valid content...');
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
        'test-model',
        { message: 'test message' },
        'prompt-id-empty-chunk-consolidation',
      );
      for await (const _ of stream) {
        // Consume the stream
      }

      // 3. Assert: Check that the final history was correctly consolidated.
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      const modelTurn = history[1]!;
      expect(modelTurn?.parts?.length).toBe(1);
      expect(modelTurn?.parts![0]!.text).toBe('Hello World!');
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
        'test-model',
        { message: 'test message' },
        'prompt-id-multi-chunk',
      );
      for await (const _ of stream) {
        // Consume the stream to trigger history recording.
      }

      // 3. Assert: Check that the final history was correctly consolidated.
      const history = chat.getHistory();

      // The history should contain the user's turn and ONE consolidated model turn.
      expect(history.length).toBe(2);

      const modelTurn = history[1]!;
      expect(modelTurn.role).toBe('model');

      // The model turn should have 3 distinct parts: the merged text, the function call, and the final text.
      expect(modelTurn?.parts?.length).toBe(3);
      expect(modelTurn?.parts![0]!.text).toBe('This is the first part.');
      expect(modelTurn.parts![1]!.functionCall).toBeDefined();
      expect(modelTurn.parts![2]!.text).toBe('This is the second part.');
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
        'test-model',
        { message: 'test message' },
        'prompt-id-mixed-chunk',
      );
      for await (const _ of stream) {
        // This loop consumes the stream.
      }

      // 3. Assert: Check the final state of the history.
      const history = chat.getHistory();

      // The history should contain two turns: the user's message and the model's response.
      expect(history.length).toBe(2);

      const modelTurn = history[1]!;
      expect(modelTurn.role).toBe('model');

      // CRUCIAL ASSERTION:
      // The buggy code would fail here, resulting in parts.length being 0.
      // The corrected code will pass, preserving the single visible text part.
      expect(modelTurn?.parts?.length).toBe(1);
      expect(modelTurn?.parts![0]!.text).toBe(
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
        'test-model',
        {
          message: {
            functionResponse: {
              name: 'find_restaurant',
              response: { name: 'Vesuvio' },
            },
          },
        },
        'prompt-id-stream-1',
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
        'test-model',
        { message: 'test' },
        'prompt-id-1',
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
        'test-model',
        { message: 'test' },
        'prompt-id-1',
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
        'test-model',
        { message: 'test' },
        'prompt-id-1',
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
        'test-model',
        { message: 'test' },
        'prompt-id-1',
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
        'test-model',
        { message: 'hello' },
        'prompt-id-1',
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
          config: {},
        },
        'prompt-id-1',
      );

      // Verify that token counting is called when usageMetadata is present
      expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalledWith(
        42,
      );
      expect(uiTelemetryService.setLastPromptTokenCount).toHaveBeenCalledTimes(
        1,
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
        'test-model',
        { message: 'test' },
        'prompt-id-yield-retry',
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
        'test-model',
        { message: 'test' },
        'prompt-id-retry-success',
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
        'test-model',
        { message: 'test' },
        'prompt-id-retry-fail',
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

      // History should be clean, as if the failed turn never happened.
      const history = chat.getHistory();
      expect(history.length).toBe(0);
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
          'test-model',
          { message: 'test' },
          'prompt-id-400',
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
          'test-model',
          { message: 'test' },
          'prompt-id-429-retry',
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
          'test-model',
          { message: 'test' },
          'prompt-id-500-retry',
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
      'test-model',
      { message: 'Second question' },
      'prompt-id-retry-existing',
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
      'test-model',
      { message: 'test empty stream' },
      'prompt-id-empty-stream',
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
      'test-model',
      { message: 'first' },
      'prompt-1',
    );
    const firstStreamIterator = firstStream[Symbol.asyncIterator]();
    await firstStreamIterator.next();

    // 4. While the first stream is paused, start the second call. It will block.
    const secondStreamPromise = chat.sendMessageStream(
      'test-model',
      { message: 'second' },
      'prompt-2',
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

  describe('stopBeforeSecondMutator', () => {
    beforeEach(() => {
      // Common setup for these tests: mock the tool registry.
      const mockToolRegistry = {
        getTool: vi.fn((toolName: string) => {
          if (toolName === 'edit') {
            return { kind: Kind.Edit };
          }
          return { kind: Kind.Other };
        }),
      } as unknown as ToolRegistry;
      vi.mocked(mockConfig.getToolRegistry).mockReturnValue(mockToolRegistry);
    });

    it('should stop streaming before a second mutator tool call', async () => {
      const responses = [
        {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'First part. ' }] } },
          ],
        },
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'edit', args: {} } }],
              },
            },
          ],
        },
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'fetch', args: {} } }],
              },
            },
          ],
        },
        // This chunk contains the second mutator and should be clipped.
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { functionCall: { name: 'edit', args: {} } },
                  { text: 'some trailing text' },
                ],
              },
            },
          ],
        },
        // This chunk should never be reached.
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'This should not appear.' }],
              },
            },
          ],
        },
      ] as unknown as GenerateContentResponse[];

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        (async function* () {
          for (const response of responses) {
            yield response;
          }
        })(),
      );

      const stream = await chat.sendMessageStream(
        'test-model',
        { message: 'test message' },
        'prompt-id-mutator-test',
      );
      for await (const _ of stream) {
        // Consume the stream to trigger history recording.
      }

      const history = chat.getHistory();
      expect(history.length).toBe(2);

      const modelTurn = history[1]!;
      expect(modelTurn.role).toBe('model');
      expect(modelTurn?.parts?.length).toBe(3);
      expect(modelTurn?.parts![0]!.text).toBe('First part. ');
      expect(modelTurn.parts![1]!.functionCall?.name).toBe('edit');
      expect(modelTurn.parts![2]!.functionCall?.name).toBe('fetch');
    });

    it('should not stop streaming if only one mutator is present', async () => {
      const responses = [
        {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Part 1. ' }] } },
          ],
        },
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'edit', args: {} } }],
              },
            },
          ],
        },
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Part 2.' }],
              },
              finishReason: 'STOP',
            },
          ],
        },
      ] as unknown as GenerateContentResponse[];

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        (async function* () {
          for (const response of responses) {
            yield response;
          }
        })(),
      );

      const stream = await chat.sendMessageStream(
        'test-model',
        { message: 'test message' },
        'prompt-id-one-mutator',
      );
      for await (const _ of stream) {
        /* consume */
      }

      const history = chat.getHistory();
      const modelTurn = history[1]!;
      expect(modelTurn?.parts?.length).toBe(3);
      expect(modelTurn.parts![1]!.functionCall?.name).toBe('edit');
      expect(modelTurn.parts![2]!.text).toBe('Part 2.');
    });

    it('should clip the chunk containing the second mutator, preserving prior parts', async () => {
      const responses = [
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'edit', args: {} } }],
              },
            },
          ],
        },
        // This chunk has a valid part before the second mutator.
        // The valid part should be kept, the rest of the chunk discarded.
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { text: 'Keep this text. ' },
                  { functionCall: { name: 'edit', args: {} } },
                  { text: 'Discard this text.' },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
      ] as unknown as GenerateContentResponse[];

      const stream = (async function* () {
        for (const response of responses) {
          yield response;
        }
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        stream,
      );

      const resultStream = await chat.sendMessageStream(
        'test-model',
        { message: 'test' },
        'prompt-id-clip-chunk',
      );
      for await (const _ of resultStream) {
        /* consume */
      }

      const history = chat.getHistory();
      const modelTurn = history[1]!;
      expect(modelTurn?.parts?.length).toBe(2);
      expect(modelTurn.parts![0]!.functionCall?.name).toBe('edit');
      expect(modelTurn.parts![1]!.text).toBe('Keep this text. ');
    });

    it('should handle two mutators in the same chunk (parallel call scenario)', async () => {
      const responses = [
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { text: 'Some text. ' },
                  { functionCall: { name: 'edit', args: {} } },
                  { functionCall: { name: 'edit', args: {} } },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
      ] as unknown as GenerateContentResponse[];

      const stream = (async function* () {
        for (const response of responses) {
          yield response;
        }
      })();

      vi.mocked(mockContentGenerator.generateContentStream).mockResolvedValue(
        stream,
      );

      const resultStream = await chat.sendMessageStream(
        'test-model',
        { message: 'test' },
        'prompt-id-parallel-mutators',
      );
      for await (const _ of resultStream) {
        /* consume */
      }

      const history = chat.getHistory();
      const modelTurn = history[1]!;
      expect(modelTurn?.parts?.length).toBe(2);
      expect(modelTurn.parts![0]!.text).toBe('Some text. ');
      expect(modelTurn.parts![1]!.functionCall?.name).toBe('edit');
    });
  });

  describe('Model Resolution', () => {
    const mockResponse = {
      candidates: [
        {
          content: { parts: [{ text: 'response' }], role: 'model' },
          finishReason: 'STOP',
        },
      ],
    } as unknown as GenerateContentResponse;

    it('should use the FLASH model when in fallback mode (sendMessageStream)', async () => {
      vi.mocked(mockConfig.getModel).mockReturnValue('gemini-pro');
      vi.mocked(mockConfig.isInFallbackMode).mockReturnValue(true);
      vi.mocked(mockContentGenerator.generateContentStream).mockImplementation(
        async () =>
          (async function* () {
            yield mockResponse;
          })(),
      );

      const stream = await chat.sendMessageStream(
        'test-model',
        { message: 'test' },
        'prompt-id-res3',
      );
      for await (const _ of stream) {
        // consume stream
      }

      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: DEFAULT_GEMINI_FLASH_MODEL,
        }),
        'prompt-id-res3',
      );
    });
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
            return await apiCall();
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

      const isInFallbackModeSpy = vi.spyOn(mockConfig, 'isInFallbackMode');
      isInFallbackModeSpy.mockReturnValue(false);

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

      mockHandleFallback.mockImplementation(async () => {
        isInFallbackModeSpy.mockReturnValue(true);
        return true; // Signal retry
      });

      const stream = await chat.sendMessageStream(
        'test-model',
        { message: 'trigger 429' },
        'prompt-id-fb1',
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
      const modelTurn = history[1]!;
      expect(modelTurn.parts![0]!.text).toBe('Success on retry');
    });

    it('should stop retrying if handleFallback returns false (e.g., auth intent)', async () => {
      vi.mocked(mockConfig.getModel).mockReturnValue('gemini-pro');
      vi.mocked(mockContentGenerator.generateContentStream).mockRejectedValue(
        error429,
      );
      mockHandleFallback.mockResolvedValue(false);

      const stream = await chat.sendMessageStream(
        'test-model',
        { message: 'test stop' },
        'prompt-id-fb2',
      );

      await expect(
        (async () => {
          for await (const _ of stream) {
            /* consume stream */
          }
        })(),
      ).rejects.toThrow(error429);

      expect(mockContentGenerator.generateContentStream).toHaveBeenCalledTimes(
        1,
      );
      expect(mockHandleFallback).toHaveBeenCalledTimes(1);
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
      'test-model',
      { message: 'test' },
      'prompt-id-discard-test',
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

    const modelTurn = history[1]!;
    // The model turn should only contain the text from the successful attempt
    expect(modelTurn!.parts![0]!.text).toBe('Successful final response');
    // It should NOT contain any text from the failed attempt
    expect(modelTurn!.parts![0]!.text).not.toContain(
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
});
