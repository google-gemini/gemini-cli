/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const identifyNPlusOne: EvalScenario = {
  id: 'review-identify-n-plus-one',
  name: 'Identify N+1 Query Problem',
  category: 'code-review',
  difficulty: 'hard',
  description:
    'Identify an N+1 query problem where a loop makes individual database calls instead of batching.',
  setupFiles: {
    'src/orders.ts': `
export interface Order {
  id: string;
  userId: string;
  total: number;
}

export interface User {
  id: string;
  name: string;
}

export interface DB {
  getOrders(): Promise<Order[]>;
  getUserById(id: string): Promise<User>;
}

export async function getOrderSummaries(db: DB): Promise<{ order: Order; user: User }[]> {
  const orders = await db.getOrders();
  const summaries = [];
  for (const order of orders) {
    const user = await db.getUserById(order.userId);
    summaries.push({ order, user });
  }
  return summaries;
}
`,
  },
  prompt:
    'Review src/orders.ts and identify the N+1 query problem. Fix it by batching the user lookups.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/orders.ts',
        shouldExist: true,
        contentContains: ['Map'],
        contentNotContains: [
          'const user = await db.getUserById(order.userId);',
        ],
      },
    ],
    outputContains: ['N+1'],
  },
  tags: ['n-plus-one', 'performance', 'database', 'advanced'],
};
