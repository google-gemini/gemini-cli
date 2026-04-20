/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const generateJsdoc: EvalScenario = {
  id: 'docs-generate-jsdoc',
  name: 'Generate JSDoc Comments',
  category: 'documentation',
  difficulty: 'easy',
  description: 'Add JSDoc comments to all exported functions and interfaces.',
  setupFiles: {
    'src/math.ts': `
export interface Point {
  x: number;
  y: number;
}

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function translate(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}
`,
  },
  prompt:
    'Add JSDoc comments to all exported functions and the interface in src/math.ts. Include @param and @returns tags.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/math.ts',
        shouldExist: true,
        contentContains: ['/**', '@param', '@returns'],
      },
    ],
  },
  tags: ['jsdoc', 'comments', 'beginner'],
};
