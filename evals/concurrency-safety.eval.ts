/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

const RESEARCH_AGENT_DEFINITION = `---
name: research-agent
description: An agent that researches topics or explains files. Read-only tasks.
max_turns: 1
tools: []
---

You are the research agent. Answer the user's question concisely.
`;

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
    name: 'research agents are run in parallel',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt:
      'Find out the purpose of A.txt and the purpose of B.txt. Delegate these tasks to the research-agent.',
    files: {
      '.gemini/agents/research-agent.md': RESEARCH_AGENT_DEFINITION,
      'A.txt': 'This is file A.',
      'B.txt': 'This is file B.',
    },
    assert: async (rig) => {
      const logs = rig.readToolLogs();
      const researchCalls = logs.filter(
        (log) => log.toolRequest?.name === 'research-agent',
      );

      expect(
        researchCalls.length,
        'Agent should have called the research-agent at least twice',
      ).toBeGreaterThanOrEqual(2);

      const firstPromptId = researchCalls[0].toolRequest.prompt_id;
      const secondPromptId = researchCalls[1].toolRequest.prompt_id;

      expect(
        firstPromptId,
        'research agents should be called in parallel (same turn / prompt_id)',
      ).toEqual(secondPromptId);
    },
  });

  evalTest('USUALLY_PASSES', {
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
