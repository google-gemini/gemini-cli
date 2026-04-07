/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe } from 'vitest';
import { componentEvalTest } from './component-test-helper.js';
import {
  AgentHistoryProvider,
  ChatCompressionService,
  GeminiChat,
} from '@google/gemini-cli-core';
import type { Content } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type EvalPolicy, EVAL_MODEL } from './test-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data', 'compression');

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

interface CompressionConfig {
  name: string;
  getBudget: (config: any, originalTokens: number) => number;
  setupAndCompress: (config: any, history: Content[]) => Promise<Content[]>;
}

const getScenario = (id: string): Scenario => {
  const filePath = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Scenario file not found at ${filePath}. Make sure to generate fixtures first.`,
    );
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as Scenario;
};

const configs: Record<string, CompressionConfig> = {
  ChatCompressionService: {
    name: 'ChatCompressionService',
    getBudget: (_config: any, originalTokens: number) => originalTokens,
    setupAndCompress: async (config: any, history: Content[]) => {
      const mockContext = {
        config,
        promptId: 'test-prompt-id',
        toolRegistry: undefined as any,
        promptRegistry: undefined as any,
        resourceRegistry: undefined as any,
        messageBus: undefined as any,
        geminiClient: undefined as any,
        sandboxManager: undefined as any,
      };
      const chat = new GeminiChat(mockContext, '', [], history);
      const chatService = new ChatCompressionService();
      const result = await chatService.compress(
        chat,
        'test-prompt-id',
        true, // force compression
        config.getModel(),
        config,
        false, // hasFailedCompressionAttempt
      );
      return result.newHistory ?? history;
    },
  },
  'AgentHistoryProvider (Tight)': {
    name: 'AgentHistoryProvider (Tight)',
    getBudget: () => 1000,
    setupAndCompress: async (config: any, history: Content[]) => {
      const providerConfig = {
        isTruncationEnabled: true,
        isSummarizationEnabled: true,
        maxTokens: 1000,
        retainedTokens: 300,
        normalMessageTokens: 100,
        maximumMessageTokens: 200,
        normalizationHeadRatio: 0.1,
      };
      const provider = new AgentHistoryProvider(providerConfig, config);
      return await provider.manageHistory(history);
    },
  },
  'AgentHistoryProvider (Generous)': {
    name: 'AgentHistoryProvider (Generous)',
    getBudget: () => 5000,
    setupAndCompress: async (config: any, history: Content[]) => {
      const providerConfig = {
        isTruncationEnabled: true,
        isSummarizationEnabled: true,
        maxTokens: 5000,
        retainedTokens: 2000,
        normalMessageTokens: 500,
        maximumMessageTokens: 1000,
        normalizationHeadRatio: 0.2,
      };
      const provider = new AgentHistoryProvider(providerConfig, config);
      return await provider.manageHistory(history);
    },
  },
};

function componentEval(
  name: string,
  policy: EvalPolicy,
  scenario: Scenario,
  configName: keyof typeof configs,
  questionId: string,
) {
  const compConfig = configs[configName];
  const question = scenario.questions.find((q) => q.id === questionId);
  if (!question) {
    throw new Error(
      `Question ${questionId} not found in scenario ${scenario.scenarioId}`,
    );
  }

  componentEvalTest(policy, {
    name,
    configOverrides: { model: EVAL_MODEL },
    assert: async (config) => {
      const originalTokens =
        (
          await config.getContentGenerator().countTokens({
            model: config.getModel(),
            contents: scenario.history,
          })
        ).totalTokens ?? 0;

      const compressedHistory = await compConfig.setupAndCompress(
        config,
        scenario.history,
      );

      expect(compressedHistory.length).toBeLessThanOrEqual(
        scenario.history.length,
      );

      const compressedTokens =
        (
          await config.getContentGenerator().countTokens({
            model: config.getModel(),
            contents: compressedHistory,
          })
        ).totalTokens ?? 0;

      const budget = compConfig.getBudget(config, originalTokens);

      if (compressedTokens > budget) {
        console.log(
          `Token budget exceeded. \nBudget: ${budget}\nActual: ${compressedTokens}`,
        );
        console.log(`Original tokens: ${originalTokens}`);
        console.log(`Compressed History length: ${compressedHistory.length}`);
      }
      expect(compressedTokens).toBeLessThanOrEqual(budget);

      const evalHistory: Content[] = [
        ...compressedHistory,
        { role: 'user', parts: [{ text: question.prompt }] },
      ];

      const response = await config
        .getContentGenerator()
        .generateContent(
          { model: config.getModel(), config: {}, contents: evalHistory },
          'eval-prompt',
          'eval',
        );

      const responseText = response.text || '';

      const pass = responseText
        .toLowerCase()
        .includes(question.expectedSubstring.toLowerCase());
      if (!pass) {
        console.log(
          `Eval Failed. \nExpected to find: "${question.expectedSubstring}"\nResponse: "${responseText}"`,
        );
        console.log(
          `Compressed History: ${JSON.stringify(compressedHistory, null, 2)}`,
        );
      }
      expect(pass).toBe(true);
    },
  });
}

describe('Compression Benchmark', () => {
  describe('Blind Guessing', () => {
    const scenario = getScenario('scenario-blind-guess');
    componentEval(
      'ChatCompressionService - exact-error-string',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'exact-error-string',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - exact-error-string',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'exact-error-string',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - exact-error-string',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'exact-error-string',
    );
  });

  describe('Conditional Instructions', () => {
    const scenario = getScenario('scenario-conditional-instruction');
    componentEval(
      'ChatCompressionService - error-handler',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'error-handler',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - error-handler',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'error-handler',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - error-handler',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'error-handler',
    );
  });

  describe('Constraints', () => {
    const scenario = getScenario('scenario-constraints');
    componentEval(
      'ChatCompressionService - variable-naming',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'variable-naming',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - variable-naming',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'variable-naming',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - variable-naming',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'variable-naming',
    );
    componentEval(
      'ChatCompressionService - deployment-target',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'deployment-target',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - deployment-target',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'deployment-target',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - deployment-target',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'deployment-target',
    );
  });

  describe('Context Amnesia', () => {
    const scenario = getScenario('scenario-context-amnesia');
    componentEval(
      'ChatCompressionService - recall-file-content',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'recall-file-content',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - recall-file-content',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'recall-file-content',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - recall-file-content',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'recall-file-content',
    );
  });

  describe('Context Thrashing', () => {
    const scenario = getScenario('scenario-context-thrashing');
    componentEval(
      'ChatCompressionService - failed-edit-reason',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'failed-edit-reason',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - failed-edit-reason',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'failed-edit-reason',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - failed-edit-reason',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'failed-edit-reason',
    );
  });

  describe('Dependency Chain', () => {
    const scenario = getScenario('scenario-dependency-chain');
    componentEval(
      'ChatCompressionService - migration-dependency',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'migration-dependency',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - migration-dependency',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'migration-dependency',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - migration-dependency',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'migration-dependency',
    );
  });

  describe('Massive Working Set', () => {
    const scenario = getScenario('scenario-massive-working-set');
    componentEval(
      'ChatCompressionService - file-25-presence',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'file-25-presence',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - file-25-presence',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'file-25-presence',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - file-25-presence',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'file-25-presence',
    );
  });

  describe('Middle Reasoning', () => {
    const scenario = getScenario('scenario-middle-reasoning');
    componentEval(
      'ChatCompressionService - conflict-pid',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'conflict-pid',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - conflict-pid',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'conflict-pid',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - conflict-pid',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'conflict-pid',
    );
  });

  describe('Milestones', () => {
    const scenario = getScenario('scenario-milestones');
    componentEval(
      'ChatCompressionService - tax-function-name',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'tax-function-name',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - tax-function-name',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'tax-function-name',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - tax-function-name',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'tax-function-name',
    );
    componentEval(
      'ChatCompressionService - milestone-name',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'milestone-name',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - milestone-name',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'milestone-name',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - milestone-name',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'milestone-name',
    );
  });

  describe('Multi-Bug Tracking', () => {
    const scenario = getScenario('scenario-multi-bug-tracking');
    componentEval(
      'ChatCompressionService - bug-list',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'bug-list',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - bug-list',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'bug-list',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - bug-list',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'bug-list',
    );
  });

  describe('Myopic Keyhole', () => {
    const scenario = getScenario('scenario-myopic-keyhole');
    componentEval(
      'ChatCompressionService - macro-context-inheritance',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'macro-context-inheritance',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - macro-context-inheritance',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'macro-context-inheritance',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - macro-context-inheritance',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'macro-context-inheritance',
    );
  });

  describe('Negative Constraints', () => {
    const scenario = getScenario('scenario-negative-constraints');
    componentEval(
      'ChatCompressionService - import-constraint',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'import-constraint',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - import-constraint',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'import-constraint',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - import-constraint',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'import-constraint',
    );
  });

  describe('Nested Logic', () => {
    const scenario = getScenario('scenario-nested-logic');
    componentEval(
      'ChatCompressionService - fallback-mode',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'fallback-mode',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - fallback-mode',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'fallback-mode',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - fallback-mode',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'fallback-mode',
    );
  });

  describe('Replace Loop', () => {
    const scenario = getScenario('scenario-replace-loop');
    componentEval(
      'ChatCompressionService - recall-exact-line',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'recall-exact-line',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - recall-exact-line',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'recall-exact-line',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - recall-exact-line',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'recall-exact-line',
    );
  });

  describe('Spatial Scattering', () => {
    const scenario = getScenario('scenario-spatial-scattering');
    componentEval(
      'ChatCompressionService - recall-target-directory',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'recall-target-directory',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - recall-target-directory',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'recall-target-directory',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - recall-target-directory',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'recall-target-directory',
    );
  });

  describe('State Tracking', () => {
    const scenario = getScenario('scenario-state-tracking');
    componentEval(
      'ChatCompressionService - next-step',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'next-step',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - next-step',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'next-step',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - next-step',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'next-step',
    );
  });

  describe('Strategy Abandonment', () => {
    const scenario = getScenario('scenario-strategy-abandonment');
    componentEval(
      'ChatCompressionService - recall-next-action',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'recall-next-action',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - recall-next-action',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'recall-next-action',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - recall-next-action',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'recall-next-action',
    );
  });

  describe('Subtle Preference', () => {
    const scenario = getScenario('scenario-subtle-preference');
    componentEval(
      'ChatCompressionService - commit-prefix',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'commit-prefix',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - commit-prefix',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'commit-prefix',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - commit-prefix',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'commit-prefix',
    );
  });

  describe('Surgical Imprecision', () => {
    const scenario = getScenario('scenario-surgical-imprecision');
    componentEval(
      'ChatCompressionService - surgical-edit-check',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'surgical-edit-check',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - surgical-edit-check',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'surgical-edit-check',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - surgical-edit-check',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'surgical-edit-check',
    );
  });

  describe('Symbol Location Amnesia', () => {
    const scenario = getScenario('scenario-symbol-location-amnesia');
    componentEval(
      'ChatCompressionService - recall-symbol-file',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'recall-symbol-file',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - recall-symbol-file',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'recall-symbol-file',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - recall-symbol-file',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'recall-symbol-file',
    );
  });

  describe('Tool Noise', () => {
    const scenario = getScenario('scenario-tool-noise');
    componentEval(
      'ChatCompressionService - fatal-error',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'fatal-error',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - fatal-error',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'fatal-error',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - fatal-error',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'fatal-error',
    );
    componentEval(
      'ChatCompressionService - success-token',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'success-token',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - success-token',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'success-token',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - success-token',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'success-token',
    );
  });

  describe('Variable Leak', () => {
    const scenario = getScenario('scenario-variable-leak');
    componentEval(
      'ChatCompressionService - debug-token',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'debug-token',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - debug-token',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'debug-token',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - debug-token',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'debug-token',
    );
  });

  describe('Verification Abandonment', () => {
    const scenario = getScenario('scenario-verification-abandonment');
    componentEval(
      'ChatCompressionService - recall-next-discipline',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'recall-next-discipline',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - recall-next-discipline',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'recall-next-discipline',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - recall-next-discipline',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'recall-next-discipline',
    );
  });

  describe('Working Set Amnesia', () => {
    const scenario = getScenario('scenario-working-set-amnesia');
    componentEval(
      'ChatCompressionService - recall-modified-file',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'recall-modified-file',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - recall-modified-file',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'recall-modified-file',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - recall-modified-file',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'recall-modified-file',
    );
  });

  describe('XML Robustness', () => {
    const scenario = getScenario('scenario-xml-robustness');
    componentEval(
      'ChatCompressionService - xml-injection',
      'ALWAYS_PASSES',
      scenario,
      'ChatCompressionService',
      'xml-injection',
    );
    componentEval(
      'AgentHistoryProvider (Tight) - xml-injection',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Tight)',
      'xml-injection',
    );
    componentEval(
      'AgentHistoryProvider (Generous) - xml-injection',
      'ALWAYS_PASSES',
      scenario,
      'AgentHistoryProvider (Generous)',
      'xml-injection',
    );
  });
});
