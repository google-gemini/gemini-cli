/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a single quality gate with validation criteria
 */
export interface QualityGate {
  /** Unique identifier for the quality gate */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this gate validates */
  description: string;
  /** Condition that must be met for validation to pass */
  condition: string;
  /** Action to take when this gate fails */
  action: ReviewAction;
  /** Priority order for execution (lower = higher priority) */
  priority: number;
  /** Whether this gate is enabled */
  enabled: boolean;
  /** Timeout in milliseconds for this validation */
  timeout: number;
  /** Optional custom validation function */
  customValidator?: (context: ReviewContext) => Promise<QualityCheck>;
}

/**
 * Actions that can be taken based on review results
 */
export type ReviewAction = 'approve' | 'revise' | 'escalate';

/**
 * Result of a single quality check
 */
export interface QualityCheck {
  /** Whether the check passed */
  success: boolean;
  /** Human-readable message about the result */
  message: string;
  /** Optional details about the check */
  details?: string;
  /** Time taken to execute the check in milliseconds */
  executionTime?: number;
}

/**
 * Overall result of the review process
 */
export interface ReviewResult {
  /** Whether all quality gates passed */
  success: boolean;
  /** Action to take based on the review results */
  action: ReviewAction;
  /** List of failed quality gate IDs */
  failedChecks: string[];
  /** List of passed quality gate IDs */
  passedChecks: string[];
  /** Any errors that occurred during review */
  errors: string[];
  /** Individual check results */
  checkResults: Record<string, QualityCheck>;
  /** Total time taken for review in milliseconds */
  totalTime: number;
  /** Context used for the review */
  context: ReviewContext;
}

/**
 * Context information for quality review
 */
export interface ReviewContext {
  /** Type of task being reviewed */
  taskType:
    | 'general'
    | 'debug'
    | 'new-application'
    | 'refactor'
    | 'software-engineering';
  /** Programming language of the code */
  language?: string;
  /** Framework or runtime being used */
  framework?: string;
  /** Whether tests are present */
  hasTests: boolean;
  /** Whether linting is configured */
  hasLinting: boolean;
  /** Whether security checks are enabled */
  hasSecurityChecks: boolean;
  /** Code content to review */
  codeContent: string;
  /** File paths being reviewed */
  filePaths: string[];
  /** Environment context */
  environmentContext: Record<string, string | undefined>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for the self-review loop system
 */
export interface QualityGateConfig {
  /** Maximum number of review attempts */
  maxReviewAttempts?: number;
  /** Overall timeout for review process in milliseconds */
  reviewTimeout?: number;
  /** Whether to enable progressive review (stop on first failure) */
  enableProgressiveReview?: boolean;
  /** Token budget for review prompt contribution */
  tokenBudget?: number;
  /** Custom quality gates to use */
  qualityGates?: QualityGate[];
  /** Whether to cache review results */
  enableCaching?: boolean;
}

/**
 * Interface for the self-review loop system
 */
export interface SelfReviewSystem {
  /** Execute quality review on given context */
  executeReview(context: ReviewContext): Promise<ReviewResult>;
  /** Get the review prompt for integration with modular system */
  getReviewPrompt(context?: ReviewContext): string;
  /** Get token count for the review system contribution */
  getTokenCount(): number;
  /** Get currently enabled quality gates */
  getEnabledGates(): QualityGate[];
  /** Configure quality gates */
  configureGates(gates: QualityGate[]): void;
  /** Create review context from task context */
  createReviewContext(taskContext: unknown, codeContent: string): ReviewContext;
}

/**
 * Interface for integrating with the existing module system
 */
export interface ReviewModuleInterface {
  /** Module identifier */
  id: string;
  /** Module version */
  version: string;
  /** Module content (review prompt) */
  content: string;
  /** Dependencies on other modules */
  dependencies: string[];
  /** Token count contribution */
  tokenCount: number;
  /** Module category */
  category: 'policies';
  /** Priority for module ordering */
  priority: number;
}

/**
 * Progressive review strategy
 */
export interface ProgressiveReviewStrategy {
  /** Whether to stop on first failure */
  stopOnFirstFailure: boolean;
  /** Gates to skip based on previous failures */
  skipGatesOnFailure: string[];
  /** Whether to run critical gates first */
  prioritizeCriticalGates: boolean;
}

/**
 * Review metrics and analytics
 */
export interface ReviewMetrics {
  /** Total reviews executed */
  totalReviews: number;
  /** Success rate percentage */
  successRate: number;
  /** Average review time in milliseconds */
  averageReviewTime: number;
  /** Most common failure reasons */
  commonFailures: Record<string, number>;
  /** Performance by gate type */
  gatePerformance: Record<
    string,
    {
      successRate: number;
      averageTime: number;
      totalExecutions: number;
    }
  >;
}
