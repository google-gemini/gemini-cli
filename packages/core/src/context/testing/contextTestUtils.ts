/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { AgentChatHistory } from '../../core/agentChatHistory.js';
import { ContextManager } from '../contextManager.js';
import { randomUUID } from 'node:crypto';
import { ContextTracer } from '../tracer.js';
import { ContextEnvironmentImpl } from '../pipeline/environmentImpl.js';
import { ContextEventBus } from '../eventBus.js';
import { PipelineOrchestrator } from '../pipeline/orchestrator.js';
import {
  type ConcreteNode,
  type ToolExecution,
  NodeType,
} from '../graph/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import { InboxSnapshotImpl } from '../pipeline/inbox.js';
import type { InboxMessage, ProcessArgs } from '../pipeline.js';
import type { ContextProfile } from '../config/profiles.js';
import type { Mock } from 'vitest';
import { ContextWorkingBufferImpl } from '../pipeline/contextWorkingBuffer.js';
import { testTruncateProfile } from './testProfile.js';

/**
 * Creates a valid mock GenerateContentResponse with the provided text.
 * Used to avoid having to manually construct the deeply nested candidate/content/part structure.
 */
export const createMockGenerateContentResponse = (
  text: string,
): GenerateContentResponse =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  ({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }],
  }) as GenerateContentResponse;

export function createDummyNode(
  turnId: string,
  type: NodeType,
  _tokens = 100,
  overrides?: Partial<ConcreteNode>,
  id?: string,
): ConcreteNode {
  const role =
    type === NodeType.USER_PROMPT ||
    type === NodeType.SYSTEM_EVENT ||
    type === NodeType.SNAPSHOT ||
    type === NodeType.ROLLING_SUMMARY
      ? 'user'
      : 'model';

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    id: id || randomUUID(),
    turnId,
    type,
    timestamp: Date.now(),
    role,
    payload: { text: `Dummy ${type}` },
    ...overrides,
  } as unknown as ConcreteNode;
}

export function createDummyToolNode(
  turnId: string,
  _intentTokens = 100,
  _obsTokens = 200,
  overrides?: Partial<ToolExecution>,
  id?: string,
): ToolExecution {
  // We don't distinguish between call and response here, but ToolExecution nodes in 1:1 map to ONE part.
  // Tests using this usually want to simulate a tool interaction.
  // For simplicity, we'll make this a 'model' tool call by default.

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    id: id || randomUUID(),
    turnId,
    type: NodeType.TOOL_EXECUTION,
    timestamp: Date.now(),
    role: 'model',
    payload: {
      functionCall: {
        name: 'dummy_tool',
        args: { action: 'test' },
        id: id || 'dummy_id',
      },
    },
    ...overrides,
  } as unknown as ToolExecution;
}

export interface MockLlmClient extends BaseLlmClient {
  generateContent: Mock;
}

export function createMockLlmClient(
  responses?: Array<string | GenerateContentResponse>,
): MockLlmClient {
  const generateContentMock = vi.fn();

  if (responses && responses.length > 0) {
    for (const response of responses) {
      if (typeof response === 'string') {
        generateContentMock.mockResolvedValueOnce(
          createMockGenerateContentResponse(response),
        );
      } else {
        generateContentMock.mockResolvedValueOnce(response);
      }
    }
    // Fallback to the last response for any subsequent calls
    const lastResponse = responses[responses.length - 1];
    if (typeof lastResponse === 'string') {
      generateContentMock.mockResolvedValue(
        createMockGenerateContentResponse(lastResponse),
      );
    } else {
      generateContentMock.mockResolvedValue(lastResponse);
    }
  } else {
    // Default fallback
    generateContentMock.mockResolvedValue(
      createMockGenerateContentResponse('Mock LLM response'),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    generateContent: generateContentMock,
  } as unknown as MockLlmClient;
}

export function createMockEnvironment(
  overrides?: Partial<ContextEnvironment>,
): ContextEnvironment {
  const llmClient = createMockLlmClient(['Mock LLM summary response']);

  const tracer = new ContextTracer({
    targetDir: '/tmp',
    sessionId: 'mock-session',
  });
  const eventBus = new ContextEventBus();

  let env = new ContextEnvironmentImpl(
    () => llmClient as BaseLlmClient,
    'mock-session',
    'mock-prompt-id',
    '/tmp/.gemini/trace',
    '/tmp/.gemini/tool-outputs',
    tracer,
    1,
    eventBus,
  );

  if (overrides) {
    if (overrides.llmClient) {
      env = new ContextEnvironmentImpl(
        () => overrides.llmClient!,
        env.sessionId,
        env.promptId,
        env.traceDir,
        env.projectTempDir,
        env.tracer,
        env.charsPerToken,
        env.eventBus,
      );
    }
    const { llmClient: _llmClient, ...restOverrides } = overrides;
    Object.assign(env, restOverrides);
  }
  return env;
}

/**
 * Creates a block of synthetic conversation history designed to consume a specific number of tokens.
 * Assumes roughly 4 characters per token for standard English text.
 */

export function createMockProcessArgs(
  targets: ConcreteNode[],
  bufferNodes: ConcreteNode[] = [],
  inboxMessages: InboxMessage[] = [],
): ProcessArgs {
  return {
    targets,
    buffer: ContextWorkingBufferImpl.initialize(
      bufferNodes.length ? bufferNodes : targets,
    ),
    inbox: new InboxSnapshotImpl(inboxMessages),
  };
}

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
    getExperimentalContextManagementConfig: vi.fn().mockReturnValue(undefined),
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return { ...defaultConfig, ...overrides } as unknown as Config;
}

/**
 * Wires up a full ContextManager component with an AgentChatHistory and active background async pipelines.
 */

export function setupContextComponentTest(
  config: Config,
  sidecarOverride?: ContextProfile,
): { chatHistory: AgentChatHistory; contextManager: ContextManager } {
  const chatHistory = new AgentChatHistory();
  const sidecar = sidecarOverride || testTruncateProfile;
  const tracer = new ContextTracer({
    targetDir: '/tmp',
    sessionId: 'test-session',
  });
  const eventBus = new ContextEventBus();
  const env = new ContextEnvironmentImpl(
    () => config.getBaseLlmClient(),
    'test prompt-id',
    'test-session',
    '/tmp',
    '/tmp/gemini-test',
    tracer,
    1,
    eventBus,
  );

  const orchestrator = new PipelineOrchestrator(
    sidecar.buildPipelines(env),
    sidecar.buildAsyncPipelines(env),
    env,
    eventBus,
    tracer,
  );

  const contextManager = new ContextManager(
    sidecar,
    env,
    tracer,
    orchestrator,
    chatHistory,
  );

  // The async async pipeline is now internally managed by ContextManager
  return { chatHistory, contextManager };
}
