/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'vitest';
import { evalTest } from './test-helper.js';

const MUTATION_AGENT_DEFINITION = `---
name: mutation-agent
description: An agent that modifies the workspace (writes, deletes, git operations, etc).
max_turns: 1
tools:
  - write_file
---

You are the mutation agent. Do the mutation requested.
`;

describe('concurrency safety eval test cases', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'mutation agents are run in parallel when explicitly requested',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt:
      'Update A.txt to say "A" and update B.txt to say "B". Delegate these tasks to two separate mutation-agent subagents. You MUST run these subagents in parallel at the same time.',
    files: {
      '.gemini/agents/mutation-agent.md': MUTATION_AGENT_DEFINITION,
    },
    assert: async (rig) => {
      const logs = rig.readToolLogs();
      const mutationCalls = logs.filter(
        (log) => log.toolRequest?.name === 'mutation-agent',
      );

      expect(
        mutationCalls.length,
        'Agent should have called the mutation-agent at least twice',
      ).toBeGreaterThanOrEqual(2);

      const firstPromptId = mutationCalls[0].toolRequest.prompt_id;
      const secondPromptId = mutationCalls[1].toolRequest.prompt_id;

      expect(
        firstPromptId,
        'mutation agents should be called in parallel (same turn / prompt_ids) when explicitly requested',
      ).toEqual(secondPromptId);
    },
  });
});
