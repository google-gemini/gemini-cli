/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

vi.mock('../core/client.js');

import { GenerateContentResponse } from '@google/genai';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigParameters } from '../config/config.js';
import { GeminiClient } from './client.js';
import {
  ContextState,
  SubAgentScope,
  SubagentTerminateMode,
} from './subagent.js';

describe('SubAgentScope', () => {
  let mockGenerateContent: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent = vi.fn();
    vi.mocked(GeminiClient).mockImplementation(
      () =>
        ({
          generateContent: mockGenerateContent,
        }) as unknown as GeminiClient,
    );
  });

  it('should correctly execute a simple query and emit the expected variables', async () => {
    // Mock the model's response. The SubAgentScope is expected to parse this
    // and extract the capital.
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: '{"capital": "Paris"}' }],
          },
        },
      ],
    } as GenerateContentResponse);

    // Base configuration parameters
    const configParams: ConfigParameters = {
      sessionId: 'test-session',
      model: DEFAULT_GEMINI_MODEL,
      targetDir: '.',
      debugMode: false,
      cwd: process.cwd(),
    };

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
      configParams,
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
