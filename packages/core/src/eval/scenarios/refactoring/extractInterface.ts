/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const extractInterface: EvalScenario = {
  id: 'refactor-extract-interface',
  name: 'Extract Interface from Class',
  category: 'refactoring',
  difficulty: 'medium',
  description:
    'Extract a TypeScript interface from a concrete class to enable dependency inversion.',
  setupFiles: {
    'src/storage.ts': `
export class FileStorage {
  async read(key: string): Promise<string | null> {
    // reads from filesystem
    return null;
  }

  async write(key: string, value: string): Promise<void> {
    // writes to filesystem
  }

  async delete(key: string): Promise<boolean> {
    // deletes from filesystem
    return true;
  }

  async list(): Promise<string[]> {
    // lists all keys
    return [];
  }
}
`,
  },
  prompt:
    'Extract a Storage interface from the FileStorage class in src/storage.ts. The class should implement the new interface.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/storage.ts',
        shouldExist: true,
        contentContains: ['interface', 'implements'],
      },
    ],
  },
  tags: ['interface', 'dependency-inversion', 'intermediate'],
};
