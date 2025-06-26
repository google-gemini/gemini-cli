/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

vi.mock('../core/geminiChat.js');
vi.mock('../core/contentGenerator.js');

import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { createContentGenerator } from '../core/contentGenerator.js';
import { GeminiChat } from './geminiChat.js';
import { Config, ConfigParameters } from '../config/config.js';
import {
  ContextState,
  SubAgentScope,
  SubagentTerminateMode,
} from './subagent.js';

describe('SubAgentScope', () => {
  let mockSendMessageStream: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessageStream = vi.fn();
    vi.mocked(GeminiChat).mockImplementation(
      () =>
        ({
          sendMessageStream: mockSendMessageStream,
          setSystemInstruction: vi.fn(),
        }) as unknown as GeminiChat,
    );
    vi.mocked(createContentGenerator).mockResolvedValue({
      getGenerativeModel: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it('should correctly execute a simple query and emit the expected variables', async () => {
    // Mock the model's response to issue a tool call.
    mockSendMessageStream.mockResolvedValue(
      (async function* () {
        yield {
          functionCalls: [
            {
              name: 'self.emitvalue',
              args: {
                emit_variable_name: 'capital',
                emit_variable_value: 'Paris',
              },
            },
          ],
        };
      })(),
    );

    // Base configuration parameters
    const configParams: ConfigParameters = {
      sessionId: 'test-session',
      model: DEFAULT_GEMINI_MODEL,
      targetDir: '.',
      debugMode: false,
      cwd: process.cwd(),
    };

    const config = new Config(configParams);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await config.refreshAuth('test-auth' as any);

    // Prompt Config
    const promptConfig = {
      plan: 'I want you to answer the user query: ${user_query}.',
      goals: '* Do the thing the user asked, and then you can be finished',
      outputs: { capital: 'The capital of the country that was asked for' },
      tools: [], // No tools for this simple test
    };

    // Model Config
    const modelConfig = {
      model: 'gemini-1.5-flash-latest',
      temp: 0.7,
      top_p: 1,
    };

    // Run Config
    const runConfig = {
      max_time_minutes: 1,
    };

    // Context
    const context = new ContextState();
    context.set('user_query', 'Tell me the capital of France.');

    const orchestrator = new SubAgentScope(
      config,
      promptConfig,
      modelConfig,
      runConfig,
    );

    await orchestrator.runNonInteractive(context);

    expect(orchestrator.output.terminate_reason).toBe(
      SubagentTerminateMode.GOAL,
    );
    expect(orchestrator.output.emitted_vars['capital']).toBe('Paris');
  });
});
