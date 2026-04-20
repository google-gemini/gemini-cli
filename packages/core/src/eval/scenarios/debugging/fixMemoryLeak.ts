/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixMemoryLeak: EvalScenario = {
  id: 'debug-fix-memory-leak',
  name: 'Fix Event Listener Memory Leak',
  category: 'debugging',
  difficulty: 'medium',
  description:
    'Fix a memory leak caused by event listeners not being cleaned up on component destruction.',
  setupFiles: {
    'src/component.ts': `
export class JsonStreamProcessor {
  private buffer: string[] = [];
  private handler: ((data: string) => void) | null = null;

  start(stream: NodeJS.EventEmitter): void {
    this.handler = (data: string) => {
      this.buffer.push(data);
    };
    stream.on('data', this.handler);
  }

  getBuffer(): string[] {
    return [...this.buffer];
  }

  destroy(): void {
    this.buffer = [];
    // Missing: stream listener cleanup
  }
}
`,
  },
  prompt:
    'Fix the memory leak in src/component.ts. The destroy method does not remove the event listener from the stream.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/component.ts',
        shouldExist: true,
        contentContains: ['removeListener', 'destroy'],
      },
    ],
  },
  tags: ['memory-leak', 'event-listener', 'intermediate'],
};
