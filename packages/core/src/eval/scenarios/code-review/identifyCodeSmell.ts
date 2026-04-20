/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const identifyCodeSmell: EvalScenario = {
  id: 'review-identify-code-smell',
  name: 'Identify Code Smells',
  category: 'code-review',
  difficulty: 'medium',
  description:
    'Identify multiple code smells in a function including magic numbers, long parameter lists, and feature envy.',
  setupFiles: {
    'src/pricing.ts': `
export function calculatePrice(
  basePrice: number,
  quantity: number,
  customerType: string,
  loyaltyPoints: number,
  couponCode: string,
  isHoliday: boolean,
  region: string,
  shippingWeight: number,
): number {
  let price = basePrice * quantity;
  if (customerType === 'premium') {
    price = price * 0.9;
  }
  if (loyaltyPoints > 1000) {
    price = price * 0.95;
  }
  if (couponCode === 'SAVE20') {
    price = price * 0.8;
  }
  if (isHoliday) {
    price = price * 1.1;
  }
  if (region === 'EU') {
    price = price * 1.2;
  }
  price = price + shippingWeight * 0.5;
  if (price < 0) price = 0;
  return Math.round(price * 100) / 100;
}
`,
  },
  prompt:
    'Review src/pricing.ts and identify code smells. Refactor to fix the long parameter list, magic numbers, and string comparisons.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/pricing.ts',
        shouldExist: true,
        contentContains: ['interface'],
        contentNotContains: ["=== 'SAVE20'"],
      },
    ],
  },
  tags: ['code-smell', 'refactoring', 'intermediate'],
};
