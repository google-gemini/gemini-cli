/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type ChallengeType = 'trade-off' | 'debug-scenario' | 'refactor' | 'concept-quiz';

export interface Challenge {
  id: string;
  concept: string;
  type: ChallengeType;
  title: string;
  scenario: string;
  question: string;
  keyCriteria: string[];
  solutionPoints: string[];
}
