/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { componentEvalTest } from './component-test-helper.js';
import { SimulationHarness } from '../packages/core/src/context/system-tests/SimulationHarness.js';
import type { SidecarConfig } from '../packages/core/src/context/sidecar/types.js';
import { Config, LlmRole, getResponseText } from '@google/gemini-cli-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Content } from '@google/genai';
import { EVAL_MODEL } from './test-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data', 'context_manager');

interface ScenarioQuestion {
  id: string;
  prompt: string;
  expectedSubstring: string;
}

interface Scenario {
  scenarioId: string;
  description: string;
  history: Content[];
  questions: ScenarioQuestion[];
}

const getScenario = (id: string): Scenario => {
  const filePath = path.join(DATA_DIR, 'scenario-c-compiler.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Scenario file not found at ${filePath}. Run generate-c-compiler-scenario.ts first.`,
    );
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as Scenario;
};

/**
 * Runs a single evaluation iteration using the SimulationHarness.
 */
async function runContextManagerEval(
  config: Config,
  sidecarConfig: SidecarConfig,
  seed: number,
  scenario: Scenario,
  judge: boolean = true,
): Promise<{
  pass: boolean;
  response: string;
  question: ScenarioQuestion;
  tokens: number;
}> {
  const harness = await SimulationHarness.create(
    sidecarConfig,
    config.getBaseLlmClient(),
    path.join(process.cwd(), 'harness-tmp'),
  );

  // 1. Feed trajectory
  for (const message of scenario.history) {
    await harness.simulateTurn([message]);
  }

  // Ensure background tasks (like StateSnapshotProcessor) have finished
  await harness.waitForIdle();

  // 2. Pick a question based on seed
  const questionIndex = seed % scenario.questions.length;
  const question = scenario.questions[questionIndex];

  // 3. Project compressed history
  const compressedHistory =
    await harness.contextManager.projectCompressedHistory();

  // We can't easily get the episode IDs from the projected Content[],
  // but we can look at the working buffer instead.
  const workingBuffer = harness.contextManager.getWorkingBufferView();
  console.log('--- WORKING BUFFER EPISODES START ---');
  workingBuffer.forEach((ep, i) => {
    console.log(`[Ep ${i}] ID: ${ep.id}, Type: ${ep.trigger.type}`);
    if (ep.trigger.type === 'USER_PROMPT') {
      console.log(`  Text: ${ep.trigger.semanticParts[0]?.text?.slice(0, 50)}`);
    }
  });
  console.log('--- WORKING BUFFER EPISODES END ---');

  console.log('--- COMPRESSED HISTORY START ---');
  compressedHistory.forEach((msg, i) => {
    console.log(`[${i}] Role: ${msg.role}`);
    msg.parts.forEach((part, j) => {
      if ('text' in part) {
        console.log(
          `  Part ${j} (text): ${part.text?.slice(0, 100)}${part.text && part.text.length > 100 ? '...' : ''}`,
        );
      } else if ('functionCall' in part) {
        console.log(`  Part ${j} (functionCall): ${part.functionCall.name}`);
      } else if ('functionResponse' in part) {
        console.log(
          `  Part ${j} (functionResponse): ${part.functionResponse.name}`,
        );
      } else {
        console.log(`  Part ${j} (other): ${Object.keys(part).join(', ')}`);
      }
    });
  });
  console.log('--- COMPRESSED HISTORY END ---');

  // 4. Ask the question
  const evalPrompt: Content = {
    role: 'user',
    parts: [
      {
        text: `[SYSTEM: EVALUATION MODE - ANSWER AS TEXT ONLY - DO NOT USE TOOLS]\n\n${question.prompt}\n\nIMPORTANT: Answer in plain text and DO NOT call any tools. Provide the specific information requested.`,
      },
    ],
  };

  const response = await config.getContentGenerator().generateContent(
    {
      model: config.getModel(),
      config: {},
      contents: [...compressedHistory, evalPrompt],
    },
    'eval-prompt',
    LlmRole.UTILITY_TOOL,
  );

  const responseText = getResponseText(response) ?? '';
  let pass = false;
  if (judge) {
    pass = await judgeResponse(config, question, responseText);
  } else {
    // Naive string check for potential failure identification
    pass = responseText
      .toLowerCase()
      .includes(question.expectedSubstring.toLowerCase());
  }

  const finalTokens = harness.env.tokenCalculator.calculateEpisodeListTokens(
    harness.contextManager.getWorkingBufferView(),
  );

  return { pass, response: responseText, question, tokens: finalTokens };
}

/**
 * Uses an LLM to judge whether the response matches the expected information.
 */
