/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe } from 'vitest';
import { evalTest } from './test-helper.js';

const AGENT_DEFINITION = `---
name: docs-agent
description: An agent with expertise in updating documentation.
tools:
  - read_file
  - write_file
---

You are the docs agent. Update the documentation.
`;

const INDEX_TS = 'export const add = (a: number, b: number) => a + b;';

describe('subagent eval test cases', () => {
  /**
   * Checks whether the outer agent reliably utilizes an expert subagent to
   * accomplish a task when one is available.
   *
   * Note that the test is intentionally crafted to avoid the word "document"
   * or "docs". We want to see the outer agent make the connection even when
   * the prompt indirectly implies need of expertise.
   *
   * This tests the system prompt's subagent specific clauses.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should delegate to user provided agent with relevant expertise',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt: 'Please update README.md with a description of this library.',
    files: {
      '.gemini/agents/test-agent.md': AGENT_DEFINITION,
      'index.ts': INDEX_TS,
      'README.md': 'TODO: update the README.',
    },
    assert: async (rig, _result) => {
      await rig.expectToolCallSuccess(['docs-agent']);
    },
  });
});
