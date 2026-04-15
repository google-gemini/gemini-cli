/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudSubagent, CLOUD_SUBAGENT_NAME } from './cloud-subagent.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { getCoreSystemPrompt } from '../core/prompts.js';

vi.mock('../core/prompts.js', () => ({
  getCoreSystemPrompt: vi.fn().mockReturnValue('BASE PROMPT'),
}));

describe('CloudSubagent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should lazily build promptConfig without eager system prompt rendering', () => {
    const config = { sessionId: 'test' };
    const context = {
      config,
      toolRegistry: undefined,
    } as unknown as AgentLoopContext;

    const agent = CloudSubagent(context);

    expect(getCoreSystemPrompt).not.toHaveBeenCalled();

    const promptConfig = agent.promptConfig;
    expect(getCoreSystemPrompt).toHaveBeenCalledWith(config, undefined, false);
    expect(promptConfig.systemPrompt).toContain('Cloud Delegation Protocol');
  });

  it('should exclude itself from the available tool list', () => {
    const config = { sessionId: 'test' };
    const context = {
      config,
      toolRegistry: {
        getAllToolNames: vi
          .fn()
          .mockReturnValue(['read_file', CLOUD_SUBAGENT_NAME, 'shell']),
      },
    } as unknown as AgentLoopContext;

    const agent = CloudSubagent(context);

    expect(agent.toolConfig?.tools).toEqual(['read_file', 'shell']);
  });
});
