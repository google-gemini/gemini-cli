/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addSort: EvalScenario = {
  id: 'feature-add-sort',
  name: 'Add Sorting Support',
  category: 'new-features',
  difficulty: 'easy',
  description:
    'Add configurable sorting by field and direction to a list function.',
  setupFiles: {
    'src/products.ts': `
export interface Product {
  id: string;
  name: string;
  price: number;
  rating: number;
}

const products: Product[] = [];

export function listProducts(): Product[] {
  return [...products];
}
`,
  },
  prompt:
    'Add sorting support to listProducts in src/products.ts. Accept a sortBy field (name, price, rating) and order (asc/desc).',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/products.ts',
        shouldExist: true,
        contentContains: ['sort', 'asc'],
      },
    ],
  },
  tags: ['sort', 'ordering', 'beginner'],
};