async function judgeResponse(
  config: Config,
  question: ScenarioQuestion,
  actualResponse: string,
): Promise<boolean> {
  const lowerResponse = actualResponse.toLowerCase();
  const lowerExpected = question.expectedSubstring.toLowerCase();

  // Fast path: direct substring match
  if (lowerResponse.includes(lowerExpected)) {
    return true;
  }

  const judgePrompt: Content = {
    role: 'user',
    parts: [
      {
        text: `Evaluate if the AI's response correctly answers the question by explicitly containing the expected information.

Question: ${question.prompt}
Expected Information: ${question.expectedSubstring}
AI's Response: ${actualResponse}

CRITICAL RULES FOR JUDGING:
1. The AI's response MUST explicitly answer the question in the prompt and the provided details must match those in 'Expected Information'.
2. Do not infer or assume knowledge. Vague, partial, or generalized answers MUST fail.
3. If the AI hallucinates, states it cannot find the information, or provides an incomplete answer, it MUST fail.
4. Expected information may contain extra details that are not required to answer the question that aren't in the AI's Response. For example: "the answer is X. It was previously Y.". These are still considered to be passing cases.

Does the AI's response explicitly and completely satisfy the expected information? 
Respond with ONLY "PASS" or "FAIL".`,
      },
    ],
  };

  const response = await config.getContentGenerator().generateContent(
    {
      model: EVAL_MODEL,
      config: { temperature: 0 },
      contents: [judgePrompt],
    },
    'eval-judge',
    LlmRole.UTILITY_TOOL,
  );

  const judgeText = getResponseText(response)?.trim().toUpperCase() ?? '';
  return judgeText === 'PASS';
}

function calculateScenarioTokens(scenario: Scenario): number {
  let totalChars = 0;
  for (const message of scenario.history) {
    for (const part of message.parts) {
      if ('text' in part && part.text) {
        totalChars += part.text.length;
      }
    }
  }
  // The SimulationHarness uses 4 chars per token.
  return Math.ceil(totalChars / 4);
}

function generateRandomSidecarConfig(
  seed: number,
  maxRetained: number,
): SidecarConfig {
  // Simple LCG or similar for deterministic randomness from seed if needed,
  // but for a fuzzer we can just use Math.random and log the seed.
  const minRetained = Math.min(1000, maxRetained);
  const retained =
    minRetained + Math.floor(Math.random() * (maxRetained - minRetained));
  const max = Math.floor(retained * (1.1 + Math.random() * 2.0)); // 110% to 300% buffer

  const useSquashing = Math.random() > 0.5;
  const useSnapshot = Math.random() > 0.5;

  const processors: any[] = [
    {
      processorId: 'ToolMaskingProcessor',
      options: {
        stringLengthThresholdTokens: Math.floor(
          retained * (0.2 + Math.random() * 0.5),
        ),
      },
    },
    { processorId: 'BlobDegradationProcessor', options: {} },
    {
      processorId: 'SemanticCompressionProcessor',
      options: {
        nodeThresholdTokens: Math.floor(retained * (0.1 + Math.random() * 0.3)),
      },
    },
    { processorId: 'EmergencyTruncationProcessor', options: {} },
  ];

  const backgroundProcessors: any[] = [];
  if (useSquashing) {
    backgroundProcessors.push({
      processorId: 'HistorySquashingProcessor',
      options: {
        maxTokensPerNode: Math.floor(retained * (0.05 + Math.random() * 0.15)),
      },
    });
  }
  if (useSnapshot) {
    backgroundProcessors.push({
      processorId: 'StateSnapshotProcessor',
      options: {},
    });
  }

  return {
    budget: { retainedTokens: retained, maxTokens: max },
    gcBackstop: {
      strategy: 'truncate', // Hardcoded since compress/rollingSummarizer are currently unimplemented
      target: 'incremental',
      freeTokensTarget: Math.floor(retained * 0.1),
    },
    pipelines: [
      {
        name: 'Immediate Sanitization',
        triggers: ['on_turn'],
        execution: 'blocking',
        processors,
      },
      {
        name: 'Deep Background Compression',
        triggers: [{ type: 'timer', intervalMs: 100 }, 'budget_exceeded'],
        execution: 'background',
        processors: backgroundProcessors,
      },
    ],
  };
}

