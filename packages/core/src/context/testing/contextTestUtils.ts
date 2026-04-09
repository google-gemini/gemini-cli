/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { AgentChatHistory } from '../../core/agentChatHistory.js';
import { ContextManager } from '../contextManager.js';
import { InMemoryFileSystem } from '../system/InMemoryFileSystem.js';
import { DeterministicIdGenerator } from '../system/DeterministicIdGenerator.js';
import { randomUUID } from 'node:crypto';
import { ContextTracer } from '../tracer.js';
import { ContextEnvironmentImpl } from '../sidecar/environmentImpl.js';
import { SidecarLoader } from '../sidecar/SidecarLoader.js';
import { ContextEventBus } from '../eventBus.js';
import { SidecarRegistry } from '../sidecar/registry.js';
import { registerBuiltInProcessors } from '../sidecar/builtins.js';
import { PipelineOrchestrator } from '../sidecar/orchestrator.js';
import type { ConcreteNode, ToolExecution } from '../ir/types.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import { InboxSnapshotImpl } from '../sidecar/inbox.js';
import type {
  InboxMessage,
  ProcessArgs,
} from '../pipeline.js';

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
  logicalParentId: string,
  type: ConcreteNode['type'],
  tokens = 100,
  overrides?: Partial<ConcreteNode>,
  id?: string,
): ConcreteNode {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    id: id || randomUUID(),
    episodeId: logicalParentId,
    logicalParentId,
    type,
    timestamp: Date.now(),
    text: `Dummy ${type}`,
    name: type === 'SYSTEM_EVENT' ? 'dummy_event' : undefined,
    payload: type === 'SYSTEM_EVENT' ? {} : undefined,
    semanticParts: [],
    metadata: {
      originalTokens: tokens,
      currentTokens: tokens,
      transformations: [],
    },
    ...overrides,
  } as unknown as ConcreteNode;
}

export function createDummyToolNode(
  logicalParentId: string,
  intentTokens = 100,
  obsTokens = 200,
  overrides?: Partial<ToolExecution>,
  id?: string,
): ToolExecution {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    id: id || randomUUID(),
    episodeId: logicalParentId,
    logicalParentId,
    type: 'TOOL_EXECUTION',
    timestamp: Date.now(),
    toolName: 'dummy_tool',
    intent: { action: 'test' },
    observation: { result: 'ok' },
    tokens: {
      intent: intentTokens,
      observation: obsTokens,
    },
    metadata: {
      originalTokens: intentTokens + obsTokens,
      currentTokens: intentTokens + obsTokens,
      transformations: [],
    },
    ...overrides,
  } as unknown as ToolExecution;
}

import type { Mock } from 'vitest';
import type { SidecarConfig } from '../sidecar/types.js';

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

  const env = new ContextEnvironmentImpl(
    llmClient,
    'mock-session',
    'mock-prompt-id',
    '/tmp/.gemini/trace',
    '/tmp/.gemini/tool-outputs',
    tracer,
    1,
    eventBus,
    new InMemoryFileSystem(),
    new DeterministicIdGenerator('mock-uuid-'),
  );

  if (overrides) {
    Object.assign(env, overrides);
  }
  return env;
}

/**
 * Creates a block of synthetic conversation history designed to consume a specific number of tokens.
 * Assumes roughly 4 characters per token for standard English text.
 */
import { ContextWorkingBufferImpl } from '../sidecar/contextWorkingBuffer.js';

export function createMockProcessArgs(
  targets: ConcreteNode[],
  bufferNodes: ConcreteNode[] = [],
  inboxMessages: InboxMessage[] = [],
): ProcessArgs {
  return {
    targets,
    buffer: ContextWorkingBufferImpl.initialize(bufferNodes.length ? bufferNodes : targets),
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
    getExperimentalContextSidecarConfig: vi.fn().mockReturnValue(undefined),
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return { ...defaultConfig, ...overrides } as unknown as Config;
}

/**
 * Wires up a full ContextManager component with an AgentChatHistory and active background workers.
 */

export function setupContextComponentTest(
  config: Config,
  sidecarOverride?: SidecarConfig,
): { chatHistory: AgentChatHistory; contextManager: ContextManager } {
  const chatHistory = new AgentChatHistory();
  const registry = new SidecarRegistry();
  registerBuiltInProcessors(registry);
  const sidecar = sidecarOverride || SidecarLoader.fromConfig(config, registry);
  const tracer = new ContextTracer({
    targetDir: '/tmp',
    sessionId: 'test-session',
  });
  const eventBus = new ContextEventBus();
  const env = new ContextEnvironmentImpl(
    config.getBaseLlmClient(),
    'test prompt-id',
    'test-session',
    '/tmp',
    '/tmp/gemini-test',
    tracer,
    1,
    eventBus,
  );

  const orchestrator = new PipelineOrchestrator(
    sidecar,
    env,
    eventBus,
    tracer,
    registry,
  );

  const contextManager = new ContextManager(
    sidecar,
    env,
    tracer,
    orchestrator,
    chatHistory,
  );

  // The async worker is now internally managed by ContextManager
  return { chatHistory, contextManager };
}
