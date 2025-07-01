/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SelfReviewIntegration,
  createSelfReviewIntegration,
  shouldIncludeSelfReview,
  getSelfReviewModule,
} from './SelfReviewIntegration.js';
import type { TaskContext } from './interfaces/prompt-assembly.js';

describe('SelfReviewIntegration', () => {
  let integration: SelfReviewIntegration;
  let mockTaskContext: TaskContext;

  beforeEach(() => {
    integration = new SelfReviewIntegration();
    mockTaskContext = {
      taskType: 'software-engineering',
      hasGitRepo: true,
      sandboxMode: false,
      hasUserMemory: false,
      contextFlags: {
        requiresSecurityGuidance: true,
        requiresDebuggingGuidance: false,
      },
      environmentContext: {
        NODE_ENV: 'development',
      },
    };
  });

  describe('shouldEnableSelfReview', () => {
    it('should enable self-review for software engineering tasks', () => {
      const context = {
        ...mockTaskContext,
        taskType: 'software-engineering' as const,
      };
      expect(integration.shouldEnableSelfReview(context)).toBe(true);
    });

    it('should enable self-review for new application development', () => {
      const context = {
        ...mockTaskContext,
        taskType: 'new-application' as const,
      };
      expect(integration.shouldEnableSelfReview(context)).toBe(true);
    });

    it('should enable self-review for refactoring tasks', () => {
      const context = { ...mockTaskContext, taskType: 'refactor' as const };
      expect(integration.shouldEnableSelfReview(context)).toBe(true);
    });

    it('should enable self-review for debug tasks with security guidance', () => {
      const context = {
        ...mockTaskContext,
        taskType: 'debug' as const,
        contextFlags: { requiresSecurityGuidance: true },
      };
      expect(integration.shouldEnableSelfReview(context)).toBe(true);
    });

    it('should disable self-review for general tasks without security guidance', () => {
      const context = {
        ...mockTaskContext,
        taskType: 'general' as const,
        contextFlags: { requiresSecurityGuidance: false },
      };
      expect(integration.shouldEnableSelfReview(context)).toBe(false);
    });

    it('should enable self-review when security guidance is required regardless of task type', () => {
      const context = {
        ...mockTaskContext,
        taskType: 'general' as const,
        contextFlags: { requiresSecurityGuidance: true },
      };
      expect(integration.shouldEnableSelfReview(context)).toBe(true);
    });
  });

  describe('getSelfReviewModule', () => {
    it('should return a valid module for software engineering tasks', () => {
      const module = integration.getSelfReviewModule(mockTaskContext);

      expect(module).toBeDefined();
      expect(module!.id).toBe('quality-gates');
      expect(module!.category).toBe('policies');
      expect(module!.priority).toBe(2);
      expect(module!.tokenCount).toBeGreaterThan(0);
      expect(module!.tokenCount).toBeLessThan(250);
      expect(module!.content).toContain('QUALITY REVIEW SYSTEM');
    });

    it('should return null for tasks that do not require self-review', () => {
      const context = {
        ...mockTaskContext,
        taskType: 'general' as const,
        contextFlags: { requiresSecurityGuidance: false },
      };
      const module = integration.getSelfReviewModule(context);

      expect(module).toBeNull();
    });

    it('should include security dependency', () => {
      const module = integration.getSelfReviewModule(mockTaskContext);

      expect(module!.dependencies).toContain('security');
    });

    it('should respect token budget', () => {
      const module = integration.getSelfReviewModule(mockTaskContext);

      expect(module!.tokenCount).toBeLessThanOrEqual(240);
    });
  });

  describe('createReviewContext', () => {
    it('should create review context from task context', () => {
      const codeContent = 'const example = "test";';
      const reviewContext = integration.createReviewContext(
        mockTaskContext,
        codeContent,
      );

      expect(reviewContext.taskType).toBe('software-engineering');
      expect(reviewContext.codeContent).toBe(codeContent);
      expect(reviewContext.hasSecurityChecks).toBe(true);
      expect(reviewContext.environmentContext).toBe(
        mockTaskContext.environmentContext,
      );
    });

    it('should handle empty code content', () => {
      const reviewContext = integration.createReviewContext(mockTaskContext);

      expect(reviewContext.codeContent).toBe('');
      expect(reviewContext.taskType).toBe('software-engineering');
    });
  });

  describe('executeReview', () => {
    it('should execute review and return results', async () => {
      const reviewContext = integration.createReviewContext(
        mockTaskContext,
        'const valid = "code";',
      );
      const result = await integration.executeReview(reviewContext);

      expect(result).toBeDefined();
      expect(result.action).toMatch(/^(approve|revise|escalate)$/);
      expect(Array.isArray(result.passedChecks)).toBe(true);
      expect(Array.isArray(result.failedChecks)).toBe(true);
    });
  });

  describe('getQualityGatesConfig', () => {
    it('should return quality gates configuration', () => {
      const config = integration.getQualityGatesConfig();

      expect(config).toBeDefined();
      expect(config.tokenBudget).toBe(240);
      expect(config.enableCaching).toBe(true);
      expect(config.enableProgressiveReview).toBe(true);
    });
  });

  describe('getReviewMetrics', () => {
    it('should return review metrics', () => {
      const metrics = integration.getReviewMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.totalReviews).toBe('number');
      expect(typeof metrics.successRate).toBe('number');
      expect(typeof metrics.averageReviewTime).toBe('number');
    });
  });

  describe('context-based quality gate configuration', () => {
    it('should disable test validation for general tasks', () => {
      const generalContext = {
        ...mockTaskContext,
        taskType: 'general' as const,
      };
      integration.getSelfReviewModule(generalContext); // This configures gates

      const config = integration.getQualityGatesConfig();
      const testGate = config.qualityGates?.find((g) => g.id === 'tests_pass');

      expect(testGate?.enabled).toBe(false);
    });

    it('should enable test validation for software engineering tasks', () => {
      integration.getSelfReviewModule(mockTaskContext); // This configures gates

      const config = integration.getQualityGatesConfig();
      const testGate = config.qualityGates?.find((g) => g.id === 'tests_pass');

      expect(testGate?.enabled).toBe(true);
    });

    it('should prioritize security checks when security guidance is required', () => {
      const securityContext = {
        ...mockTaskContext,
        contextFlags: { requiresSecurityGuidance: true },
      };
      integration.getSelfReviewModule(securityContext); // This configures gates

      const config = integration.getQualityGatesConfig();
      const securityGate = config.qualityGates?.find(
        (g) => g.id === 'security_check',
      );

      expect(securityGate?.enabled).toBe(true);
      expect(securityGate?.priority).toBe(-1); // Highest priority
    });

    it('should enable style checks for new application development', () => {
      const newAppContext = {
        ...mockTaskContext,
        taskType: 'new-application' as const,
      };
      integration.getSelfReviewModule(newAppContext); // This configures gates

      const config = integration.getQualityGatesConfig();
      const styleGate = config.qualityGates?.find(
        (g) => g.id === 'style_compliant',
      );

      expect(styleGate?.enabled).toBe(true);
    });

    it('should enable dependency validation for application development', () => {
      integration.getSelfReviewModule(mockTaskContext); // This configures gates

      const config = integration.getQualityGatesConfig();
      const depGate = config.qualityGates?.find(
        (g) => g.id === 'dependency_valid',
      );

      expect(depGate?.enabled).toBe(true);
    });
  });
});

