/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ChatCompressionService,
  findCompressSplitPoint,
  modelStringToModelConfigAlias,
} from './chatCompressionService.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import { CompressionStatus } from '../core/turn.js';
import { tokenLimit } from '../core/tokenLimits.js';
import type { GeminiChat } from '../core/geminiChat.js';
import type { Config } from '../config/config.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { getInitialChatHistory } from '../utils/environmentContext.js';

vi.mock('../core/tokenLimits.js');
vi.mock('../telemetry/loggers.js');
vi.mock('../utils/environmentContext.js');

describe('findCompressSplitPoint', () => {
  it('should throw an error for non-positive numbers', () => {
    expect(() => findCompressSplitPoint([], 0)).toThrow(
      'Fraction must be between 0 and 1',
    );
  });

  it('should throw an error for a fraction greater than or equal to 1', () => {
    expect(() => findCompressSplitPoint([], 1)).toThrow(
      'Fraction must be between 0 and 1',
    );
  });

  it('should handle an empty history', () => {
    expect(findCompressSplitPoint([], 0.5)).toBe(0);
  });

  it('should handle a fraction in the middle', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'This is the first message.' }] }, // JSON length: 66 (19%)
      { role: 'model', parts: [{ text: 'This is the second message.' }] }, // JSON length: 68 (40%)
      { role: 'user', parts: [{ text: 'This is the third message.' }] }, // JSON length: 66 (60%)
      { role: 'model', parts: [{ text: 'This is the fourth message.' }] }, // JSON length: 68 (80%)
      { role: 'user', parts: [{ text: 'This is the fifth message.' }] }, // JSON length: 65 (100%)
    ];
    expect(findCompressSplitPoint(history, 0.5)).toBe(4);
  });

  it('should handle a fraction of last index', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'This is the first message.' }] }, // JSON length: 66 (19%)
      { role: 'model', parts: [{ text: 'This is the second message.' }] }, // JSON length: 68 (40%)
      { role: 'user', parts: [{ text: 'This is the third message.' }] }, // JSON length: 66 (60%)
      { role: 'model', parts: [{ text: 'This is the fourth message.' }] }, // JSON length: 68 (80%)
      { role: 'user', parts: [{ text: 'This is the fifth message.' }] }, // JSON length: 65 (100%)
    ];
    expect(findCompressSplitPoint(history, 0.9)).toBe(4);
  });

  it('should handle a fraction of after last index', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'This is the first message.' }] }, // JSON length: 66 (24%)
      { role: 'model', parts: [{ text: 'This is the second message.' }] }, // JSON length: 68 (50%)
      { role: 'user', parts: [{ text: 'This is the third message.' }] }, // JSON length: 66 (74%)
      { role: 'model', parts: [{ text: 'This is the fourth message.' }] }, // JSON length: 68 (100%)
    ];
    expect(findCompressSplitPoint(history, 0.8)).toBe(4);
  });

  it('should return earlier splitpoint if no valid ones are after threshold', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'This is the first message.' }] },
      { role: 'model', parts: [{ text: 'This is the second message.' }] },
      { role: 'user', parts: [{ text: 'This is the third message.' }] },
      { role: 'model', parts: [{ functionCall: { name: 'foo', args: {} } }] },
    ];
    // Can't return 4 because the previous item has a function call.
    expect(findCompressSplitPoint(history, 0.99)).toBe(2);
  });

  it('should handle a history with only one item', () => {
    const historyWithEmptyParts: Content[] = [
      { role: 'user', parts: [{ text: 'Message 1' }] },
    ];
    expect(findCompressSplitPoint(historyWithEmptyParts, 0.5)).toBe(0);
  });

  it('should handle history with weird parts', () => {
    const historyWithEmptyParts: Content[] = [
      { role: 'user', parts: [{ text: 'Message 1' }] },
      {
        role: 'model',
        parts: [{ fileData: { fileUri: 'derp', mimeType: 'text/plain' } }],
      },
      { role: 'user', parts: [{ text: 'Message 2' }] },
    ];
    expect(findCompressSplitPoint(historyWithEmptyParts, 0.5)).toBe(2);
  });

  describe('since-last-prompt strategy', () => {
    it('should split at last user message', () => {
      // GIVEN: History with 10 messages, last user message at index 8
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'msg 1' }] },
        { role: 'model', parts: [{ text: 'response 1' }] },
        { role: 'user', parts: [{ text: 'msg 2' }] },
        { role: 'model', parts: [{ text: 'response 2' }] },
        { role: 'user', parts: [{ text: 'msg 3' }] }, // Index 4
        { role: 'model', parts: [{ text: 'response 3' }] },
        { role: 'user', parts: [{ text: 'msg 4' }] },
        { role: 'model', parts: [{ text: 'response 4' }] },
        { role: 'user', parts: [{ text: 'msg 5' }] }, // Index 8 - last user
        { role: 'model', parts: [{ text: 'response 5' }] },
      ];

      // WHEN: Find split point with since-last-prompt strategy
      const result = findCompressSplitPoint(history, {
        strategy: 'since-last-prompt',
        minMessagesToCompress: 5,
      });

      // THEN: Should split at index 8
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      if (result && typeof result !== 'number') {
        expect(result.splitIndex).toBe(8);
        expect(result.historyToCompress).toHaveLength(8); // 0-7
        expect(result.historyToKeep).toHaveLength(2); // 8-9
      }
    });

    it('should return null if history too short', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'msg 1' }] },
        { role: 'model', parts: [{ text: 'response 1' }] },
      ];

      const result = findCompressSplitPoint(history, {
        strategy: 'since-last-prompt',
        minMessagesToCompress: 5,
      });

      expect(result).toBeNull();
    });

    it('should return null if not enough messages to compress', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'msg 1' }] },
        { role: 'model', parts: [{ text: 'response 1' }] },
        { role: 'user', parts: [{ text: 'msg 2' }] }, // Index 2 - last user
        { role: 'model', parts: [{ text: 'response 2' }] },
      ];

      const result = findCompressSplitPoint(history, {
        strategy: 'since-last-prompt',
        minMessagesToCompress: 5, // Need at least 5, but only have 2
      });

      expect(result).toBeNull();
    });

    it('should return null if no user messages found', () => {
      const history: Content[] = [
        { role: 'model', parts: [{ text: 'response 1' }] },
        { role: 'model', parts: [{ text: 'response 2' }] },
        { role: 'model', parts: [{ text: 'response 3' }] },
      ];

      const result = findCompressSplitPoint(history, {
        strategy: 'since-last-prompt',
      });

      expect(result).toBeNull();
    });
  });
});

