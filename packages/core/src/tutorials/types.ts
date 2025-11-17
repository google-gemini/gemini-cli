/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type TutorialDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type StepType = 'instruction' | 'exercise' | 'quiz' | 'practice';
export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'skipped';

export interface TutorialModule {
  id: string;
  title: string;
  description: string;
  difficulty: TutorialDifficulty;
  estimatedTime: string;
  prerequisites?: string[];
  steps: TutorialStep[];
  objectives: string[];
}

export interface TutorialStep {
  id: string;
  type: StepType;
  title: string;
  content: string;
  hint?: string;
  exercise?: Exercise;
  quiz?: Quiz;
}

export interface Exercise {
  task: string;
  validation: (input: string) => Promise<boolean>;
  expectedOutput?: string;
  solution?: string;
}

export interface Quiz {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface TutorialProgress {
  moduleId: string;
  currentStep: number;
  completedSteps: number[];
  startedAt: number;
  lastUpdatedAt: number;
  completed: boolean;
  score?: number;
}

export interface TutorialStats {
  totalModules: number;
  completedModules: number;
  inProgressModules: number;
  totalSteps: number;
  completedSteps: number;
  averageScore: number;
  timeSpent: number;
}
