/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type ChallengeCategory =
  | 'basics'
  | 'file-operations'
  | 'data-processing'
  | 'api-integration'
  | 'testing'
  | 'debugging'
  | 'optimization'
  | 'architecture';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  category: ChallengeCategory;
  estimatedTime: string;
  points: number;
  prerequisites?: string[];
  hints: string[];
  solution: string;
  solutionExplanation: string;
  testCases: TestCase[];
  environment?: EnvironmentConfig;
}

export interface TestCase {
  name: string;
  input: string;
  expectedOutput: string;
  isHidden?: boolean;
}

export interface EnvironmentConfig {
  language: string;
  dependencies?: string[];
  files?: Record<string, string>;
  timeout?: number;
}

export interface ChallengeAttempt {
  challengeId: string;
  startedAt: number;
  submittedAt?: number;
  code: string;
  passed: boolean;
  testResults: TestResult[];
  hintsUsed: number;
  solutionViewed: boolean;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  actualOutput: string;
  expectedOutput: string;
  error?: string;
}

export interface ChallengeProgress {
  challengeId: string;
  completed: boolean;
  bestScore: number;
  attempts: number;
  hintsUsed: number;
  solutionViewed: boolean;
  firstCompletedAt?: number;
  lastAttemptAt: number;
}

export interface PlaygroundStats {
  totalChallenges: number;
  completedChallenges: number;
  totalPoints: number;
  maxPoints: number;
  completionRate: number;
  averageAttempts: number;
  totalTimeSpent: number;
  challengesByDifficulty: {
    beginner: { total: number; completed: number };
    intermediate: { total: number; completed: number };
    advanced: { total: number; completed: number };
    expert: { total: number; completed: number };
  };
  challengesByCategory: Record<string, { total: number; completed: number }>;
}

export interface DailyChallenge {
  date: string;
  challengeId: string;
  bonus: number;
  completed: boolean;
}
