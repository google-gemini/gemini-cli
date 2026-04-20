/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixRaceCondition: EvalScenario = {
  id: 'debug-fix-race-condition',
  name: 'Fix Race Condition in Async Initialization',
  category: 'debugging',
  difficulty: 'hard',
  description:
    'Fix a race condition where multiple callers can trigger initialization simultaneously, leading to duplicate work.',
  setupFiles: {
    'src/service.ts': `
export class ConfigService {
  private config: Record<string, string> | null = null;
  private loading = false;

  async getConfig(): Promise<Record<string, string>> {
    if (this.config) return this.config;

    this.loading = true;
    // Simulate async config loading
    this.config = await this.loadFromDisk();
    this.loading = false;

    return this.config;
  }

  private async loadFromDisk(): Promise<Record<string, string>> {
    return { key: 'value' };
  }
}
`,
  },
  prompt:
    'Fix the race condition in src/service.ts. If multiple callers invoke getConfig() concurrently, loadFromDisk() may be called multiple times. Use a promise-based locking pattern.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/service.ts',
        shouldExist: true,
        contentContains: ['Promise'],
        contentNotContains: ['this.loading = true;'],
      },
    ],
  },
  tags: ['race-condition', 'async', 'advanced'],
};
