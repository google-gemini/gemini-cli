/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect } from 'vitest';

import { evalTest, TEST_AGENTS } from './test-helper.js';

const INDEX_TS = 'export const add = (a: number, b: number) => a + b;\n';

function readProjectFile(
  rig: { testDir?: string },
  relativePath: string,
): string {
  return fs.readFileSync(path.join(rig.testDir!, relativePath), 'utf8');
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
      ...TEST_AGENTS.DOCS_AGENT.asFile(),
      'index.ts': INDEX_TS,
      'README.md': 'TODO: update the README.\n',
    },
    assert: async (rig, _result) => {
      await rig.expectToolCallSuccess([TEST_AGENTS.DOCS_AGENT.name]);
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
          agents: {
            overrides: {
              generalist: { enabled: true },
            },
          },
        },
      },
    },
    prompt:
      'Rename the exported function in index.ts from add to sum and update the file directly.',
    files: {
      ...TEST_AGENTS.DOCS_AGENT.asFile(),
      'index.ts': INDEX_TS,
    },
    assert: async (rig, _result) => {
      const updatedIndex = readProjectFile(rig, 'index.ts');
      const toolLogs = rig.readToolLogs() as Array<{
        toolRequest: { name: string };
      }>;

      expect(updatedIndex).toContain('export const sum =');
      expect(
        toolLogs.some(
          (l) => l.toolRequest.name === TEST_AGENTS.DOCS_AGENT.name,
        ),
      ).toBe(false);
      expect(toolLogs.some((l) => l.toolRequest.name === 'generalist')).toBe(
        false,
      );
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
          agents: {
            overrides: {
              generalist: { enabled: true },
            },
          },
        },
      },
    },
    prompt: 'Please add a small test file that verifies add(1, 2) returns 3.',
    files: {
      ...TEST_AGENTS.TESTING_AGENT.asFile(),
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
      const toolLogs = rig.readToolLogs() as Array<{
        toolRequest: { name: string };
      }>;

      await rig.expectToolCallSuccess([TEST_AGENTS.TESTING_AGENT.name]);
      expect(toolLogs.some((l) => l.toolRequest.name === 'generalist')).toBe(
        false,
      );
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
          agents: {
            overrides: {
              generalist: { enabled: true },
            },
          },
        },
      },
    },
    prompt:
      'Add a short README description for this library and also add a test file that verifies add(1, 2) returns 3.',
    files: {
      ...TEST_AGENTS.DOCS_AGENT.asFile(),
      ...TEST_AGENTS.TESTING_AGENT.asFile(),
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
      const toolLogs = rig.readToolLogs() as Array<{
        toolRequest: { name: string };
      }>;
      const readme = readProjectFile(rig, 'README.md');

      await rig.expectToolCallSuccess([
        TEST_AGENTS.DOCS_AGENT.name,
        TEST_AGENTS.TESTING_AGENT.name,
      ]);
      expect(readme).not.toContain('TODO: update the README.');
      expect(toolLogs.some((l) => l.toolRequest.name === 'generalist')).toBe(
        false,
      );
    },
  });
});
