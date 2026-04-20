/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const spotRaceCondition: EvalScenario = {
  id: 'review-spot-race-condition',
  name: 'Spot Race Condition in Counter',
  category: 'code-review',
  difficulty: 'hard',
  description:
    'Identify a race condition in a concurrent counter that can lead to lost updates.',
  setupFiles: {
    'src/counter.ts': `
export class RequestCounter {
  private count = 0;

  async increment(): Promise<void> {
    const current = this.count;
    // simulate some async work
    await new Promise(resolve => setTimeout(resolve, 10));
    this.count = current + 1;
  }

  getCount(): number {
    return this.count;
  }
}
`,
  },
  prompt:
    'Review src/counter.ts for concurrency issues. The increment method has a race condition. Fix it.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/counter.ts',
        shouldExist: true,
        contentNotContains: ['const current = this.count;'],
      },
    ],
    outputContains: ['race condition'],
  },
  tags: ['race-condition', 'concurrency', 'advanced'],
};
