/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type EvalCategory =
  | 'debugging'
  | 'refactoring'
  | 'new-features'
  | 'code-review'
  | 'documentation';
export type EvalDifficulty = 'easy' | 'medium' | 'hard';

export interface FileChange {
  path: string;
  shouldExist: boolean;
  contentContains?: string[];
  contentNotContains?: string[];
}

export interface ExpectedOutcome {
  fileChanges?: FileChange[];
  outputContains?: string[];
  outputNotContains?: string[];
  exitCode?: number;
}

export interface EvalScenario {
  id: string;
  name: string;
  category: EvalCategory;
  difficulty: EvalDifficulty;
  description: string;
  setupFiles: Record<string, string>;
  prompt: string;
  expectedOutcome: ExpectedOutcome;
  timeoutMs?: number;
  tags?: string[];
}

export interface EvalResult {
  scenarioId: string;
  passed: boolean;
  score: number;
  duration: number;
  output: string;
  fileChanges: Record<string, string>;
  errors: string[];
  details: ScoreBreakdown;
}

export interface ScoreBreakdown {
  fileChangeScore: number;
  outputScore: number;
  errorScore: number;
  timeBonus: number;
}

export interface CategoryScore {
  total: number;
  passed: number;
  failed: number;
  averageScore: number;
}

export interface ScoreCard {
  totalScenarios: number;
  passed: number;
  failed: number;
  averageScore: number;
  byCategory: Record<string, CategoryScore>;
  byDifficulty: Record<string, CategoryScore>;
  duration: number;
  timestamp: number;
  version: string;
}

export interface BaselineComparison {
  improved: string[];
  regressed: string[];
  unchanged: string[];
  newScenarios: string[];
  removedScenarios: string[];
  overallDelta: number;
}
