/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type { Config } from '../../config/config.js';
import type { GeminiClient } from '../../core/client.js';
import type { Content } from '@google/genai';
import { AgentChatHistory } from '../../core/agentChatHistory.js';
import { ContextManager } from '../contextManager.js';

/**
 * Creates a block of synthetic conversation history designed to consume a specific number of tokens.
 * Assumes roughly 4 characters per token for standard English text.
 */
export function createSyntheticHistory(
  numTurns: number,
  tokensPerTurn: number,
): Content[] {
  const history: Content[] = [];
  const charsPerTurn = tokensPerTurn * 4;

  for (let i = 0; i < numTurns; i++) {
    history.push({
      role: 'user',
      parts: [{ text: `User turn ${i}. ` + 'A'.repeat(charsPerTurn) }],
    });
    history.push({
      role: 'model',
      parts: [{ text: `Model response ${i}. ` + 'B'.repeat(charsPerTurn) }],
    });
  }

  return history;
}

/**
 * Creates a fully mocked Config object tailored for Context Component testing.
 */
export function createMockContextConfig(
  overrides?: Record<string, unknown>,
  llmClientOverride?: unknown,
): Config {
  const defaultConfig = {
    isContextManagementEnabled: vi.fn().mockReturnValue(true),
    getContextManagementConfig: vi.fn().mockReturnValue({
      enabled: true,
      strategies: {
        historySquashing: { maxTokensPerNode: 3000 },
        toolMasking: { stringLengthThresholdTokens: 10000 },
        semanticCompression: {
          nodeThresholdTokens: 5000,
          compressionModel: 'gemini-2.5-flash',
        },
      },
      budget: {
        maxTokens: 150000,
        retainedTokens: 65000,
        protectedEpisodes: 1,
        protectSystemEpisode: true,
        maxPressureStrategy: 'truncate',
      },
    }),
    getBaseLlmClient: vi.fn().mockReturnValue(
      llmClientOverride || {
        generateContent: vi.fn().mockResolvedValue({
          text: '<mocked_snapshot>Synthesized state</mocked_snapshot>',
        }),
      },
    ),
    getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
    getTargetDir: vi.fn().mockReturnValue('/tmp'),
    getSessionId: vi.fn().mockReturnValue('test-session'),
  };

  return { ...defaultConfig, ...overrides } as unknown as Config;
}

/**
 * Wires up a full ContextManager component with an AgentChatHistory and active background workers.
 */
export function setupContextComponentTest(config: Config) {
  const chatHistory = new AgentChatHistory();
  const contextManager = new ContextManager(
    config,
    config.getBaseLlmClient() as unknown as GeminiClient,
  );

  // The async worker is now internally managed by ContextManager

  // Subscribe to history to enable the Eager/Opportunistic triggers
  contextManager.subscribeToHistory(chatHistory);

  return { chatHistory, contextManager };
}
