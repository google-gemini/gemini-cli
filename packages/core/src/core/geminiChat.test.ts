/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Content,
  Models,
  GenerateContentConfig,
  Part,
  GenerateContentResponse,
} from '@google/genai';
import { GeminiChat, EmptyStreamError } from './geminiChat.js';
import { Config } from '../config/config.js';
import { setSimulate429 } from '../utils/testUtils.js';

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

    it('should add user input and a single model output to history', () => {
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Model output' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutput);
      const history = chat.getHistory();
      expect(history).toEqual([userInput, modelOutput[0]]);
    });

    it('should consolidate adjacent model outputs', () => {
      const modelOutputParts: Content[] = [
        { role: 'model', parts: [{ text: 'Model part 1' }] },
        { role: 'model', parts: [{ text: 'Model part 2' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputParts);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Model part 1Model part 2' }]);
    });

    it('should handle a mix of user and model roles in outputContents (though unusual)', () => {
      const mixedOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Model 1' }] },
        { role: 'user', parts: [{ text: 'Unexpected User' }] }, // This should be pushed as is
        { role: 'model', parts: [{ text: 'Model 2' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, mixedOutput);
      const history = chat.getHistory();
      expect(history.length).toBe(4); // user, model1, user_unexpected, model2
      expect(history[0]).toEqual(userInput);
      expect(history[1]).toEqual(mixedOutput[0]);
      expect(history[2]).toEqual(mixedOutput[1]);
      expect(history[3]).toEqual(mixedOutput[2]);
    });

    it('should consolidate multiple adjacent model outputs correctly', () => {
      const modelOutputParts: Content[] = [
        { role: 'model', parts: [{ text: 'M1' }] },
        { role: 'model', parts: [{ text: 'M2' }] },
        { role: 'model', parts: [{ text: 'M3' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputParts);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[1].parts).toEqual([{ text: 'M1M2M3' }]);
    });

    it('should not consolidate if roles are different between model outputs', () => {
      const modelOutputParts: Content[] = [
        { role: 'model', parts: [{ text: 'M1' }] },
        { role: 'user', parts: [{ text: 'Interjecting User' }] },
        { role: 'model', parts: [{ text: 'M2' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputParts);
      const history = chat.getHistory();
      expect(history.length).toBe(4); // user, M1, Interjecting User, M2
      expect(history[1].parts).toEqual([{ text: 'M1' }]);
      expect(history[3].parts).toEqual([{ text: 'M2' }]);
    });

    it('should merge with last history entry if it is also a model output', () => {
      // @ts-expect-error Accessing private property for test setup
      chat.history = [
        userInput,
        { role: 'model', parts: [{ text: 'Initial Model Output' }] },
      ]; // Prime the history

      const newModelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'New Model Part 1' }] },
        { role: 'model', parts: [{ text: 'New Model Part 2' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, newModelOutput); // userInput here is for the *next* turn, but history is already primed

      // Reset and set up a more realistic scenario for merging with existing history
      chat = new GeminiChat(mockConfig, mockModelsModule, config, []);
      const firstUserInput: Content = {
        role: 'user',
        parts: [{ text: 'First user input' }],
      };
      const firstModelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'First model response' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(firstUserInput, firstModelOutput);

      const secondUserInput: Content = {
        role: 'user',
        parts: [{ text: 'Second user input' }],
      };
      const secondModelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Second model response part 1' }] },
        { role: 'model', parts: [{ text: 'Second model response part 2' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(secondUserInput, secondModelOutput);

      const finalHistory = chat.getHistory();
      expect(finalHistory.length).toBe(4); // user1, model1, user2, model2(consolidated)
      expect(finalHistory[0]).toEqual(firstUserInput);
      expect(finalHistory[1]).toEqual(firstModelOutput[0]);
      expect(finalHistory[2]).toEqual(secondUserInput);
      expect(finalHistory[3].role).toBe('model');
      expect(finalHistory[3].parts).toEqual([
        { text: 'Second model response part 1Second model response part 2' },
      ]);
    });

    it('should correctly merge consolidated new output with existing model history', () => {
      // Setup: history ends with a model turn
      const initialUser: Content = {
        role: 'user',
        parts: [{ text: 'Initial user query' }],
      };
      const initialModel: Content = {
        role: 'model',
        parts: [{ text: 'Initial model answer.' }],
      };
      chat = new GeminiChat(mockConfig, mockModelsModule, config, [
        initialUser,
        initialModel,
      ]);

      // New interaction
      const currentUserInput: Content = {
        role: 'user',
        parts: [{ text: 'Follow-up question' }],
      };
      const newModelParts: Content[] = [
        { role: 'model', parts: [{ text: 'Part A of new answer.' }] },
        { role: 'model', parts: [{ text: 'Part B of new answer.' }] },
      ];

      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(currentUserInput, newModelParts);
      const history = chat.getHistory();

      // Expected: initialUser, initialModel, currentUserInput, consolidatedNewModelParts
      expect(history.length).toBe(4);
      expect(history[0]).toEqual(initialUser);
      expect(history[1]).toEqual(initialModel);
      expect(history[2]).toEqual(currentUserInput);
      expect(history[3].role).toBe('model');
      expect(history[3].parts).toEqual([
        { text: 'Part A of new answer.Part B of new answer.' },
      ]);
    });

    it('should handle empty modelOutput array', () => {
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, []);
      const history = chat.getHistory();
      // If modelOutput is empty, it might push a default empty model part depending on isFunctionResponse
      // Assuming isFunctionResponse(userInput) is false for this simple text input
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([]);
    });

    it('should handle aggregating modelOutput', () => {
      const modelOutputUndefinedParts: Content[] = [
        { role: 'model', parts: [{ text: 'First model part' }] },
        { role: 'model', parts: [{ text: 'Second model part' }] },
        { role: 'model', parts: undefined as unknown as Part[] }, // Test undefined parts
        { role: 'model', parts: [{ text: 'Third model part' }] },
        { role: 'model', parts: [] }, // Test empty parts array
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputUndefinedParts);
      const history = chat.getHistory();
      expect(history.length).toBe(5);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([
        { text: 'First model partSecond model part' },
      ]);
      expect(history[2].role).toBe('model');
      expect(history[2].parts).toBeUndefined();
      expect(history[3].role).toBe('model');
      expect(history[3].parts).toEqual([{ text: 'Third model part' }]);
      expect(history[4].role).toBe('model');
      expect(history[4].parts).toEqual([]);
    });

    it('should handle modelOutput with parts being undefined or empty (if they pass initial every check)', () => {
      const modelOutputUndefinedParts: Content[] = [
        { role: 'model', parts: [{ text: 'Text part' }] },
        { role: 'model', parts: undefined as unknown as Part[] }, // Test undefined parts
        { role: 'model', parts: [] }, // Test empty parts array
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputUndefinedParts);
      const history = chat.getHistory();
      expect(history.length).toBe(4); // userInput, model1 (text), model2 (undefined parts), model3 (empty parts)
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Text part' }]);
      expect(history[2].role).toBe('model');
      expect(history[2].parts).toBeUndefined();
      expect(history[3].role).toBe('model');
      expect(history[3].parts).toEqual([]);
    });

    it('should correctly handle automaticFunctionCallingHistory', () => {
      const afcHistory: Content[] = [
        { role: 'user', parts: [{ text: 'AFC User' }] },
        { role: 'model', parts: [{ text: 'AFC Model' }] },
      ];
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Regular Model Output' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutput, afcHistory);
      const history = chat.getHistory();
      expect(history.length).toBe(3);
      expect(history[0]).toEqual(afcHistory[0]);
      expect(history[1]).toEqual(afcHistory[1]);
      expect(history[2]).toEqual(modelOutput[0]);
    });

    it('should add userInput if AFC history is present but empty', () => {
      const modelOutput: Content[] = [
        { role: 'model', parts: [{ text: 'Model Output' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutput, []); // Empty AFC history
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1]).toEqual(modelOutput[0]);
    });

    it('should skip "thought" content from modelOutput', () => {
      const modelOutputWithThought: Content[] = [
        { role: 'model', parts: [{ thought: true }, { text: 'Visible text' }] },
        { role: 'model', parts: [{ text: 'Another visible text' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputWithThought);
      const history = chat.getHistory();
      expect(history.length).toBe(2); // User input + consolidated model output
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      // The 'thought' part is skipped, 'Another visible text' becomes the first part.
      expect(history[1].parts).toEqual([{ text: 'Another visible text' }]);
    });

    it('should skip "thought" content even if it is the only content', () => {
      const modelOutputOnlyThought: Content[] = [
        { role: 'model', parts: [{ thought: true }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputOnlyThought);
      const history = chat.getHistory();
      expect(history.length).toBe(1); // User input + default empty model part
      expect(history[0]).toEqual(userInput);
    });

    it('should correctly consolidate text parts when a thought part is in between', () => {
      const modelOutputMixed: Content[] = [
        { role: 'model', parts: [{ text: 'Part 1.' }] },
        {
          role: 'model',
          parts: [{ thought: true }, { text: 'Should be skipped' }],
        },
        { role: 'model', parts: [{ text: 'Part 2.' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputMixed);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Part 1.Part 2.' }]);
    });

    it('should handle multiple thought parts correctly', () => {
      const modelOutputMultipleThoughts: Content[] = [
        { role: 'model', parts: [{ thought: true }] },
        { role: 'model', parts: [{ text: 'Visible 1' }] },
        { role: 'model', parts: [{ thought: true }] },
        { role: 'model', parts: [{ text: 'Visible 2' }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputMultipleThoughts);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Visible 1Visible 2' }]);
    });

    it('should handle thought part at the end of outputContents', () => {
      const modelOutputThoughtAtEnd: Content[] = [
        { role: 'model', parts: [{ text: 'Visible text' }] },
        { role: 'model', parts: [{ thought: true }] },
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputThoughtAtEnd);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual(userInput);
      expect(history[1].role).toBe('model');
      expect(history[1].parts).toEqual([{ text: 'Visible text' }]);
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
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Assertions
      expect(mockLogInvalidChunk).toHaveBeenCalledTimes(1);
      expect(mockLogContentRetry).toHaveBeenCalledTimes(1);
      expect(mockLogContentRetryFailure).not.toHaveBeenCalled();
      expect(mockModelsModule.generateContentStream).toHaveBeenCalledTimes(2);
      expect(
        chunks.some(
          (c) =>
            c.candidates?.[0]?.content?.parts?.[0]?.text ===
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
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // 3. Assert the results.
    expect(mockModelsModule.generateContentStream).toHaveBeenCalledTimes(2);
    expect(
      chunks.some(
        (c) =>
          c.candidates?.[0]?.content?.parts?.[0]?.text ===
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
});
