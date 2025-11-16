/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Tutorial Mode Types
 *
 * Interactive tutorial system that guides users through Gemini CLI
 * features with hands-on exercises and immediate feedback.
 *
 * @module tutorial/types
 */

/**
 * Exercise types that tutorials can include
 */
export type ExerciseType =
  | 'command'      // Run a slash command
  | 'prompt'       // Write and submit a prompt
  | 'file'         // Work with files
  | 'quiz'         // Answer questions
  | 'practice';    // Open-ended practice

/**
 * Exercise validation result
 */
export interface ValidationResult {
  /** Whether the exercise was completed correctly */
  passed: boolean;

  /** Feedback message */
  message: string;

  /** Specific errors if failed */
  errors?: string[];

  /** Hints if stuck */
  hints?: string[];

  /** Score (0-100) */
  score?: number;
}

/**
 * Single exercise within a tutorial
 */
export interface TutorialExercise {
  /** Unique ID within the module */
  id: string;

  /** Exercise type */
  type: ExerciseType;

  /** Title of the exercise */
  title: string;

  /** Instructions for the user */
  instructions: string;

  /** Expected action or answer */
  expected: string | string[] | RegExp;

  /** Hints available if user gets stuck */
  hints: string[];

  /** Validation function (optional, for complex validation) */
  validate?: (userInput: string, context: ExerciseContext) => Promise<ValidationResult>;

  /** Example solution (shown after completion or skip) */
  solution?: string;

  /** Whether this exercise is optional */
  optional?: boolean;

  /** Estimated time in minutes */
  estimatedTime?: number;
}

/**
 * Context passed to exercise validation
 */
export interface ExerciseContext {
  /** User's current working directory */
  workingDirectory: string;

  /** Files that were modified */
  filesModified?: string[];

  /** Commands that were run */
  commandsRun?: string[];

  /** Current tutorial progress */
  progress: TutorialProgress;
}

/**
 * Complete tutorial module definition
 */
export interface TutorialModule {
  /** Unique module ID */
  id: string;

  /** Display title */
  title: string;

  /** One-line description */
  description: string;

  /** Difficulty level */
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  /** Estimated completion time */
  estimatedTime: string;

  /** Learning objectives */
  objectives: string[];

  /** Prerequisites (IDs of other modules) */
  prerequisites?: string[];

  /** Exercises in order */
  exercises: TutorialExercise[];

  /** Introduction text */
  introduction: string;

  /** Summary/conclusion text */
  conclusion: string;

  /** What users will learn */
  learningOutcomes: string[];

  /** Related examples */
  relatedExamples?: string[];

  /** Related documentation */
  relatedDocs?: string[];

  /** Whether this is a featured module */
  featured?: boolean;
}

/**
 * User's progress through a tutorial module
 */
export interface TutorialProgress {
  /** Module ID */
  moduleId: string;

  /** When started */
  startedAt: Date;

  /** When completed (if finished) */
  completedAt?: Date;

  /** Current exercise index */
  currentExercise: number;

  /** Completed exercise IDs */
  completedExercises: string[];

  /** Failed attempts per exercise */
  failedAttempts: Record<string, number>;

  /** Hints used per exercise */
  hintsUsed: Record<string, number>;

  /** Whether user skipped exercises */
  skippedExercises: string[];

  /** Overall score (0-100) */
  score: number;

  /** Whether module is completed */
  completed: boolean;
}

/**
 * Overall tutorial system state
 */
export interface TutorialState {
  /** User ID (optional, for tracking) */
  userId?: string;

  /** When tutorial system was first used */
  firstUse: Date;

  /** Module progress by module ID */
  moduleProgress: Record<string, TutorialProgress>;

  /** Completed module IDs in order */
  completedModules: string[];

  /** Total time spent in tutorials (minutes) */
  totalTimeSpent: number;

  /** Total XP earned from tutorials */
  totalXP: number;

  /** Current tutorial session (if active) */
  activeSession?: TutorialSession;

  /** User preferences */
  preferences: TutorialPreferences;
}

/**
 * Active tutorial session
 */
export interface TutorialSession {
  /** Module being worked on */
  moduleId: string;

  /** Session start time */
  startTime: Date;

  /** Whether in sandbox mode */
  sandboxMode: boolean;

  /** Sandbox directory (if applicable) */
  sandboxPath?: string;
}

/**
 * User preferences for tutorials
 */
export interface TutorialPreferences {
  /** Whether to show hints automatically */
  autoShowHints: boolean;

  /** Hint delay in seconds */
  hintDelay: number;

  /** Whether to use sandbox mode */
  useSandbox: boolean;

  /** Whether to show progress bar */
  showProgress: boolean;

  /** Whether to celebrate completions */
  celebrations: boolean;
}

/**
 * Tutorial completion result
 */
export interface TutorialResult {
  /** Module that was completed */
  module: TutorialModule;

  /** Final progress state */
  progress: TutorialProgress;

  /** Whether all exercises were completed */
  fullyCompleted: boolean;

  /** Final score */
  score: number;

  /** Time spent (minutes) */
  timeSpent: number;

  /** XP earned */
  xpEarned: number;

  /** Achievements unlocked */
  achievementsUnlocked?: string[];

  /** Feedback for the user */
  feedback: string;

  /** Next recommended module */
  nextModule?: string;
}

/**
 * Tutorial statistics
 */
export interface TutorialStats {
  /** Total modules available */
  totalModules: number;

  /** Modules completed */
  completedModules: number;

  /** Completion percentage */
  completionPercentage: number;

  /** Average score across completed modules */
  averageScore: number;

  /** Total time spent (minutes) */
  totalTimeSpent: number;

  /** Total exercises completed */
  totalExercisesCompleted: number;

  /** Current streak (consecutive days) */
  currentStreak: number;

  /** Modules by difficulty */
  byDifficulty: {
    beginner: { total: number; completed: number };
    intermediate: { total: number; completed: number };
    advanced: { total: number; completed: number };
  };
}
