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

  evalTest('ALWAYS_PASSES', {
    name: 'should fix linter errors in multiple projects using implicit parallelism',
    prompt: 'Fix all linter errors.',
    timeout: 600000,
    params: {
      settings: {
        agents: {
          overrides: {
            generalist: { enabled: true },
          },
        },
      },
    },
    files: {
      'project-a/eslint.config.js': `
        module.exports = [
          {
            files: ["**/*.js"],
            rules: {
              "no-var": "error"
            }
          }
        ];
      `,
      'project-a/index.js': 'var x = 1;',
      'project-b/eslint.config.js': `
        module.exports = [
          {
            files: ["**/*.js"],
            rules: {
              "no-console": "error"
            }
          }
        ];
      `,
      'project-b/main.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const fileA = rig.readFile('project-a/index.js');
      const fileB = rig.readFile('project-b/main.js');

      if (fileA.includes('var x')) {
        throw new Error(`project-a/index.js was not fixed. Content:\n${fileA}`);
      }
      // Check if console.log is present and NOT commented out or disabled.
      const lines = fileB.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('console.log')) {
          const isCommented = line.trim().startsWith('//');
          const isDisabled =
            (i > 0 && lines[i - 1].includes('eslint-disable')) ||
            line.includes('eslint-disable-line');
          if (!isCommented && !isDisabled) {
            throw new Error(
              `project-b/main.js was not fixed (console.log present without disable/comment). Content:\n${fileB}`,
            );
          }
        }
      }

      // Assert that the agent delegated to a subagent for each project.
      const toolLogs = rig.readToolLogs();
      const subagentCalls = toolLogs.filter((log) => {
        if (log.toolRequest.name === 'generalist') return true;
        if (log.toolRequest.name === 'delegate_to_agent') {
          try {
            const args = JSON.parse(log.toolRequest.args);
            return args.agent_name === 'generalist';
          } catch {
            return false;
          }
        }
        return false;
      });

      if (subagentCalls.length < 2) {
        throw new Error(
          `Expected at least 2 generalist calls, but found ${subagentCalls.length}`,
        );
      }
    },
  });
});
