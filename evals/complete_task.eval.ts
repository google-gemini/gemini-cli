/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('complete_task', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent inspects code via read_file and returns final review findings when requested',
    files: {
      'src/app.js': 'console.log("App running");',
    },
    prompt:
      'Perform a code review of src/app.js and submit your final summary when done.',
    setup: async (rig) => {
      rig.setBreakpoint(['read_file']);
    },
    assert: async (rig) => {
      // 1. Must inspect src/app.js via read_file
      const confirmation = await rig.waitForPendingConfirmation(
        ['read_file'],
        30000,
      );

      expect(
        confirmation,
        'Expected read_file confirmation before completing the review',
      ).toBeDefined();
      expect(
        confirmation.toolName,
        'Agent must read src/app.js before completing the task',
      ).toBe('read_file');

      await rig.resolveTool(confirmation);

      // Verify read_file was called for src/app.js
      const toolCalls = (rig as any).getToolCalls();
      const readFileCall = toolCalls.find(
        (call: any) => call.request?.name === 'read_file',
      );
      expect(
        readFileCall,
        'Expected read_file call in tool logs',
      ).toBeDefined();
      const readFileArgs = JSON.stringify(
        readFileCall?.request?.args ?? {},
      ).toLowerCase();
      expect(
        readFileArgs.includes('app.js'),
        'read_file must target src/app.js',
      ).toBe(true);

      // Wait for agent to finish turn and produce final summary
      await rig.waitForIdle(30000);

      // 2. Verify the assistant's response text contains substantive code review analysis
      const output = (
        (rig as any).getLastModelTextResponse?.() || ''
      ).toLowerCase();

      // Reject trivially short output
      expect(
        output.length,
        'Code review summary output must contain substantive review content (> 50 chars)',
      ).toBeGreaterThan(50);

      // Require at least 2 of the 3 code-specific elements from src/app.js
      const codeElements = [
        output.includes('console.log'),
        output.includes('app running'),
        output.includes('app.js'),
      ];
      const matchCount = codeElements.filter(Boolean).length;
      expect(
        matchCount,
        `Code review output must reference at least 2 code elements from src/app.js (found ${matchCount}/3: console.log=${codeElements[0]}, app running=${codeElements[1]}, app.js=${codeElements[2]})`,
      ).toBeGreaterThanOrEqual(2);

      // Require actual review findings/analysis terms
      const reviewKeywords = [
        'review',
        'summary',
        'finding',
        'issue',
        'bug',
        'clean',
        'correct',
        'simple',
        'print',
        'log',
        'check',
        'pass',
        'good',
        'valid',
        'analysis',
        'assess',
        'quality',
        'no issue',
        'looks good',
      ];
      const hasReviewAnalysis = reviewKeywords.some((kw) =>
        output.includes(kw),
      );
      expect(
        hasReviewAnalysis,
        'Code review output must contain actual findings or analysis (e.g., summary, findings, issues, code assessment)',
      ).toBe(true);
    },
  });
});
