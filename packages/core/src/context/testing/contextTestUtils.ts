/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type { Config } from '../../config/config.js';

import type { ContextEnvironment } from '../sidecar/environment.js';

export function createMockEnvironment(): ContextEnvironment {
  return {
    getLlmClient: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        text: 'Mock LLM summary response',
      }),
    }) as any,
    getSessionId: vi.fn().mockReturnValue('mock-session'),
    getTraceDir: vi.fn().mockReturnValue('/tmp/.gemini/trace'),
    getProjectTempDir: vi.fn().mockReturnValue('/tmp'),
    getTracer: vi.fn().mockReturnValue({
      logEvent: vi.fn(),
      saveAsset: vi.fn().mockReturnValue('mock-asset-id'),
    }) as any,
    getCharsPerToken: vi.fn().mockReturnValue(1),
  };
}

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
  const charsPerTurn = tokensPerTurn * 1;

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
    storage: {
      getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
    },
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
import { ContextTracer } from '../tracer.js';
import { ContextEnvironmentImpl } from '../sidecar/environmentImpl.js';
import { SidecarLoader } from '../sidecar/SidecarLoader.js';

export function setupContextComponentTest(config: Config) {
  const chatHistory = new AgentChatHistory();
  const sidecar = SidecarLoader.fromLegacyConfig(config);
  const tracer = new ContextTracer('/tmp', 'test-session');
  const env = new ContextEnvironmentImpl(
    config.getBaseLlmClient() as any,
    'test-session',
    '/tmp',
    '/tmp/gemini-test',
    tracer,
    1,
  );
  const contextManager = new ContextManager(sidecar, env, tracer);

  // The async worker is now internally managed by ContextManager

  // Subscribe to history to enable the Eager/Opportunistic triggers
  contextManager.subscribeToHistory(chatHistory);

  return { chatHistory, contextManager };
}
