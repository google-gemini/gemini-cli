/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SelfReviewIntegration } from './SelfReviewIntegration.js';
import { PromptAssembler } from './PromptAssembler.js';
import type { TaskContext } from './interfaces/prompt-assembly.js';

/**
 * Final validation tests for the self-review loop system
 * 
 * These tests verify the complete integration and validate that
 * all requirements from PLAN.md Phase 2.2 are met.
 */
describe('Self-Review System Final Validation', () => {
  describe('Token Count Requirements (<250 tokens)', () => {
    it('should meet token budget requirement for quality-gates module', () => {
      const integration = new SelfReviewIntegration();
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: true,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: { requiresSecurityGuidance: true },
        environmentContext: {},
      };

      const module = integration.getSelfReviewModule(context);
      expect(module).toBeDefined();
      expect(module!.tokenCount).toBeLessThan(250);
      expect(module!.tokenCount).toBeGreaterThan(0);
    });

    it('should respect configured token budget', () => {
      const integration = new SelfReviewIntegration();
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
        tokenBudget: 200, // Limited budget
      };

      const module = integration.getSelfReviewModule(context);
      expect(module).toBeDefined();
      expect(module!.tokenCount).toBeLessThanOrEqual(200);
    });

    it('should adjust content based on token constraints', () => {
      const integration = new SelfReviewIntegration();
      
      // Test with very limited budget
      const limitedContext: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
        tokenBudget: 150,
      };

      const limitedModule = integration.getSelfReviewModule(limitedContext);
      
      // Test with generous budget
      const generousContext: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
        tokenBudget: 300,
      };

      const generousModule = integration.getSelfReviewModule(generousContext);

      expect(limitedModule!.tokenCount).toBeLessThanOrEqual(150);
      expect(generousModule!.tokenCount).toBeLessThanOrEqual(300);
      expect(limitedModule!.content.length).toBeLessThanOrEqual(generousModule!.content.length);
    });
  });

  describe('Quality Gate Implementation', () => {
    it('should implement all five required quality gates', () => {
      const integration = new SelfReviewIntegration();
      const config = integration.getQualityGatesConfig();
      
      const requiredGates = [
        'syntax_valid',
        'tests_pass',
        'style_compliant',
        'security_check',
        'dependency_valid'
      ];

      const implementedGates = config.qualityGates?.map(g => g.id) || [];
      
      for (const requiredGate of requiredGates) {
        expect(implementedGates).toContain(requiredGate);
      }
    });

    it('should map quality gates to correct actions', () => {
      const integration = new SelfReviewIntegration();
      const config = integration.getQualityGatesConfig();
      const gates = config.qualityGates || [];

      const actionMap = {
        'syntax_valid': 'revise',
        'tests_pass': 'revise',
        'style_compliant': 'approve',
        'security_check': 'escalate',
        'dependency_valid': 'revise'
      };

      for (const [gateId, expectedAction] of Object.entries(actionMap)) {
        const gate = gates.find(g => g.id === gateId);
        expect(gate).toBeDefined();
        expect(gate!.action).toBe(expectedAction);
      }
    });
  });

  describe('Integration with PromptAssembler', () => {
    it('should integrate seamlessly with PromptAssembler', async () => {
      const assembler = new PromptAssembler();
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: true,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: { requiresSecurityGuidance: true },
        environmentContext: {},
      };

      const result = await assembler.assemblePrompt(context);
      
      expect(result.includedModules.length).toBeGreaterThan(0);
      expect(result.includedModules.some(m => m.id === 'quality-gates')).toBe(true);
      expect(result.prompt).toContain('Quality Review System');
    });

    it('should maintain backward compatibility', async () => {
      const assembler = new PromptAssembler();
      const generalContext: TaskContext = {
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const result = await assembler.assemblePrompt(generalContext);
      
      // Should work without self-review for general tasks
      expect(result.includedModules.length).toBeGreaterThan(0);
      expect(result.includedModules.some(m => m.id === 'quality-gates')).toBe(false);
    });
  });

  describe('Context-Sensitive Behavior', () => {
    it('should enable self-review for appropriate task types', () => {
      const integration = new SelfReviewIntegration();
      
      const appropriateContexts = [
        { taskType: 'software-engineering' as const },
        { taskType: 'new-application' as const },
        { taskType: 'refactor' as const },
        { taskType: 'debug' as const, contextFlags: { requiresSecurityGuidance: true } },
      ];

      for (const context of appropriateContexts) {
        const fullContext: TaskContext = {
          hasGitRepo: false,
          sandboxMode: false,
          hasUserMemory: false,
          contextFlags: {},
          environmentContext: {},
          ...context,
        };

        expect(integration.shouldEnableSelfReview(fullContext)).toBe(true);
      }
    });

    it('should disable self-review for inappropriate contexts', () => {
      const integration = new SelfReviewIntegration();
      
      const inappropriateContext: TaskContext = {
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: { requiresSecurityGuidance: false },
        environmentContext: {},
      };

      expect(integration.shouldEnableSelfReview(inappropriateContext)).toBe(false);
    });

    it('should adapt quality gates based on context', () => {
      const integration = new SelfReviewIntegration();
      
      // Test different contexts
      const contexts = [
        { taskType: 'general' as const, expectTestGate: false },
        { taskType: 'software-engineering' as const, expectTestGate: true },
        { taskType: 'new-application' as const, expectTestGate: true },
      ];

      for (const { taskType, expectTestGate } of contexts) {
        const context: TaskContext = {
          taskType,
          hasGitRepo: false,
          sandboxMode: false,
          hasUserMemory: false,
          contextFlags: {},
          environmentContext: {},
        };

        // Get module (which configures gates internally)
        const module = integration.getSelfReviewModule(context);
        
        if (module) {
          const config = integration.getQualityGatesConfig();
          const testGate = config.qualityGates?.find(g => g.id === 'tests_pass');
          
          if (expectTestGate) {
            expect(testGate?.enabled).toBe(true);
          } else {
            expect(testGate?.enabled).toBe(false);
          }
        }
      }
    });
  });

  describe('Security Requirements', () => {
    it('should prioritize security checks', () => {
      const integration = new SelfReviewIntegration();
      const config = integration.getQualityGatesConfig();
      const securityGate = config.qualityGates?.find(g => g.id === 'security_check');
      
      expect(securityGate).toBeDefined();
      expect(securityGate!.priority).toBe(0); // Highest priority
      expect(securityGate!.action).toBe('escalate');
    });

    it('should detect common security issues', async () => {
      const integration = new SelfReviewIntegration();
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: { requiresSecurityGuidance: true },
        environmentContext: {},
      };

      const codeWithSecrets = `
        const config = {
          apiKey: "sk-1234567890abcdef",
          password: "admin123"
        };
      `;

      const reviewContext = integration.createReviewContext(context, codeWithSecrets);
      const result = await integration.executeReview(reviewContext);

      expect(result.success).toBe(false);
      expect(result.action).toBe('escalate');
      expect(result.failedChecks).toContain('security_check');
    });
  });

  describe('Performance Requirements', () => {
    it('should complete reviews within reasonable time', async () => {
      const integration = new SelfReviewIntegration();
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const reviewContext = integration.createReviewContext(context, 'const simple = "code";');
      
      const startTime = Date.now();
      const result = await integration.executeReview(reviewContext);
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle timeout gracefully', async () => {
      const integration = new SelfReviewIntegration();
      const config = integration.getQualityGatesConfig();
      
      // Verify timeout configuration exists
      expect(config.reviewTimeout).toBeGreaterThan(0);
      expect(config.reviewTimeout).toBeLessThan(60000); // Should be reasonable (< 1 minute)
    });
  });

  describe('Extensibility', () => {
    it('should support custom quality gates', () => {
      const integration = new SelfReviewIntegration();
      const config = integration.getQualityGatesConfig();
      
      // Verify structure supports custom gates
      expect(Array.isArray(config.qualityGates)).toBe(true);
      
      // Check that gate structure supports customization
      const firstGate = config.qualityGates?.[0];
      if (firstGate) {
        expect(firstGate).toHaveProperty('id');
        expect(firstGate).toHaveProperty('name');
        expect(firstGate).toHaveProperty('description');
        expect(firstGate).toHaveProperty('condition');
        expect(firstGate).toHaveProperty('action');
        expect(firstGate).toHaveProperty('priority');
        expect(firstGate).toHaveProperty('enabled');
        expect(firstGate).toHaveProperty('timeout');
      }
    });

    it('should provide module interface for integration', () => {
      const integration = new SelfReviewIntegration();
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const module = integration.getSelfReviewModule(context);
      
      expect(module).toBeDefined();
      expect(module!.id).toBe('quality-gates');
      expect(module!.version).toBeDefined();
      expect(module!.content).toBeDefined();
      expect(module!.dependencies).toBeDefined();
      expect(module!.tokenCount).toBeDefined();
      expect(module!.category).toBe('policies');
      expect(module!.priority).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle review failures gracefully', async () => {
      const integration = new SelfReviewIntegration();
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const invalidCode = 'const invalid syntax = ;';
      const reviewContext = integration.createReviewContext(context, invalidCode);
      const result = await integration.executeReview(reviewContext);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.action).toMatch(/^(approve|revise|escalate)$/);
      expect(Array.isArray(result.failedChecks)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should validate dependencies correctly', () => {
      const integration = new SelfReviewIntegration();
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const module = integration.getSelfReviewModule(context);
      
      expect(module).toBeDefined();
      expect(module!.dependencies).toContain('security');
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should provide comprehensive metrics', () => {
      const integration = new SelfReviewIntegration();
      const metrics = integration.getReviewMetrics();

      expect(metrics).toHaveProperty('totalReviews');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('averageReviewTime');
      expect(metrics).toHaveProperty('commonFailures');
      expect(metrics).toHaveProperty('gatePerformance');

      expect(typeof metrics.totalReviews).toBe('number');
      expect(typeof metrics.successRate).toBe('number');
      expect(typeof metrics.averageReviewTime).toBe('number');
      expect(typeof metrics.commonFailures).toBe('object');
      expect(typeof metrics.gatePerformance).toBe('object');
    });
  });
});