describe('ContextManager Evaluation Suite', () => {
  const scenario = getScenario('scenario-c-compiler');

  /**
   * The "Explorer" test.
   * Set RUN_EXPLORER=1 to run many iterations and find failures.
   */
  if (process.env.RUN_EXPLORER) {
    componentEvalTest('ALWAYS_PASSES', {
      suiteName: 'context-manager',
      suiteType: 'component-level',
      name: 'ContextManager explorer (fuzzer)',
      configOverrides: { model: EVAL_MODEL },
      timeout: 1200000, // 20 minutes
      assert: async (config: Config) => {
        const scenarioTokens = calculateScenarioTokens(scenario);
        console.log(
          `Starting ContextManager explorer loop for scenario of size ${scenarioTokens} tokens...`,
        );
        for (let i = 0; i < 50; i++) {
          const seed = Math.floor(Math.random() * 1000000);
          const sidecarConfig = generateRandomSidecarConfig(
            seed,
            scenarioTokens,
          );

          const result = await runContextManagerEval(
            config,
            sidecarConfig,
            seed,
            scenario,
            false, // Optimistic string check
          );

          if (!result.pass) {
            // Potential failure. Confirm with LLM judge.
            result.pass = await judgeResponse(
              config,
              result.question,
              result.response,
            );
          }

          if (!result.pass) {
            console.log('!!! FAILURE FOUND !!!');
            console.log(`Seed: ${seed}`);
            console.log(`Question: ${result.question.id}`);
            console.log(`Expected: ${result.question.expectedSubstring}`);
            console.log(`Actual Response: ${result.response}`);
            console.log('---------------------------');
            console.log(`NEW FROZEN CASE SUGGESTION:`);
            console.log(`
  componentEvalTest('ALWAYS_PASSES', {
    suiteName: 'context-manager',
    suiteType: 'component-level',
    name: 'ContextManager Frozen Case - ${result.question.id} (Budget: ${sidecarConfig.budget.retainedTokens})',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const scenario = getScenario('scenario-c-compiler');
      const sidecarConfig: SidecarConfig = ${JSON.stringify(sidecarConfig, null, 2)};
      const seed = ${seed};
      const result = await runContextManagerEval(config, sidecarConfig, seed, scenario);
      expect(result.pass, \`Recall failed for ${result.question.id}. Response: \${result.response}\`).toBe(true);
    }
  });
            `);
          } else {
            console.log(
              `Iteration ${i} (Budget: ${sidecarConfig.budget.retainedTokens}, Seed: ${seed}) passed.`,
            );
          }
        }
      },
    });
  }

  // --- Frozen cases discovered by explorer ---

  componentEvalTest('ALWAYS_PASSES', {
    suiteName: 'context-manager',
    suiteType: 'component-level',
    name: 'ContextManager Frozen Case - lexer-constraint (Budget: 3737)',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const scenario = getScenario('scenario-c-compiler');
      const sidecarConfig: SidecarConfig = {
        budget: {
          retainedTokens: 3737,
          maxTokens: 11280,
        },
        gcBackstop: {
          strategy: 'truncate',
          target: 'incremental',
          freeTokensTarget: 373,
        },
        pipelines: [
          {
            name: 'Immediate Sanitization',
            triggers: ['on_turn'],
            execution: 'blocking',
            processors: [
              {
                processorId: 'ToolMaskingProcessor',
                options: {
                  stringLengthThresholdTokens: 2442,
                },
              },
              {
                processorId: 'BlobDegradationProcessor',
                options: {},
              },
              {
                processorId: 'SemanticCompressionProcessor',
                options: {
                  nodeThresholdTokens: 733,
                },
              },
              {
                processorId: 'EmergencyTruncationProcessor',
                options: {},
              },
            ],
          },
          {
            name: 'Deep Background Compression',
            triggers: [
              {
                type: 'timer',
                intervalMs: 100,
              },
              'budget_exceeded',
            ],
            execution: 'background',
            processors: [
              {
                processorId: 'HistorySquashingProcessor',
                options: {
                  maxTokensPerNode: 327,
                },
              },
            ],
          },
        ],
      };
      const seed = 288421;
      const result = await runContextManagerEval(
        config,
        sidecarConfig,
        seed,
        scenario,
      );
      expect(
        result.pass,
        `Recall failed for lexer-constraint. Response: ${result.response}`,
      ).toBe(true);
    },
  });

  componentEvalTest('ALWAYS_PASSES', {
    suiteName: 'context-manager',
    suiteType: 'component-level',
    name: 'ContextManager Frozen Case - final-name (Budget: 5321)',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const scenario = getScenario('scenario-c-compiler');
      const sidecarConfig: SidecarConfig = {
        budget: {
          retainedTokens: 5321,
          maxTokens: 11398,
        },
        gcBackstop: {
          strategy: 'truncate',
          target: 'incremental',
          freeTokensTarget: 532,
        },
        pipelines: [
          {
            name: 'Immediate Sanitization',
            triggers: ['on_turn'],
            execution: 'blocking',
            processors: [
              {
                processorId: 'ToolMaskingProcessor',
                options: {
                  stringLengthThresholdTokens: 2952,
                },
              },
              {
                processorId: 'BlobDegradationProcessor',
                options: {},
              },
              {
                processorId: 'SemanticCompressionProcessor',
                options: {
                  nodeThresholdTokens: 1632,
                },
              },
              {
                processorId: 'EmergencyTruncationProcessor',
                options: {},
              },
            ],
          },
          {
            name: 'Deep Background Compression',
            triggers: [
              {
                type: 'timer',
                intervalMs: 100,
              },
              'budget_exceeded',
            ],
            execution: 'background',
            processors: [
              {
                processorId: 'HistorySquashingProcessor',
                options: {
                  maxTokensPerNode: 355,
                },
              },
              {
                processorId: 'StateSnapshotProcessor',
                options: {},
              },
            ],
          },
        ],
      };
      const seed = 826619;
      const result = await runContextManagerEval(
        config,
        sidecarConfig,
        seed,
        scenario,
      );
      expect(
        result.pass,
        `Recall failed for final-name. Response: ${result.response}`,
      ).toBe(true);
    },
  });

  componentEvalTest('ALWAYS_PASSES', {
    suiteName: 'context-manager',
    suiteType: 'component-level',
    name: 'ContextManager Frozen Case - secret-beta (Budget: 1314)',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const scenario = getScenario('scenario-c-compiler');
      const sidecarConfig: SidecarConfig = {
        budget: {
          retainedTokens: 1314,
          maxTokens: 2067,
        },
        gcBackstop: {
          strategy: 'truncate',
          target: 'incremental',
          freeTokensTarget: 131,
        },
        pipelines: [
          {
            name: 'Immediate Sanitization',
            triggers: ['on_turn'],
            execution: 'blocking',
            processors: [
              {
                processorId: 'ToolMaskingProcessor',
                options: {
                  stringLengthThresholdTokens: 738,
                },
              },
              {
                processorId: 'BlobDegradationProcessor',
                options: {},
              },
              {
                processorId: 'SemanticCompressionProcessor',
                options: {
                  nodeThresholdTokens: 195,
                },
              },
              {
                processorId: 'EmergencyTruncationProcessor',
                options: {},
              },
            ],
          },
          {
            name: 'Deep Background Compression',
            triggers: [
              {
                type: 'timer',
                intervalMs: 100,
              },
              'budget_exceeded',
            ],
            execution: 'background',
            processors: [
              {
                processorId: 'HistorySquashingProcessor',
                options: {
                  maxTokensPerNode: 108,
                },
              },
              {
                processorId: 'StateSnapshotProcessor',
                options: {},
              },
            ],
          },
        ],
      };
      const seed = 475216;
      const result = await runContextManagerEval(
        config,
        sidecarConfig,
        seed,
        scenario,
      );
      expect(
        result.pass,
        `Recall failed for secret-beta. Response: ${result.response}`,
      ).toBe(true);
    },
  });

  componentEvalTest('ALWAYS_PASSES', {
    suiteName: 'context-manager',
    suiteType: 'component-level',
    name: 'ContextManager Frozen Case - codegen-header (Budget: 2585)',
    configOverrides: { model: EVAL_MODEL },
    timeout: 240000, // 4 minutes to allow Gemini 2.5 Pro to compress even with rate limits/load shedding
    assert: async (config: Config) => {
      const scenario = getScenario('scenario-c-compiler');
      const targetQuestion = scenario.questions.find(
        (q) => q.id === 'codegen-header',
      );
      if (targetQuestion) {
        targetQuestion.expectedSubstring = 'Generated by GigaC';
      }
      const sidecarConfig: SidecarConfig = {
        budget: {
          retainedTokens: 2585,
          maxTokens: 4196,
        },
        gcBackstop: {
          strategy: 'truncate',
          target: 'incremental',
          freeTokensTarget: 258,
        },
        pipelines: [
          {
            name: 'Immediate Sanitization',
            triggers: ['on_turn'],
            execution: 'blocking',
            processors: [
              {
                processorId: 'ToolMaskingProcessor',
                options: {
                  stringLengthThresholdTokens: 720,
                },
              },
              {
                processorId: 'BlobDegradationProcessor',
                options: {},
              },
              {
                processorId: 'SemanticCompressionProcessor',
                options: {
                  nodeThresholdTokens: 336,
                },
              },
              {
                processorId: 'EmergencyTruncationProcessor',
                options: {},
              },
            ],
          },
          {
            name: 'Deep Background Compression',
            triggers: [
              {
                type: 'timer',
                intervalMs: 100,
              },
              'budget_exceeded',
            ],
            execution: 'background',
            processors: [
              {
                processorId: 'HistorySquashingProcessor',
                options: {
                  maxTokensPerNode: 237,
                },
              },
              {
                processorId: 'StateSnapshotProcessor',
                options: {},
              },
            ],
          },
        ],
      };
      const seed = 715277;
      const result = await runContextManagerEval(
        config,
        sidecarConfig,
        seed,
        scenario,
      );
      expect(
        result.pass,
        `Recall failed for codegen-header. Response: ${result.response}`,
      ).toBe(true);
    },
  });
});
