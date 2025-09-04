/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Content,
  Models,
  GenerateContentConfig,
  Part,
  GenerateContentResponse,
} from '@google/genai';
import {
  GeminiChat,
  EmptyStreamError,
  StreamEventType,
  type StreamEvent,
} from './geminiChat.js';
import type { Config } from '../config/config.js';
import { setSimulate429 } from '../utils/testUtils.js';

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

// Mocks
const mockModelsModule = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
  batchEmbedContents: vi.fn(),
} as unknown as Models;

const { mockLogInvalidChunk, mockLogContentRetry, mockLogContentRetryFailure } =
  vi.hoisted(() => ({
    mockLogInvalidChunk: vi.fn(),
    mockLogContentRetry: vi.fn(),
    mockLogContentRetryFailure: vi.fn(),
  }));

vi.mock('../telemetry/loggers.js', () => ({
  logInvalidChunk: mockLogInvalidChunk,
  logContentRetry: mockLogContentRetry,
  logContentRetryFailure: mockLogContentRetryFailure,
}));

describe('GeminiChat', () => {
  let chat: GeminiChat;
  let mockConfig: Config;
  const config: GenerateContentConfig = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getContentGeneratorConfig: () => ({
        authType: 'oauth-personal',
        model: 'test-model',
      }),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      setModel: vi.fn(),
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
    } as unknown as Config;

    // Disable 429 simulation for tests
    setSimulate429(false);
    // Reset history for each test by creating a new instance
    chat = new GeminiChat(mockConfig, mockModelsModule, config, []);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  describe('sendMessage', () => {
    it('should retain the initial user message when an automatic function call occurs', async () => {
      // 1. Define the user's initial text message. This is the turn that gets dropped by the buggy logic.
      const userInitialMessage: Content = {
        role: 'user',
        parts: [{ text: 'How is the weather in Boston?' }],
      };

      // 2. Mock the full API response, including the automaticFunctionCallingHistory.
      // This history represents the full turn: user asks, model calls tool, tool responds, model answers.
      const mockAfcResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { text: 'The weather in Boston is 72 degrees and sunny.' },
              ],
            },
          },
        ],
        automaticFunctionCallingHistory: [
          userInitialMessage, // The user's turn
          {
            // The model's first response: a tool call
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: 'get_weather',
                  args: { location: 'Boston' },
                },
              },
            ],
          },
          {
            // The tool's response, which has a 'user' role
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'get_weather',
                  response: { temperature: 72, condition: 'sunny' },
                },
              },
            ],
          },
        ],
      } as unknown as GenerateContentResponse;

      vi.mocked(mockModelsModule.generateContent).mockResolvedValue(
        mockAfcResponse,
      );

      // 3. Action: Send the initial message.
      await chat.sendMessage(
        { message: 'How is the weather in Boston?' },
        'prompt-id-afc-bug',
      );

      // 4. Assert: Check the final state of the history.
      const history = chat.getHistory();

      // With the bug, history.length will be 3, because the first user message is dropped.
      // The correct behavior is for the history to contain all 4 turns.
      expect(history.length).toBe(4);

      // Crucially, assert that the very first turn in the history matches the user's initial message.
      // This is the assertion that will fail.
      const firstTurn = history[0]!;
      expect(firstTurn.role).toBe('user');
      expect(firstTurn?.parts![0]!.text).toBe('How is the weather in Boston?');

      // Verify the rest of the history is also correct.
      const secondTurn = history[1]!;
      expect(secondTurn.role).toBe('model');
      expect(secondTurn?.parts![0]!.functionCall).toBeDefined();

      const thirdTurn = history[2]!;
      expect(thirdTurn.role).toBe('user');
      expect(thirdTurn?.parts![0]!.functionResponse).toBeDefined();

      const fourthTurn = history[3]!;
      expect(fourthTurn.role).toBe('model');
      expect(fourthTurn?.parts![0]!.text).toContain('72 degrees and sunny');
    });

    it('should throw an error when attempting to add a user turn after another user turn', async () => {
      // 1. Setup: Create a history that already ends with a user turn (a functionResponse).
      const initialHistory: Content[] = [
        { role: 'user', parts: [{ text: 'Initial prompt' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'test_tool', args: {} } }],
        },
        {
          role: 'user',
          parts: [{ functionResponse: { name: 'test_tool', response: {} } }],
        },
      ];
      chat.setHistory(initialHistory);

      // 2. Mock a valid model response so the call doesn't fail for other reasons.
      const mockResponse = {
        candidates: [
          { content: { role: 'model', parts: [{ text: 'some response' }] } },
        ],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockModelsModule.generateContent).mockResolvedValue(
        mockResponse,
      );

      // 3. Action & Assert: Expect that sending another user message immediately
      //    after a user-role turn throws the specific error.
      await expect(
        chat.sendMessage(
          { message: 'This is an invalid consecutive user message' },
          'prompt-id-1',
        ),
      ).rejects.toThrow('Cannot add a user turn after another user turn.');
    });
    it('should preserve text parts that are in the same response as a thought', async () => {
      // 1. Mock the API to return a single response containing both a thought and visible text.
      const mixedContentResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { thought: 'This is a thought.' },
                { text: 'This is the visible text that should not be lost.' },
              ],
            },
          },
        ],
      } as unknown as GenerateContentResponse;

      vi.mocked(mockModelsModule.generateContent).mockResolvedValue(
        mixedContentResponse,
      );

      // 2. Action: Send a standard, non-streaming message.
      await chat.sendMessage(
        { message: 'test message' },
        'prompt-id-mixed-response',
      );

      // 3. Assert: Check the final state of the history.
      const history = chat.getHistory();

      // The history should contain two turns: the user's message and the model's response.
      expect(history.length).toBe(2);

      const modelTurn = history[1]!;
      expect(modelTurn.role).toBe('model');

      // CRUCIAL ASSERTION:
      // Buggy code would discard the entire response because a "thought" was present,
      // resulting in an empty placeholder turn with 0 parts.
      // The corrected code will pass, preserving the single visible text part.
      expect(modelTurn?.parts?.length).toBe(1);
      expect(modelTurn?.parts![0]!.text).toBe(
        'This is the visible text that should not be lost.',
      );
    });
    it('should add a placeholder model turn when a tool call is followed by an empty model response', async () => {
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

      // 2. Mock the API to return an empty/thought-only response.
      const emptyModelResponse = {
        candidates: [
          { content: { role: 'model', parts: [{ thought: true }] } },
        ],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockModelsModule.generateContent).mockResolvedValue(
        emptyModelResponse,
      );

      // 3. Action: Send the function response back to the model.
      await chat.sendMessage(
        {
          message: {
            functionResponse: {
              name: 'find_restaurant',
              response: { name: 'Vesuvio' },
            },
          },
        },
        'prompt-id-1',
      );

      // 4. Assert: The history should now have four valid, alternating turns.
      const history = chat.getHistory();
      expect(history.length).toBe(4);

      // The final turn must be the empty model placeholder.
      const lastTurn = history[3]!;
      expect(lastTurn.role).toBe('model');
      expect(lastTurn?.parts?.length).toBe(0);

      // The second-to-last turn must be the function response we sent.
      const secondToLastTurn = history[2]!;
      expect(secondToLastTurn.role).toBe('user');
      expect(secondToLastTurn?.parts![0]!.functionResponse).toBeDefined();
    });
    it('should call generateContent with the correct parameters', async () => {
      const response = {
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
      } as unknown as GenerateContentResponse;
      vi.mocked(mockModelsModule.generateContent).mockResolvedValue(response);

      await chat.sendMessage({ message: 'hello' }, 'prompt-id-1');

      expect(mockModelsModule.generateContent).toHaveBeenCalledWith(
        {
          model: 'gemini-pro',
          contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
          config: {},
        },
        'prompt-id-1',
      );
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

      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        streamWithToolCall,
      );

      // 2. Action & Assert: The stream processing should complete without throwing an error
      // because the presence of a tool call makes the empty final chunk acceptable.
      const stream = await chat.sendMessageStream(
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

    it('should succeed if the stream ends with an empty part but has a valid finishReason', async () => {
      // 1. Mock a stream that ends with an invalid part but has a 'STOP' finish reason.
      const streamWithValidFinish = (async function* () {
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
        // This second chunk is invalid, but the finishReason should save it from retrying.
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: '' }],
              },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        streamWithValidFinish,
      );

      // 2. Action & Assert: The stream should complete successfully because the valid
      // finishReason overrides the invalid final chunk.
      const stream = await chat.sendMessageStream(
        { message: 'test message' },
        'prompt-id-valid-finish-empty-end',
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
      expect(history.length).toBe(2);
      const modelTurn = history[1]!;
      expect(modelTurn?.parts?.length).toBe(1); // The empty part is discarded
      expect(modelTurn?.parts![0]!.text).toBe('Initial content...');
    });
    it('should not consolidate text into a part that also contains a functionCall', async () => {
      // 1. Mock the API to stream a malformed part followed by a valid text part.
      const multiChunkStream = (async function* () {
        // This malformed part has both text and a functionCall.
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    text: 'Some text',
                    functionCall: { name: 'do_stuff', args: {} },
                  },
                ],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
        // This valid text part should NOT be merged into the malformed one.
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: ' that should not be merged.' }],
              },
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        multiChunkStream,
      );

      // 2. Action: Send a message and consume the stream.
      const stream = await chat.sendMessageStream(
        { message: 'test message' },
        'prompt-id-malformed-chunk',
      );
      for await (const _ of stream) {
        // Consume the stream to trigger history recording.
      }

      // 3. Assert: Check that the final history was not incorrectly consolidated.
      const history = chat.getHistory();

      expect(history.length).toBe(2);
      const modelTurn = history[1]!;

      // CRUCIAL ASSERTION: There should be two separate parts.
      // The old, non-strict logic would incorrectly merge them, resulting in one part.
      expect(modelTurn?.parts?.length).toBe(2);

      // Verify the contents of each part.
      expect(modelTurn?.parts![0]!.text).toBe('Some text');
      expect(modelTurn?.parts![0]!.functionCall).toBeDefined();
      expect(modelTurn?.parts![1]!.text).toBe(' that should not be merged.');
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
            { content: { role: 'model', parts: [{ text: ' World!' }] } },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        multiChunkStream,
      );

      // 2. Action: Send a message and consume the stream.
      const stream = await chat.sendMessageStream(
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

      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        multiChunkStream,
      );

      // 2. Action: Send a message and consume the stream.
      const stream = await chat.sendMessageStream(
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
            },
          ],
        } as unknown as GenerateContentResponse;
      })();

      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        mixedContentStream,
      );

      // 2. Action: Send a message and fully consume the stream to trigger history recording.
      const stream = await chat.sendMessageStream(
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
    it('should add a placeholder model turn when a tool call is followed by an empty stream response', async () => {
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
            { content: { role: 'model', parts: [{ thought: true }] } },
          ],
        } as unknown as GenerateContentResponse;
      })();
      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        emptyStreamResponse,
      );

      // 3. Action: Send the function response back to the model and consume the stream.
      const stream = await chat.sendMessageStream(
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
      for await (const _ of stream) {
        // This loop consumes the stream to trigger the internal logic.
      }

      // 4. Assert: The history should now have four valid, alternating turns.
      const history = chat.getHistory();
      expect(history.length).toBe(4);

      // The final turn must be the empty model placeholder.
      const lastTurn = history[3]!;
      expect(lastTurn.role).toBe('model');
      expect(lastTurn?.parts?.length).toBe(0);

      // The second-to-last turn must be the function response we sent.
      const secondToLastTurn = history[2]!;
      expect(secondToLastTurn.role).toBe('user');
      expect(secondToLastTurn?.parts![0]!.functionResponse).toBeDefined();
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
        } as unknown as GenerateContentResponse;
      })();
      vi.mocked(mockModelsModule.generateContentStream).mockResolvedValue(
        response,
      );

      const stream = await chat.sendMessageStream(
        { message: 'hello' },
        'prompt-id-1',
      );
      for await (const _ of stream) {
        // consume stream to trigger internal logic
      }

      expect(mockModelsModule.generateContentStream).toHaveBeenCalledWith(
        {
          model: 'gemini-pro',
          contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
          config: {},
        },
        'prompt-id-1',
      );
    });
  });

  describe('recordHistory', () => {
    const userInput: Content = {
      role: 'user',
      parts: [{ text: 'User input' }],
    };

    it('should consolidate all consecutive model turns into a single turn', () => {
      const userInput: Content = {
        role: 'user',
        parts: [{ text: 'User input' }],
      };
      // This simulates a multi-part model response with different part types.
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Thinking...' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'do_stuff', args: {} } }],
        },
      ];

      // @ts-expect-error Accessing private method for testing
      chat.recordHistory(userInput, modelOutput);
      const history = chat.getHistory();

      // The history should contain the user's turn and ONE consolidated model turn.
      // The old code would fail here, resulting in a length of 3.
      //expect(history).toBe([]);
      expect(history.length).toBe(2);

      const modelTurn = history[1]!;
      expect(modelTurn.role).toBe('model');

      // The consolidated turn should contain both the text part and the functionCall part.
      expect(modelTurn?.parts?.length).toBe(2);
      expect(modelTurn?.parts![0]!.text).toBe('Thinking...');
      expect(modelTurn?.parts![1]!.functionCall).toBeDefined();
    });

    it('should add a placeholder model turn when a tool call is followed by an empty response', () => {
      // 1. Setup: A history where the model has just made a function call.
      const initialHistory: Content[] = [
        { role: 'user', parts: [{ text: 'Initial prompt' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'test_tool', args: {} } }],
        },
      ];
      chat.setHistory(initialHistory);

      // 2. Action: The user provides the tool's response, and the model's
      // final output is empty (e.g., just a thought, which gets filtered out).
      const functionResponse: Content = {
        role: 'user',
        parts: [{ functionResponse: { name: 'test_tool', response: {} } }],
      };
      const emptyModelOutput: Content[] = [];

      // @ts-expect-error Accessing private method for testing
      chat.recordHistory(functionResponse, emptyModelOutput, [
        functionResponse,
      ]);

      // 3. Assert: The history should now have four valid, alternating turns.
      const history = chat.getHistory();
      expect(history.length).toBe(4);

      // The final turn must be the empty model placeholder.
      const lastTurn = history[3]!;
      expect(lastTurn.role).toBe('model');
      expect(lastTurn?.parts?.length).toBe(0);

      // The second-to-last turn must be the function response we provided.
      const secondToLastTurn = history[2]!;
      expect(secondToLastTurn.role).toBe('user');
      expect(secondToLastTurn?.parts![0]!.functionResponse).toBeDefined();
    });

    it('should add user input and a single model output to history', () => {
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Model output' }] },
      ];
      // @ts-expect-error Accessing private method for testing
      chat.recordHistory(userInput, modelOutput);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1]).toEqual(modelOutput[0]);
    });

    it('should consolidate adjacent text parts from multiple content objects', () => {
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Part 1.' }] },
        { role: 'model', parts: [{ text: ' Part 2.' }] },
        { role: 'model', parts: [{ text: ' Part 3.' }] },
      ];
      // @ts-expect-error Accessing private method for testing
      chat.recordHistory(userInput, modelOutput);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[1]!.role).toBe('model');
      expect(history[1]!.parts).toEqual([{ text: 'Part 1. Part 2. Part 3.' }]);
    });

    it('should add an empty placeholder turn if modelOutput is empty', () => {
      // This simulates receiving a pre-filtered, thought-only response.
      const emptyModelOutput: Content[] = [];
      // @ts-expect-error Accessing private method for testing
      chat.recordHistory(userInput, emptyModelOutput);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1]!.role).toBe('model');
      expect(history[1]!.parts).toEqual([]);
    });

    it('should preserve model outputs with undefined or empty parts arrays', () => {
      const malformedOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Text part' }] },
        { role: 'model', parts: undefined as unknown as Part[] },
        { role: 'model', parts: [] },
      ];
      // @ts-expect-error Accessing private method for testing
      chat.recordHistory(userInput, malformedOutput);
      const history = chat.getHistory();
      expect(history.length).toBe(4); // userInput + 3 model turns
      expect(history[1]!.parts).toEqual([{ text: 'Text part' }]);
      expect(history[2]!.parts).toBeUndefined();
      expect(history[3]!.parts).toEqual([]);
    });

    it('should not consolidate content with different roles', () => {
      const mixedOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Model 1' }] },
        { role: 'user', parts: [{ text: 'Unexpected User' }] },
        { role: 'model', parts: [{ text: 'Model 2' }] },
      ];
      // @ts-expect-error Accessing private method for testing
      chat.recordHistory(userInput, mixedOutput);
      const history = chat.getHistory();
      expect(history.length).toBe(4); // userInput, model1, unexpected_user, model2
      expect(history[1]).toEqual(mixedOutput[0]);
      expect(history[2]).toEqual(mixedOutput[1]);
      expect(history[3]).toEqual(mixedOutput[2]);
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
      vi.mocked(mockModelsModule.generateContentStream)
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
              candidates: [{ content: { parts: [{ text: 'Success' }] } }],
            } as unknown as GenerateContentResponse;
          })(),
        );

      // ACT: Send a message and collect all events from the stream.
      const stream = await chat.sendMessageStream(
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
      vi.mocked(mockModelsModule.generateContentStream)
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
                { content: { parts: [{ text: 'Successful response' }] } },
              ],
            } as unknown as GenerateContentResponse;
          })(),
        );

      const stream = await chat.sendMessageStream(
        { message: 'test' },
        'prompt-id-retry-success',
      );
      const chunks: StreamEvent[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Assertions
      expect(mockLogInvalidChunk).toHaveBeenCalledTimes(1);
      expect(mockLogContentRetry).toHaveBeenCalledTimes(1);
      expect(mockLogContentRetryFailure).not.toHaveBeenCalled();
      expect(mockModelsModule.generateContentStream).toHaveBeenCalledTimes(2);

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
    });

    it('should fail after all retries on persistent invalid content and report metrics', async () => {
      vi.mocked(mockModelsModule.generateContentStream).mockImplementation(
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

      // This helper function consumes the stream and allows us to test for rejection.
      async function consumeStreamAndExpectError() {
        const stream = await chat.sendMessageStream(
          { message: 'test' },
          'prompt-id-retry-fail',
        );
        for await (const _ of stream) {
          // Must loop to trigger the internal logic that throws.
        }
      }

      await expect(consumeStreamAndExpectError()).rejects.toThrow(
        EmptyStreamError,
      );

      // Should be called 3 times (initial + 2 retries)
      expect(mockModelsModule.generateContentStream).toHaveBeenCalledTimes(3);
      expect(mockLogInvalidChunk).toHaveBeenCalledTimes(3);
      expect(mockLogContentRetry).toHaveBeenCalledTimes(2);
      expect(mockLogContentRetryFailure).toHaveBeenCalledTimes(1);

      // History should be clean, as if the failed turn never happened.
      const history = chat.getHistory();
      expect(history.length).toBe(0);
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
    vi.mocked(mockModelsModule.generateContentStream)
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
            candidates: [{ content: { parts: [{ text: 'Second answer' }] } }],
          } as unknown as GenerateContentResponse;
        })(),
      );

    // 3. Send a new message
    const stream = await chat.sendMessageStream(
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

  describe('concurrency control', () => {
    it('should queue a subsequent sendMessage call until the first one completes', async () => {
      // 1. Create promises to manually control when the API calls resolve
      let firstCallResolver: (value: GenerateContentResponse) => void;
      const firstCallPromise = new Promise<GenerateContentResponse>(
        (resolve) => {
          firstCallResolver = resolve;
        },
      );

      let secondCallResolver: (value: GenerateContentResponse) => void;
      const secondCallPromise = new Promise<GenerateContentResponse>(
        (resolve) => {
          secondCallResolver = resolve;
        },
      );

      // A standard response body for the mock
      const mockResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'response' }], role: 'model' },
          },
        ],
      } as unknown as GenerateContentResponse;

      // 2. Mock the API to return our controllable promises in order
      vi.mocked(mockModelsModule.generateContent)
        .mockReturnValueOnce(firstCallPromise)
        .mockReturnValueOnce(secondCallPromise);

      // 3. Start the first message call. Do not await it yet.
      const firstMessagePromise = chat.sendMessage(
        { message: 'first' },
        'prompt-1',
      );

      // Give the event loop a chance to run the async call up to the `await`
      await new Promise(process.nextTick);

      // 4. While the first call is "in-flight", start the second message call.
      const secondMessagePromise = chat.sendMessage(
        { message: 'second' },
        'prompt-2',
      );

      // 5. CRUCIAL CHECK: At this point, only the first API call should have been made.
      // The second call should be waiting on `sendPromise`.
      expect(mockModelsModule.generateContent).toHaveBeenCalledTimes(1);
      expect(mockModelsModule.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({ parts: [{ text: 'first' }] }),
          ]),
        }),
        'prompt-1',
      );

      // 6. Unblock the first API call and wait for the first message to fully complete.
      firstCallResolver!(mockResponse);
      await firstMessagePromise;

      // Give the event loop a chance to unblock and run the second call.
      await new Promise(process.nextTick);

      // 7. CRUCIAL CHECK: Now, the second API call should have been made.
      expect(mockModelsModule.generateContent).toHaveBeenCalledTimes(2);
      expect(mockModelsModule.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({ parts: [{ text: 'second' }] }),
          ]),
        }),
        'prompt-2',
      );

      // 8. Clean up by resolving the second call.
      secondCallResolver!(mockResponse);
      await secondMessagePromise;
    });
  });
  it('should retry if the model returns a completely empty stream (no chunks)', async () => {
    // 1. Mock the API to return an empty stream first, then a valid one.
    vi.mocked(mockModelsModule.generateContentStream)
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
                },
              ],
            } as unknown as GenerateContentResponse;
          })(),
      );

    // 2. Call the method and consume the stream.
    const stream = await chat.sendMessageStream(
      { message: 'test empty stream' },
      'prompt-id-empty-stream',
    );
    const chunks: StreamEvent[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // 3. Assert the results.
    expect(mockModelsModule.generateContentStream).toHaveBeenCalledTimes(2);
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
        candidates: [{ content: { parts: [{ text: ' part 2' }] } }],
      } as unknown as GenerateContentResponse;
    })();

    const secondStreamGenerator = (async function* () {
      yield {
        candidates: [{ content: { parts: [{ text: 'second response' }] } }],
      } as unknown as GenerateContentResponse;
    })();

    vi.mocked(mockModelsModule.generateContentStream)
      .mockResolvedValueOnce(firstStreamGenerator)
      .mockResolvedValueOnce(secondStreamGenerator);

    // 3. Start the first stream and consume only the first chunk to pause it
    const firstStream = await chat.sendMessageStream(
      { message: 'first' },
      'prompt-1',
    );
    const firstStreamIterator = firstStream[Symbol.asyncIterator]();
    await firstStreamIterator.next();

    // 4. While the first stream is paused, start the second call. It will block.
    const secondStreamPromise = chat.sendMessageStream(
      { message: 'second' },
      'prompt-2',
    );

    // 5. Assert that only one API call has been made so far.
    expect(mockModelsModule.generateContentStream).toHaveBeenCalledTimes(1);

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
    expect(mockModelsModule.generateContentStream).toHaveBeenCalledTimes(2);

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

  it('should discard valid partial content from a failed attempt upon retry', async () => {
    // ARRANGE: Mock the stream to fail on the first attempt after yielding some valid content.
    vi.mocked(mockModelsModule.generateContentStream)
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
              },
            ],
          } as unknown as GenerateContentResponse;
        })(),
      );

    // ACT: Send a message and consume the stream
    const stream = await chat.sendMessageStream(
      { message: 'test' },
      'prompt-id-discard-test',
    );
    const events: StreamEvent[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    // ASSERT
    // Check that a retry happened
    expect(mockModelsModule.generateContentStream).toHaveBeenCalledTimes(2);
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
});
