/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  TaskContext,
  PromptModule,
} from './interfaces/prompt-assembly.js';
import type { ReviewContext } from './interfaces/self-review.js';
import { SelfReviewLoop } from './SelfReviewLoop.js';

/**
 * Integration layer between the self-review system and the existing PromptAssembler
 *
 * This class provides seamless integration of quality gates with the modular prompt system,
 * ensuring that self-review capabilities are automatically included when appropriate
 * based on task context and project configuration.
 */
export class SelfReviewIntegration {
  private selfReviewLoop: SelfReviewLoop;
  private readonly moduleId = 'quality-gates';
  private readonly moduleVersion = '1.0.0';

  constructor() {
    this.selfReviewLoop = new SelfReviewLoop({
      tokenBudget: 240, // Optimized for modular system
      enableCaching: true,
      enableProgressiveReview: true,
    });
  }

  /**
   * Determine if self-review should be enabled for the given task context
   */
  shouldEnableSelfReview(context: TaskContext): boolean {
    // Enable self-review for software engineering tasks
    if (context.taskType === 'software-engineering') {
      return true;
    }

    // Enable for debugging tasks that modify code
    if (
      context.taskType === 'debug' &&
      context.contextFlags.requiresSecurityGuidance
    ) {
      return true;
    }

    // Enable for new application development
    if (context.taskType === 'new-application') {
      return true;
    }

    // Enable for refactoring tasks
    if (context.taskType === 'refactor') {
      return true;
    }

    // Enable if security guidance is explicitly required
    if (context.contextFlags.requiresSecurityGuidance) {
      return true;
    }

    return false;
  }

  /**
   * Get the self-review module for inclusion in prompt assembly
   */
  getSelfReviewModule(context: TaskContext): PromptModule | null {
    if (!this.shouldEnableSelfReview(context)) {
      return null;
    }

    // Configure quality gates based on context
    this.configureQualityGatesForContext(context);

    const reviewPrompt = this.selfReviewLoop.getReviewPrompt();
    const tokenCount = this.selfReviewLoop.getTokenCount();

    return {
      id: this.moduleId,
      version: this.moduleVersion,
      content: reviewPrompt,
      dependencies: ['security'], // Depends on security policies
      tokenCount,
      category: 'policies',
      priority: 2, // After security, before playbooks
    };
  }

  /**
   * Create review context from task context and code content
   */
  createReviewContext(
    taskContext: TaskContext,
    codeContent: string = '',
  ): ReviewContext {
    return this.selfReviewLoop.createReviewContext(taskContext, codeContent);
  }

  /**
   * Execute quality review on given content
   */
  async executeReview(reviewContext: ReviewContext) {
    return await this.selfReviewLoop.executeReview(reviewContext);
  }

  /**
   * Get quality gates configuration for debugging/inspection
   */
  getQualityGatesConfig() {
    return this.selfReviewLoop.getConfiguration();
  }

  /**
   * Get review metrics for monitoring
   */
  getReviewMetrics() {
    return this.selfReviewLoop.getMetrics();
  }

  /**
   * Configure quality gates based on task context
   */
  private configureQualityGatesForContext(context: TaskContext): void {
    const gates = this.selfReviewLoop.getEnabledGates();

    // Adjust gates based on context
    gates.forEach((gate) => {
      switch (gate.id) {
        case 'tests_pass':
          // Disable test validation for general tasks
          gate.enabled = context.taskType !== 'general';
          break;

        case 'security_check':
          // Always enable security checks, but prioritize for security-sensitive contexts
          gate.enabled = true;
          gate.priority = context.contextFlags.requiresSecurityGuidance
            ? -1
            : 0;
          break;

        case 'style_compliant':
          // Enable style checks for new development and refactoring
          gate.enabled = [
            'new-application',
            'refactor',
            'software-engineering',
          ].includes(context.taskType);
          break;

        case 'dependency_valid':
          // Enable dependency validation for application development
          gate.enabled = ['new-application', 'software-engineering'].includes(
            context.taskType,
          );
          break;
      }
    });

    // Update the configuration
    this.selfReviewLoop.configureGates(gates);
  }
}

/**
 * Factory function for creating self-review integration
 */
export function createSelfReviewIntegration(): SelfReviewIntegration {
  return new SelfReviewIntegration();
}

/**
 * Helper function for prompt assembler to check if self-review should be included
 */
export function shouldIncludeSelfReview(context: TaskContext): boolean {
  const integration = new SelfReviewIntegration();
  return integration.shouldEnableSelfReview(context);
}

/**
 * Helper function to get self-review module for prompt assembly
 */
export function getSelfReviewModule(context: TaskContext): PromptModule | null {
  const integration = new SelfReviewIntegration();
  return integration.getSelfReviewModule(context);
}
