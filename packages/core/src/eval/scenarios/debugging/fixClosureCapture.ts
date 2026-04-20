/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixClosureCapture: EvalScenario = {
  id: 'debug-fix-closure-capture',
  name: 'Fix Closure Variable Capture in setTimeout',
  category: 'debugging',
  difficulty: 'medium',
  description:
    'Fix a bug where setTimeout callbacks capture the final value of a loop variable instead of each iteration value.',
  setupFiles: {
    'src/scheduler.ts': `
export function scheduleMessages(messages: string[]): void {
  for (var i = 0; i < messages.length; i++) {
    setTimeout(() => {
      console.log(messages[i]);
    }, i * 100);
  }
}
`,
  },
  prompt:
    'Fix the closure capture bug in src/scheduler.ts. The setTimeout callback captures the var i, which has the wrong value when the callback executes.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/scheduler.ts',
        shouldExist: true,
        contentNotContains: ['for (var i'],
      },
    ],
  },
  tags: ['closure', 'setTimeout', 'intermediate'],
};