describe('Integration Helper Functions', () => {
  let mockTaskContext: TaskContext;

  beforeEach(() => {
    mockTaskContext = {
      taskType: 'software-engineering',
      hasGitRepo: true,
      sandboxMode: false,
      hasUserMemory: false,
      contextFlags: {
        requiresSecurityGuidance: true,
      },
      environmentContext: {},
    };
  });

  describe('createSelfReviewIntegration', () => {
    it('should create a new integration instance', () => {
      const integration = createSelfReviewIntegration();
      expect(integration).toBeInstanceOf(SelfReviewIntegration);
    });
  });

  describe('shouldIncludeSelfReview', () => {
    it('should return true for software engineering tasks', () => {
      const result = shouldIncludeSelfReview(mockTaskContext);
      expect(result).toBe(true);
    });

    it('should return false for general tasks without security guidance', () => {
      const generalContext = {
        ...mockTaskContext,
        taskType: 'general' as const,
        contextFlags: { requiresSecurityGuidance: false },
      };
      const result = shouldIncludeSelfReview(generalContext);
      expect(result).toBe(false);
    });
  });

  describe('getSelfReviewModule', () => {
    it('should return a module for appropriate tasks', () => {
      const module = getSelfReviewModule(mockTaskContext);
      expect(module).toBeDefined();
      expect(module!.id).toBe('quality-gates');
    });

    it('should return null for inappropriate tasks', () => {
      const generalContext = {
        ...mockTaskContext,
        taskType: 'general' as const,
        contextFlags: { requiresSecurityGuidance: false },
      };
      const module = getSelfReviewModule(generalContext);
      expect(module).toBeNull();
    });
  });
});
