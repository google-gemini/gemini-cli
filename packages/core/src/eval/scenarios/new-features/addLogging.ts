/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addLogging: EvalScenario = {
  id: 'feature-add-logging',
  name: 'Add Structured Logging',
  category: 'new-features',
  difficulty: 'medium',
  description:
    'Add structured logging to a service class with log levels and context.',
  setupFiles: {
    'src/orderService.ts': `
export class OrderService {
  async placeOrder(userId: string, items: string[]): Promise<string> {
    const orderId = Math.random().toString(36).slice(2);
    // process order
    return orderId;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    // cancel order
    return true;
  }

  async getOrder(orderId: string): Promise<{ id: string; status: string }> {
    return { id: orderId, status: 'pending' };
  }
}
`,
  },
  prompt:
    'Add structured logging to the OrderService in src/orderService.ts. Log method entry/exit with parameters and results. Create a Logger interface.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/orderService.ts',
        shouldExist: true,
        contentContains: ['Logger', 'log'],
      },
    ],
  },
  tags: ['logging', 'structured', 'intermediate'],
};
