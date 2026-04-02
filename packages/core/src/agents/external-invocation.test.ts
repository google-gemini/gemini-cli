/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type ExternalAgentDefinition } from './types.js';
import {
  ExternalAgentInvocation,
  polyfillExternalAgent,
} from './external-invocation.js';
import { LocalAgentExecutor } from './local-executor.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';

vi.mock('./local-executor.js');

const MockLocalAgentExecutor = vi.mocked(LocalAgentExecutor);

describe('ExternalAgentInvocation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockConfig: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMessageBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();
    mockMessageBus = createMockMessageBus();

    MockLocalAgentExecutor.create.mockResolvedValue({
      run: vi.fn().mockResolvedValue({
        result: 'Success',
        terminate_reason: 'GOAL',
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      definition: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const externalDef: ExternalAgentDefinition = {
    kind: 'external',
    name: 'claude-agent',
    provider: 'claude-code',
    description: 'Expert coder.',
    inputConfig: { inputSchema: { type: 'object', properties: {} } },
  };

  it('should polyfill external agent into a local agent definition', () => {
    const polyfilled = polyfillExternalAgent(externalDef);

    expect(polyfilled.kind).toBe('local');
    expect(polyfilled.modelConfig.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(polyfilled.promptConfig.systemPrompt).toContain(
      'Claude Code Personality Overlay',
    );
    expect(polyfilled.promptConfig.systemPrompt).toContain('Expert coder.');
  });

  it('should support Codex provider', () => {
    const codexDef: ExternalAgentDefinition = {
      ...externalDef,
      provider: 'codex',
    };
    const polyfilled = polyfillExternalAgent(codexDef);

    expect(polyfilled.promptConfig.systemPrompt).toContain(
      'Codex Personality Overlay',
    );
  });

  it('should include styleInstructions from providerConfig', () => {
    const customDef: ExternalAgentDefinition = {
      ...externalDef,
      providerConfig: {
        styleInstructions: 'Be very formal.',
      },
    };
    const polyfilled = polyfillExternalAgent(customDef);

    expect(polyfilled.promptConfig.systemPrompt).toContain(
      'Additional Style Instructions: Be very formal.',
    );
  });

  it('should use ExternalAgentInvocation to execute polyfilled agent', async () => {
    const invocation = new ExternalAgentInvocation(
      externalDef,
      mockConfig,
      {},
      mockMessageBus,
    );

    const signal = new AbortController().signal;
    await invocation.execute(signal);

    expect(MockLocalAgentExecutor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'local',
        name: 'claude-agent',
      }),
      mockConfig,
      expect.any(Function),
    );
  });
});
