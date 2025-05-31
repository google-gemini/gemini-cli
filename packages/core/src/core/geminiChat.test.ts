/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Content,
  GoogleGenAI,
  Models,
  GenerateContentConfig,
  Part,
} from '@google/genai';
import { GeminiChat } from './geminiChat.js';

// Mocks
const mockModelsModule = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
  batchEmbedContents: vi.fn(),
} as unknown as Models;

const mockGoogleGenAI = {
  getGenerativeModel: vi.fn().mockReturnValue(mockModelsModule),
} as unknown as GoogleGenAI;

describe('GeminiChat', () => {
  let chat: GeminiChat;
  const model = 'gemini-pro';
  const config: GenerateContentConfig = {};

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset history for each test by creating a new instance
    chat = new GeminiChat(mockGoogleGenAI, mockModelsModule, model, config, []);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      expect(history[1].parts).toEqual([
        { text: 'Model part 1' },
        { text: 'Model part 2' },
      ]);
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
      expect(history[1].parts).toEqual([
        { text: 'M1' },
        { text: 'M2' },
        { text: 'M3' },
      ]);
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

      // const history = chat.getHistory(); // Removed unused variable to satisfy linter
      // The recordHistory will push the *new* userInput first, then the consolidated newModelOutput.
      // However, the consolidation logic for *outputContents* itself should run, and then the merge with *existing* history.
      // Let's adjust the test to reflect how recordHistory is used: it adds the current userInput, then the model's response to it.

      // Reset and set up a more realistic scenario for merging with existing history
      chat = new GeminiChat(
        mockGoogleGenAI,
        mockModelsModule,
        model,
        config,
        [],
      );
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
        { text: 'Second model response part 1' },
        { text: 'Second model response part 2' },
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
      chat = new GeminiChat(mockGoogleGenAI, mockModelsModule, model, config, [
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
        { text: 'Part A of new answer.' },
        { text: 'Part B of new answer.' },
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

    it('should handle modelOutput with parts being undefined or empty (if they pass initial every check)', () => {
      const modelOutputUndefinedParts: Content[] = [
        { role: 'model', parts: [{ text: 'Text part' }] },
        { role: 'model', parts: undefined as unknown as Part[] }, // Test undefined parts
        { role: 'model', parts: [] }, // Test empty parts array
      ];
      // @ts-expect-error Accessing private method for testing purposes
      chat.recordHistory(userInput, modelOutputUndefinedParts);
      const history = chat.getHistory();
      expect(history.length).toBe(2);
      expect(history[1].role).toBe('model');
      // The consolidation logic should handle undefined/empty parts by spreading `|| []`
      expect(history[1].parts).toEqual([{ text: 'Text part' }]);
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
  });
});
