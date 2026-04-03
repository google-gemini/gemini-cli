/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { GeminiChat } from './geminiChat.js';
import type { Config } from '../config/config.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import { ToolOutputMaskingService } from '../services/toolOutputMaskingService.js';
import type { Content, Part } from '@google/genai';

// Mock token calculation to be predictable
vi.mock('../utils/tokenCalculation.js', () => ({
  estimateTokenCountSync: vi.fn(),
}));

describe('GeminiChat Pruning and Masking', () => {
  let mockConfig: Partial<Config>;
  let context: AgentLoopContext;
  let chat: GeminiChat;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      isExperimentalAgentHistoryTruncationEnabled: vi
        .fn()
        .mockReturnValue(true),
      getExperimentalAgentHistoryTruncationThreshold: vi
        .fn()
        .mockReturnValue(1000),
      getExperimentalAgentHistoryRetainedMessages: vi.fn().mockReturnValue(10),
      getToolOutputMaskingConfig: vi.fn().mockResolvedValue({
        enabled: true,
        toolProtectionThreshold: 50,
        minPrunableTokensThreshold: 10,
        protectLatestTurn: true,
      }),
      getSessionId: vi.fn().mockReturnValue('test-session'),
      getProjectRoot: vi.fn().mockReturnValue('/test/project'),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
      getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: 'oauth' }),
      isInteractive: vi.fn().mockReturnValue(false),
      getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/test'),
      } as unknown as Config['storage'],
      modelConfigService: {
        getResolvedConfig: vi.fn().mockReturnValue({ model: 'gemini-pro' }),
      } as unknown as Config['modelConfigService'],
    };

    context = {
      config: mockConfig as Config,
      promptId: 'test-session',
    } as unknown as AgentLoopContext;

    chat = new GeminiChat(context);

    // Default token estimation: 1 token per message for simplicity
    vi.mocked(estimateTokenCountSync).mockImplementation(() => 1);
  });

  describe('History Pruning', () => {
    it('should prune history when turn limit is exceeded', () => {
      (
        mockConfig.getExperimentalAgentHistoryRetainedMessages as Mock
      ).mockReturnValue(4);

      // Add 6 messages (3 turns: user + model)
      for (let i = 0; i < 6; i++) {
        chat.addHistory({
          role: i % 2 === 0 ? 'user' : 'model',
          parts: [{ text: `msg ${i}` }],
        });
      }

      const history = chat.getHistory();
      expect(history.length).toBe(4);
      expect(history[0].parts![0].text).toBe('msg 2');
      expect(history[3].parts![0].text).toBe('msg 5');
    });

    it('should prune history when token limit is exceeded', () => {
      (
        mockConfig.getExperimentalAgentHistoryRetainedMessages as Mock
      ).mockReturnValue(10);
      (
        mockConfig.getExperimentalAgentHistoryTruncationThreshold as Mock
      ).mockReturnValue(5);

      // Mock token count: each message is 2 tokens
      vi.mocked(estimateTokenCountSync).mockImplementation(
        (parts: readonly Part[]) => {
          if (parts.length === 0) return 0;
          // If it's a list of parts from multiple messages
          if (Array.isArray(parts) && parts.length > 1) {
            return parts.length * 2;
          }
          return 2;
        },
      );

      // Add 6 messages. Total tokens should be 12.
      for (let i = 0; i < 6; i++) {
        chat.addHistory({
          role: i % 2 === 0 ? 'user' : 'model',
          parts: [{ text: `msg ${i}` }],
        });
      }

      const history = chat.getHistory();
      // Threshold is 5.
      // 3 messages = 6 tokens (over)
      // 2 messages = 4 tokens (under)
      // So it should prune to 2 messages.
      expect(history.length).toBe(2);
      expect(history[0].parts![0].text).toBe('msg 4');
      expect(history[1].parts![0].text).toBe('msg 5');
    });

    it('should NOT prune if experimental feature is disabled', () => {
      (
        mockConfig.isExperimentalAgentHistoryTruncationEnabled as Mock
      ).mockReturnValue(false);
      (
        mockConfig.getExperimentalAgentHistoryRetainedMessages as Mock
      ).mockReturnValue(4);

      for (let i = 0; i < 6; i++) {
        chat.addHistory({
          role: i % 2 === 0 ? 'user' : 'model',
          parts: [{ text: `msg ${i}` }],
        });
      }

      const history = chat.getHistory();
      expect(history.length).toBe(6);
    });
  });

  describe('Tool Output Masking (Improved)', () => {
    it('should mask large outputs even in the latest turn if they exceed 2x threshold', async () => {
      const maskingService = new ToolOutputMaskingService();

      (mockConfig.getToolOutputMaskingConfig as Mock).mockResolvedValue({
        enabled: true,
        toolProtectionThreshold: 50,
        minPrunableTokensThreshold: 10,
        protectLatestTurn: true,
      });

      const history: Content[] = [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'huge_tool',
                response: { output: 'X'.repeat(1000) },
              },
            },
          ],
        },
      ];

      // Mock token count: huge_tool output is 200 tokens (> 50 * 2)
      vi.mocked(estimateTokenCountSync).mockImplementation(
        (parts: readonly Part[]) => {
          const response = parts[0]?.functionResponse?.response as Record<
            string,
            unknown
          >;
          if (
            typeof response === 'object' &&
            typeof response?.output === 'string' &&
            response.output.includes('tool_output_masked')
          ) {
            return 5; // Small value for masked content
          }
          if (parts[0]?.functionResponse?.name === 'huge_tool') return 200;
          return 1;
        },
      );

      const result = await maskingService.mask(history, mockConfig as Config);
      expect(result.maskedCount).toBe(1);
      expect(JSON.stringify(result.newHistory)).toContain('tool_output_masked');
    });

    it('should NOT mask latest turn if it is below 2x threshold and protectLatestTurn is true', async () => {
      const maskingService = new ToolOutputMaskingService();

      (mockConfig.getToolOutputMaskingConfig as Mock).mockResolvedValue({
        enabled: true,
        toolProtectionThreshold: 50,
        minPrunableTokensThreshold: 10,
        protectLatestTurn: true,
      });

      const history: Content[] = [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'normal_tool',
                response: { output: 'normal' },
              },
            },
          ],
        },
      ];

      // Mock token count: normal_tool output is 60 tokens (> 50 but < 50 * 2)
      vi.mocked(estimateTokenCountSync).mockImplementation(
        (parts: readonly Part[]) => {
          if (parts[0]?.functionResponse?.name === 'normal_tool') return 60;
          return 1;
        },
      );

      const result = await maskingService.mask(history, mockConfig as Config);
      expect(result.maskedCount).toBe(0);
      expect(JSON.stringify(result.newHistory)).not.toContain(
        'tool_output_masked',
      );
    });
  });
});
