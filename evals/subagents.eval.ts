/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect } from 'vitest';

import { evalTest } from './test-helper.js';

const DOCS_AGENT_DEFINITION = `---
name: docs-agent
description: An agent with expertise in updating documentation.
tools:
  - read_file
  - write_file
---
You are the docs agent. Update documentation clearly and accurately.
`;

const TEST_AGENT_DEFINITION = `---
name: test-agent
description: An agent with expertise in writing and updating tests.
tools:
  - read_file
  - write_file
---
You are the test agent. Add or update tests.
`;

const GENERALIST_AGENT_DEFINITION = `---
name: generalist-agent
description: A broad generalist agent that can help with many software tasks.
tools:
  - read_file
  - write_file
---
You are the generalist agent. Help with general software development tasks.
`;

const INDEX_TS = 'export const add = (a: number, b: number) => a + b;\n';

function readProjectFile(
  rig: { testDir?: string },
  relativePath: string,
): string {
  return fs.readFileSync(path.join(rig.testDir!, relativePath), 'utf8');
}

function serializedToolLogs(rig: { readToolLogs: () => unknown }): string {
  return JSON.stringify(rig.readToolLogs());
}

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
      '.gemini/agents/docs-agent.md': DOCS_AGENT_DEFINITION,
      'index.ts': INDEX_TS,
      'README.md': 'TODO: update the README.\n',
    },
    assert: async (rig, _result) => {
      await rig.expectToolCallSuccess(['docs-agent']);
    },
  });

  /**
   * Checks that the outer agent does not over-delegate trivial work when
   * subagents are available. This helps catch orchestration overuse.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should avoid delegating trivial direct edit work',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt:
      'Rename the exported function in index.ts from add to sum and update the file directly.',
    files: {
      '.gemini/agents/docs-agent.md': DOCS_AGENT_DEFINITION,
      '.gemini/agents/generalist-agent.md': GENERALIST_AGENT_DEFINITION,
      'index.ts': INDEX_TS,
    },
    assert: async (rig, _result) => {
      const updatedIndex = readProjectFile(rig, 'index.ts');
      const toolLogs = serializedToolLogs(rig);

      expect(updatedIndex).toContain('export const sum =');
      expect(toolLogs).not.toContain('docs-agent');
      expect(toolLogs).not.toContain('generalist-agent');
    },
  });

  /**
   * Checks that the outer agent prefers a more relevant specialist over a
   * broad generalist when both are available.
   *
   * This is meant to codify the "overusing Generalist" failure mode.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should prefer relevant specialist over generalist',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt: 'Please add a small test file that verifies add(1, 2) returns 3.',
    files: {
      '.gemini/agents/test-agent.md': TEST_AGENT_DEFINITION,
      '.gemini/agents/generalist-agent.md': GENERALIST_AGENT_DEFINITION,
      'index.ts': INDEX_TS,
      'package.json': JSON.stringify(
        {
          name: 'subagent-eval-project',
          version: '1.0.0',
          type: 'module',
        },
        null,
        2,
      ),
    },
    assert: async (rig, _result) => {
      const toolLogs = serializedToolLogs(rig);

      await rig.expectToolCallSuccess(['test-agent']);
      expect(toolLogs).not.toContain('generalist-agent');
    },
  });

  /**
   * Checks cardinality and decomposition for a multi-surface task. The task
   * naturally spans docs and tests, so multiple specialists should be used.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use multiple relevant specialists for multi-surface task',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt:
      'Add a short README description for this library and also add a test file that verifies add(1, 2) returns 3.',
    files: {
      '.gemini/agents/docs-agent.md': DOCS_AGENT_DEFINITION,
      '.gemini/agents/test-agent.md': TEST_AGENT_DEFINITION,
      '.gemini/agents/generalist-agent.md': GENERALIST_AGENT_DEFINITION,
      'index.ts': INDEX_TS,
      'README.md': 'TODO: update the README.\n',
      'package.json': JSON.stringify(
        {
          name: 'subagent-eval-project',
          version: '1.0.0',
          type: 'module',
        },
        null,
        2,
      ),
    },
    assert: async (rig, _result) => {
      const toolLogs = serializedToolLogs(rig);
      const readme = readProjectFile(rig, 'README.md');

      await rig.expectToolCallSuccess(['docs-agent', 'test-agent']);
      expect(readme).not.toContain('TODO: update the README.');
      expect(toolLogs).not.toContain('generalist-agent');
    },
  });
});
