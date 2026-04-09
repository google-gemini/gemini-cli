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
): Promise<{
  pass: boolean;
  response: string;
  question: ScenarioQuestion;
  tokens: number;
}> {
  const harness = await SimulationHarness.create(
    sidecarConfig,
    config.getBaseLlmClient(),
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

  console.log('--- COMPRESSED HISTORY ---');
  console.log(JSON.stringify(compressedHistory, null, 2));
  console.log('--- END COMPRESSED HISTORY ---');

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
  const pass = responseText
    .toLowerCase()
    .includes(question.expectedSubstring.toLowerCase());

  const finalTokens = harness.env.tokenCalculator.calculateEpisodeListTokens(
    harness.contextManager.getWorkingBufferView(),
  );

  console.log(`Retained Budget: ${sidecarConfig.budget.retainedTokens}`);
  console.log(`Final Tokens: ${finalTokens}`);

  return { pass, response: responseText, question, tokens: finalTokens };
}

function generateRandomSidecarConfig(seed: number): SidecarConfig {
  // Simple LCG or similar for deterministic randomness from seed if needed,
  // but for a fuzzer we can just use Math.random and log the seed.
  const retained = 500 + Math.floor(Math.random() * 9500); // 500 to 10000
  const max = Math.floor(retained * (1.2 + Math.random() * 0.8)); // 20% to 100% buffer

  const strategies: Array<'truncate' | 'compress' | 'rollingSummarizer'> = [
    'truncate',
    'compress',
    'rollingSummarizer',
  ];
  const strategy = strategies[Math.floor(Math.random() * strategies.length)];

  const useSquashing = Math.random() > 0.5;
  const useSnapshot = Math.random() > 0.5;

  const processors: any[] = [
    {
      processorId: 'ToolMaskingProcessor',
      options: {
        stringLengthThresholdTokens: 2000 + Math.floor(Math.random() * 8000),
      },
    },
    { processorId: 'BlobDegradationProcessor', options: {} },
    {
      processorId: 'SemanticCompressionProcessor',
      options: { nodeThresholdTokens: 1000 + Math.floor(Math.random() * 4000) },
    },
    { processorId: 'EmergencyTruncationProcessor', options: {} },
  ];

  const backgroundProcessors: any[] = [];
  if (useSquashing) {
    backgroundProcessors.push({
      processorId: 'HistorySquashingProcessor',
      options: { maxTokensPerNode: 500 + Math.floor(Math.random() * 2500) },
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
      strategy,
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
        console.log('Starting ContextManager explorer loop...');
        for (let i = 0; i < 50; i++) {
          const seed = Math.floor(Math.random() * 1000000);
          const sidecarConfig = generateRandomSidecarConfig(seed);
          const result = await runContextManagerEval(
            config,
            sidecarConfig,
            seed,
            scenario,
          );

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
    name: 'ContextManager Baseline - Generous Budget (Full Recall)',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const budget = { retained: 100000, max: 200000 };
      const sidecarConfig: SidecarConfig = {
        budget: { retainedTokens: budget.retained, maxTokens: budget.max },
        gcBackstop: { strategy: 'truncate', target: 'incremental' },
        pipelines: [],
      };
      const seed = 42;
      const result = await runContextManagerEval(
        config,
        sidecarConfig,
        seed,
        scenario,
      );
      expect(
        result.pass,
        `Baseline recall failed for ${result.question.id}. Response: ${result.response}`,
      ).toBe(true);
    },
  });

  componentEvalTest('ALWAYS_PASSES', {
    suiteName: 'context-manager',
    suiteType: 'component-level',
    name: 'ContextManager - Recall spatial lexer path (Limited Budget)',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const sidecarConfig: SidecarConfig = {
        budget: { retainedTokens: 5000, maxTokens: 8000 },
        gcBackstop: {
          strategy: 'truncate',
          target: 'incremental',
          freeTokensTarget: 500,
        },
        pipelines: [
          {
            name: 'Immediate Sanitization',
            triggers: ['on_turn'],
            execution: 'blocking',
            processors: [
              {
                processorId: 'ToolMaskingProcessor',
                options: { stringLengthThresholdTokens: 8000 },
              },
              { processorId: 'BlobDegradationProcessor', options: {} },
              {
                processorId: 'SemanticCompressionProcessor',
                options: { nodeThresholdTokens: 5000 },
              },
              { processorId: 'EmergencyTruncationProcessor', options: {} },
            ],
          },
        ],
      };
      const seed = 12; // Deterministically pick spatial-lexer-path question
      const result = await runContextManagerEval(
        config,
        sidecarConfig,
        seed,
        scenario,
      );
      expect(
        result.pass,
        `Recall failed for spatial path. Response: ${result.response}`,
      ).toBe(true);
    },
  });

  componentEvalTest('ALWAYS_PASSES', {
    suiteName: 'context-manager',
    suiteType: 'component-level',
    name: 'ContextManager Frozen Case - secret-beta (Budget: 2564)',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const scenario = getScenario('scenario-c-compiler');
      const sidecarConfig: SidecarConfig = {
        budget: {
          retainedTokens: 2564,
          maxTokens: 3855,
        },
        gcBackstop: {
          strategy: 'rollingSummarizer',
          target: 'incremental',
          freeTokensTarget: 256,
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
                  stringLengthThresholdTokens: 3379,
                },
              },
              {
                processorId: 'BlobDegradationProcessor',
                options: {},
              },
              {
                processorId: 'SemanticCompressionProcessor',
                options: {
                  nodeThresholdTokens: 2456,
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
                  maxTokensPerNode: 2588,
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
      const seed = 248506;
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
    name: 'ContextManager Frozen Case - codegen-header (Budget: 1820)',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const scenario = getScenario('scenario-c-compiler');
      const sidecarConfig: SidecarConfig = {
        budget: {
          retainedTokens: 1820,
          maxTokens: 3353,
        },
        gcBackstop: {
          strategy: 'rollingSummarizer',
          target: 'incremental',
          freeTokensTarget: 182,
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
                  stringLengthThresholdTokens: 5375,
                },
              },
              {
                processorId: 'BlobDegradationProcessor',
                options: {},
              },
              {
                processorId: 'SemanticCompressionProcessor',
                options: {
                  nodeThresholdTokens: 3886,
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
                  maxTokensPerNode: 1999,
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
      const seed = 322027;
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

  componentEvalTest('ALWAYS_PASSES', {
    suiteName: 'context-manager',
    suiteType: 'component-level',
    name: 'ContextManager Frozen Case - lexer-constraint (Budget: 9097)',
    configOverrides: { model: EVAL_MODEL },
    assert: async (config: Config) => {
      const scenario = getScenario('scenario-c-compiler');
      const sidecarConfig: SidecarConfig = {
        budget: {
          retainedTokens: 9097,
          maxTokens: 16089,
        },
        gcBackstop: {
          strategy: 'compress',
          target: 'incremental',
          freeTokensTarget: 909,
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
                  stringLengthThresholdTokens: 8799,
                },
              },
              {
                processorId: 'BlobDegradationProcessor',
                options: {},
              },
              {
                processorId: 'SemanticCompressionProcessor',
                options: {
                  nodeThresholdTokens: 4044,
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
                  maxTokensPerNode: 1973,
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
      const seed = 161221;
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
});
