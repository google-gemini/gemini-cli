/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Content } from '@google/genai';
import { GeminiChat, SYNTHETIC_THOUGHT_SIGNATURE } from './geminiChat.js';
import type { Config } from '../config/config.js';
import { DEFAULT_THINKING_MODE } from '../config/models.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => {
      const error = new Error('ENOENT');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }),
    existsSync: vi.fn(() => false),
  },
}));

const { mockLogOrphanedFunctionCallFixed } = vi.hoisted(() => ({
  mockLogOrphanedFunctionCallFixed: vi.fn(),
}));

vi.mock('../telemetry/loggers.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../telemetry/loggers.js')>();
  return {
    ...actual,
    logOrphanedFunctionCallFixed: mockLogOrphanedFunctionCallFixed,
  };
});

describe('GeminiChat History Repair', () => {
  let chat: GeminiChat;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getPreviewFeatures: () => false,
      getContentGeneratorConfig: vi.fn().mockImplementation(() => ({
        authType: 'oauth-personal',
        model: 'gemini-pro',
      })),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/temp'),
      },
      getToolRegistry: vi.fn().mockReturnValue({
        getTool: vi.fn(),
      }),
      modelConfigService: {
        getResolvedConfig: vi.fn().mockImplementation((modelConfigKey) => {
          const model = modelConfigKey.model ?? 'gemini-pro';
          return {
            model,
            generateContentConfig: {
              temperature: 0,
              thinkingConfig: {
                thinkingBudget: DEFAULT_THINKING_MODE,
              },
            },
          };
        }),
      },
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(createAvailabilityServiceMock()),
      getMessageBus: vi.fn().mockReturnValue(createMockMessageBus()),
    } as unknown as Config;

    chat = new GeminiChat(mockConfig);
  });

  describe('ensureActiveLoopHasFunctionResponses', () => {
    it('should add synthetic function responses for missing responses in the history', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Start' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'tool1', args: {} } },
            { functionCall: { name: 'tool2', args: {} } },
          ],
        },
      ];

      const newContents = chat.ensureActiveLoopHasFunctionResponses(
        history,
        'test-model',
      );

      expect(newContents.length).toBe(3);
      expect(newContents[2].role).toBe('user');
      expect(newContents[2].parts?.length).toBe(2);
      expect(newContents[2].parts![0].functionResponse?.name).toBe('tool1');
      expect(newContents[2].parts![1].functionResponse?.name).toBe('tool2');
      expect(newContents[2].parts![0].functionResponse?.response).toEqual({
        status: 'unknown',
        message: expect.stringContaining('unknown'),
      });
      expect(mockLogOrphanedFunctionCallFixed).toHaveBeenCalledTimes(2);
    });

    it('should add missing responses to existing user turn', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Start' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'tool1', args: {} } }],
        },
        {
          role: 'user',
          parts: [{ text: 'Some other user message' }],
        },
      ];

      const newContents = chat.ensureActiveLoopHasFunctionResponses(
        history,
        'test-model',
      );

      expect(newContents.length).toBe(3);
      expect(newContents[2].role).toBe('user');
      expect(newContents[2].parts?.length).toBe(2);
      expect(newContents[2].parts![0].functionResponse?.name).toBe('tool1');
      expect(newContents[2].parts![1].text).toBe('Some other user message');
      expect(mockLogOrphanedFunctionCallFixed).toHaveBeenCalled();
    });

    it('should match responses by ID if provided', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Start' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'tool1',
                id: 'call-1',
                response: { result: 'ok' },
              },
            },
          ],
        },
      ];

      const newContents = chat.ensureActiveLoopHasFunctionResponses(
        history,
        'test-model',
      );

      expect(newContents).toEqual(history);
      expect(mockLogOrphanedFunctionCallFixed).not.toHaveBeenCalled();
    });

    it('should add synthetic response if ID does not match', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Start' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'tool1',
                id: 'call-wrong',
                response: { result: 'ok' },
              },
            },
          ],
        },
      ];

      const newContents = chat.ensureActiveLoopHasFunctionResponses(
        history,
        'test-model',
      );

      expect(newContents[2].parts?.length).toBe(2);
      expect(newContents[2].parts![0].functionResponse?.id).toBe('call-1');
      expect(newContents[2].parts![1].functionResponse?.id).toBe('call-wrong');
      expect(mockLogOrphanedFunctionCallFixed).toHaveBeenCalled();
    });

    it('should repair history regardless of "active loop" interruptions', () => {
      const history: Content[] = [
        {
          role: 'model',
          parts: [{ functionCall: { name: 'old_tool', args: {} } }],
        },
        { role: 'user', parts: [{ text: 'Start' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'new_tool', args: {} } }],
        },
      ];

      const newContents = chat.ensureActiveLoopHasFunctionResponses(
        history,
        'test-model',
      );

      expect(newContents.length).toBe(4);
      expect(newContents[1].parts![0].functionResponse?.name).toBe('old_tool');
      expect(newContents[3].parts![0].functionResponse?.name).toBe('new_tool');
      expect(mockLogOrphanedFunctionCallFixed).toHaveBeenCalledTimes(2);
    });
  });

  describe('ensureActiveLoopHasThoughtSignatures', () => {
    it('should add thoughtSignature to the first functionCall in each model turn of the active loop', () => {
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
            { functionCall: { name: 'find_restaurant', args: {} } },
            { functionCall: { name: 'find_restaurant_2', args: {} } },
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
            { functionCall: { name: 'another_tool', args: {} } },
          ],
        },
      ];

      const newContents = chat.ensureActiveLoopHasThoughtSignatures(history);

      // Outside active loop - unchanged
      expect(newContents[1]?.parts?.[0]).not.toHaveProperty('thoughtSignature');

      // Inside active loop, first model turn
      expect(newContents[3]?.parts?.[0]?.thoughtSignature).toBe(
        SYNTHETIC_THOUGHT_SIGNATURE,
      );
      expect(newContents[3]?.parts?.[1]).not.toHaveProperty('thoughtSignature');

      // Inside active loop, second model turn (already has sig)
      expect(newContents[5]?.parts?.[0]?.thoughtSignature).toBe('existing-sig');
      expect(newContents[5]?.parts?.[1]).not.toHaveProperty('thoughtSignature');
    });

    it('should not modify contents if there is no user text message', () => {
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
    });
  });
});
