/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import {
  componentEvalTest,
  type ComponentEvalCase,
} from './component-test-helper.js';
import { type EvalPolicy } from './test-helper.js';
import { SnapshotGenerator } from '@google/gemini-cli-core';
import { NodeType, type ConcreteNode } from '@google/gemini-cli-core';
import { LLMJudge } from './llm-judge.js';

function snapshotEvalTest(policy: EvalPolicy, evalCase: ComponentEvalCase) {
  return componentEvalTest(policy, evalCase);
}

describe('snapshot_fidelity', () => {
  snapshotEvalTest('ALWAYS_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'SnapshotGenerator strictly retains specific empirical facts',
    assert: async (config) => {
      // 1. Construct a highly specific mock transcript containing 3 empirical facts we can test for:
      // Fact A: File path -> src/compiler/server.ts
      // Fact B: Error code -> COMPILE_ERR_404
      // Fact C: Active Directive -> "do not fix it just yet"
      const mockNodes: ConcreteNode[] = [
        {
          id: '1',
          turnId: '1',
          type: NodeType.USER_PROMPT,
          timestamp: Date.now(),
          role: 'user',
          payload: {
            text: 'I am trying to debug a weird timeout issue when compiling the TS server.',
          },
        },
        {
          id: '2',
          turnId: '2',
          type: NodeType.TOOL_EXECUTION,
          timestamp: Date.now() + 100,
          role: 'model',
          payload: {
            functionCall: {
              name: 'run_shell_command',
              args: { cmd: 'grep -rn "timeout" src/' },
            },
          },
        },
        {
          id: '3',
          turnId: '2',
          type: NodeType.TOOL_EXECUTION,
          timestamp: Date.now() + 200,
          role: 'user',
          payload: {
            functionResponse: {
              name: 'run_shell_command',
              response: {
                output:
                  'src/compiler/server.ts:442: setTimeout(() => reject(new Error("COMPILE_ERR_404")), 5000);',
              },
            },
          },
        },
        {
          id: '4',
          turnId: '3',
          type: NodeType.AGENT_YIELD,
          timestamp: Date.now() + 300,
          role: 'model',
          payload: {
            text: 'I found the exact line. It looks like the compiler throws COMPILE_ERR_404 if it hits 5 seconds.',
          },
        },
        {
          id: '5',
          turnId: '4',
          type: NodeType.USER_PROMPT,
          timestamp: Date.now() + 400,
          role: 'user',
          payload: {
            text: 'Okay, do not fix it just yet. I want you to remember this error code (COMPILE_ERR_404) and file path. First, list all the files in the directory.',
          },
        },
      ];

      // 2. Extract the LLM Client from the component container
      const llmClient = config.getBaseLlmClient();

      const generator = new SnapshotGenerator({
        llmClient,
        promptId: 'eval-snapshot-test',
        tokenCalculator: {
          estimateTokensForString(str: string): number {
            return str.length * 4;
          },
        },
      } as any);

      // 3. Generate the snapshot using the CURRENT system prompt
      const snapshotText = await generator.synthesizeSnapshot(mockNodes);

      // 4. Use LLM-as-a-Judge with Self-Consistency to evaluate factual fidelity
      const judge = new LLMJudge(llmClient);

      const judgePrompt = `
EVIDENCE (CONTEXT SNAPSHOT):
"""
${snapshotText}
"""

QUESTION:
Does the EVIDENCE explicitly contain all three of the following facts:
1. The specific file path "src/compiler/server.ts"
2. The specific error code "COMPILE_ERR_404"
3. The user's active constraint/directive to "do not fix it just yet" (or equivalent warning that implementation is paused)

Answer ONLY with "YES" if all three are unambiguously present.
Answer "NO" if any of the three are missing, abstracted away, or generalized (e.g., if it says "found an error" instead of "COMPILE_ERR_404").`;

      // Use a self-consistency of 3 runs to get a robust majority vote
      const result = await judge.judgeYesNo(judgePrompt, {
        selfConsistencyRuns: 3,
      });

      // 5. Assert the verdict
      const formattedVotes = JSON.stringify(result.votes);
      const formattedReasoning = JSON.stringify(result.reasoning);

      expect(
        result.verdict,
        `Snapshot failed to retain empirical facts.
Votes: ${formattedVotes}
Reasoning: ${formattedReasoning}

Generated Snapshot:
${snapshotText}`,
      ).toBe(true);
    },
  });
});