describe('modelStringToModelConfigAlias', () => {
  it('should return the default model for unexpected aliases', () => {
    expect(modelStringToModelConfigAlias('gemini-flash-flash')).toBe(
      'chat-compression-default',
    );
  });

  it('should handle valid names', () => {
    expect(modelStringToModelConfigAlias('gemini-3-pro-preview')).toBe(
      'chat-compression-3-pro',
    );
    expect(modelStringToModelConfigAlias('gemini-2.5-pro')).toBe(
      'chat-compression-2.5-pro',
    );
    expect(modelStringToModelConfigAlias('gemini-2.5-flash')).toBe(
      'chat-compression-2.5-flash',
    );
    expect(modelStringToModelConfigAlias('gemini-2.5-flash-lite')).toBe(
      'chat-compression-2.5-flash-lite',
    );
  });
});

describe('ChatCompressionService', () => {
  let service: ChatCompressionService;
  let mockChat: GeminiChat;
  let mockConfig: Config;
  const mockModel = 'gemini-2.5-pro';
  const mockPromptId = 'test-prompt-id';

  beforeEach(() => {
    service = new ChatCompressionService();
    mockChat = {
      getHistory: vi.fn(),
      getLastPromptTokenCount: vi.fn().mockReturnValue(500),
    } as unknown as GeminiChat;

    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'Summary' }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    mockConfig = {
      getCompressionThreshold: vi.fn(),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      } as unknown as BaseLlmClient),
      isInteractive: vi.fn().mockReturnValue(false),
      getContentGenerator: vi.fn().mockReturnValue({
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
      }),
    } as unknown as Config;

    vi.mocked(tokenLimit).mockReturnValue(1000);
    vi.mocked(getInitialChatHistory).mockImplementation(
      async (_config, extraHistory) => extraHistory || [],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return NOOP if history is empty', async () => {
    vi.mocked(mockChat.getHistory).mockReturnValue([]);
    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
    expect(result.newHistory).toBeNull();
  });

  it('should return NOOP if previously failed and not forced', async () => {
    vi.mocked(mockChat.getHistory).mockReturnValue([
      { role: 'user', parts: [{ text: 'hi' }] },
    ]);
    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      true,
    );
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
    expect(result.newHistory).toBeNull();
  });

  it('should return NOOP if under token threshold and not forced', async () => {
    vi.mocked(mockChat.getHistory).mockReturnValue([
      { role: 'user', parts: [{ text: 'hi' }] },
    ]);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600);
    vi.mocked(tokenLimit).mockReturnValue(1000);
    // Threshold is 0.7 * 1000 = 700. 600 < 700, so NOOP.

    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
    expect(result.newHistory).toBeNull();
  });

  it('should compress if over token threshold', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'msg1' }] },
      { role: 'model', parts: [{ text: 'msg2' }] },
      { role: 'user', parts: [{ text: 'msg3' }] },
      { role: 'model', parts: [{ text: 'msg4' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(800);
    vi.mocked(tokenLimit).mockReturnValue(1000);

    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );

    expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
    expect(result.newHistory).not.toBeNull();
    expect(result.newHistory![0].parts![0].text).toBe('Summary');
    expect(mockConfig.getBaseLlmClient().generateContent).toHaveBeenCalled();
  });

  it('should force compress even if under threshold', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'msg1' }] },
      { role: 'model', parts: [{ text: 'msg2' }] },
      { role: 'user', parts: [{ text: 'msg3' }] },
      { role: 'model', parts: [{ text: 'msg4' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(100);
    vi.mocked(tokenLimit).mockReturnValue(1000);

    const result = await service.compress(
      mockChat,
      mockPromptId,
      true, // forced
      mockModel,
      mockConfig,
      false,
    );

    expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
    expect(result.newHistory).not.toBeNull();
  });

  it('should return FAILED if new token count is inflated', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'msg1' }] },
      { role: 'model', parts: [{ text: 'msg2' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(10);
    vi.mocked(tokenLimit).mockReturnValue(1000);

    const longSummary = 'a'.repeat(1000); // Long summary to inflate token count
    vi.mocked(mockConfig.getBaseLlmClient().generateContent).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: longSummary }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    // Override mock to simulate high token count for this specific test
    vi.mocked(mockConfig.getContentGenerator().countTokens).mockResolvedValue({
      totalTokens: 10000,
    });

    const result = await service.compress(
      mockChat,
      mockPromptId,
      true,
      mockModel,
      mockConfig,
      false,
    );

    expect(result.info.compressionStatus).toBe(
      CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
    );
    expect(result.newHistory).toBeNull();
  });

  describe('compress with new options', () => {
    it('should accept userGoal and preserveStrategy options', async () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'msg1' }] },
        { role: 'model', parts: [{ text: 'msg2' }] },
        { role: 'user', parts: [{ text: 'msg3' }] },
        { role: 'model', parts: [{ text: 'msg4' }] },
        { role: 'user', parts: [{ text: 'msg5' }] },
        { role: 'model', parts: [{ text: 'msg6' }] },
        { role: 'user', parts: [{ text: 'msg7' }] },
        { role: 'model', parts: [{ text: 'msg8' }] },
      ];
      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(800);
      vi.mocked(tokenLimit).mockReturnValue(1000);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Summary with goal' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);
      vi.mocked(mockConfig.getBaseLlmClient).mockReturnValue({
        generateContent: mockGenerateContent,
      } as unknown as BaseLlmClient);

      const result = await service.compress(
        mockChat,
        mockPromptId,
        false,
        mockModel,
        mockConfig,
        false,
        {
          userGoal: 'Implementing auth',
          preserveStrategy: 'since-last-prompt',
        },
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
      expect(result.newHistory).not.toBeNull();
      expect(result.info.goalWasSelected).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should use since-last-prompt split when specified', async () => {
      const history: Content[] = Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('model' as const),
        parts: [{ text: `msg ${i + 1}` }],
      }));

      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(1000);
      vi.mocked(tokenLimit).mockReturnValue(2000);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Summary' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);
      vi.mocked(mockConfig.getBaseLlmClient).mockReturnValue({
        generateContent: mockGenerateContent,
      } as unknown as BaseLlmClient);

      const result = await service.compress(
        mockChat,
        mockPromptId,
        false,
        mockModel,
        mockConfig,
        false,
        {
          preserveStrategy: 'since-last-prompt',
        },
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
      // Should preserve fewer messages than percentage strategy (which would keep 30% = 15 messages)
      expect(result.info.messagesPreserved).toBeLessThan(15);
      expect(result.info.messagesPreserved).toBeGreaterThanOrEqual(2);
    });

    it('should extract discarded context summary from XML', async () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'msg1' }] },
        { role: 'model', parts: [{ text: 'msg2' }] },
        { role: 'user', parts: [{ text: 'msg3' }] },
        { role: 'model', parts: [{ text: 'msg4' }] },
      ];
      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(800);
      vi.mocked(tokenLimit).mockReturnValue(1000);

      const mockResponse = `
        <state_snapshot>
          <current_goal>Testing</current_goal>
          <discarded_context_summary>
            Omitted earlier discussion about database setup
          </discarded_context_summary>
        </state_snapshot>
      `;
      const mockGenerateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: mockResponse }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);
      vi.mocked(mockConfig.getBaseLlmClient).mockReturnValue({
        generateContent: mockGenerateContent,
      } as unknown as BaseLlmClient);

      const result = await service.compress(
        mockChat,
        mockPromptId,
        true,
        mockModel,
        mockConfig,
        false,
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
      expect(result.info.discardedContextSummary).toContain(
        'Omitted earlier discussion about database setup',
      );
    });
  });
});
