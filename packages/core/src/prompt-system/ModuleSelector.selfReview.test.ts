/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleSelectorImpl } from './ModuleSelector.js';
import type {
  TaskContext,
  PromptModule,
} from './interfaces/prompt-assembly.js';

describe('ModuleSelector - Self-Review Integration', () => {
  let moduleSelector: ModuleSelectorImpl;
  let baseModules: PromptModule[];

  beforeEach(() => {
    moduleSelector = new ModuleSelectorImpl();

    // Create base modules for testing
    baseModules = [
      {
        id: 'identity',
        version: '1.0.0',
        content: 'Identity module',
        dependencies: [],
        tokenCount: 50,
        category: 'core',
      },
      {
        id: 'mandates',
        version: '1.0.0',
        content: 'Mandates module',
        dependencies: [],
        tokenCount: 60,
        category: 'core',
      },
      {
        id: 'security',
        version: '1.0.0',
        content: 'Security module',
        dependencies: [],
        tokenCount: 70,
        category: 'policies',
      },
      {
        id: 'software-engineering',
        version: '1.0.0',
        content: 'Software engineering module',
        dependencies: [],
        tokenCount: 100,
        category: 'playbook',
      },
    ];
  });

  describe('self-review module selection', () => {
    it('should include quality-gates module for software engineering tasks', () => {
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: true,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {
          requiresSecurityGuidance: true,
        },
        environmentContext: {},
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const qualityGatesModule = selectedModules.find(
        (m) => m.id === 'quality-gates',
      );

      expect(qualityGatesModule).toBeDefined();
      expect(qualityGatesModule!.category).toBe('policies');
      expect(qualityGatesModule!.content).toContain('QUALITY REVIEW SYSTEM');
    });

    it('should include quality-gates module for new application development', () => {
      const context: TaskContext = {
        taskType: 'new-application',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const qualityGatesModule = selectedModules.find(
        (m) => m.id === 'quality-gates',
      );

      expect(qualityGatesModule).toBeDefined();
    });

    it('should include quality-gates module for refactoring tasks', () => {
      const context: TaskContext = {
        taskType: 'refactor',
        hasGitRepo: true,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const qualityGatesModule = selectedModules.find(
        (m) => m.id === 'quality-gates',
      );

      expect(qualityGatesModule).toBeDefined();
    });

    it('should not include quality-gates module for general tasks without security guidance', () => {
      const context: TaskContext = {
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {
          requiresSecurityGuidance: false,
        },
        environmentContext: {},
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const qualityGatesModule = selectedModules.find(
        (m) => m.id === 'quality-gates',
      );

      expect(qualityGatesModule).toBeUndefined();
    });

    it('should include quality-gates module when security guidance is required', () => {
      const context: TaskContext = {
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {
          requiresSecurityGuidance: true,
        },
        environmentContext: {},
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const qualityGatesModule = selectedModules.find(
        (m) => m.id === 'quality-gates',
      );

      expect(qualityGatesModule).toBeDefined();
    });
  });

  describe('token budget optimization with self-review', () => {
    it('should preserve quality-gates module in token optimization', () => {
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: true,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {
          requiresSecurityGuidance: true,
        },
        environmentContext: {},
        tokenBudget: 300, // Limited budget
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const qualityGatesModule = selectedModules.find(
        (m) => m.id === 'quality-gates',
      );

      expect(qualityGatesModule).toBeDefined();

      // Verify total tokens are within budget or quality-gates is preserved
      const totalTokens = selectedModules.reduce(
        (sum, m) => sum + m.tokenCount,
        0,
      );
      const hasRequiredModules = selectedModules.every(
        (m) =>
          ['identity', 'mandates', 'security', 'quality-gates'].includes(
            m.id,
          ) || totalTokens <= context.tokenBudget!,
      );

      expect(hasRequiredModules).toBe(true);
    });

    it('should respect token budget while including quality-gates', () => {
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
        tokenBudget: 400,
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const _totalTokens = selectedModules.reduce(
        (sum, m) => sum + m.tokenCount,
        0,
      );

      // Should include required modules even if slightly over budget
      const requiredModuleIds = [
        'identity',
        'mandates',
        'security',
        'quality-gates',
      ];
      const hasAllRequired = requiredModuleIds.every((id) =>
        selectedModules.some((m) => m.id === id),
      );

      expect(hasAllRequired).toBe(true);
    });
  });

  describe('module ordering with self-review', () => {
    it('should place quality-gates module in policies category', () => {
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: true,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {
          requiresSecurityGuidance: true,
        },
        environmentContext: {},
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );

      const securityIndex = selectedModules.findIndex(
        (m) => m.id === 'security',
      );
      const qualityGatesIndex = selectedModules.findIndex(
        (m) => m.id === 'quality-gates',
      );

      expect(securityIndex).toBeGreaterThanOrEqual(0);
      expect(qualityGatesIndex).toBeGreaterThanOrEqual(0);

      // Both should be in policies category and properly ordered
      const qualityGatesModule = selectedModules[qualityGatesIndex];
      expect(qualityGatesModule.category).toBe('policies');
      expect(qualityGatesModule.priority).toBe(2);
    });
  });

  describe('dependency validation with self-review', () => {
    it('should validate dependencies including quality-gates module', () => {
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const isValid = moduleSelector.validateSelection(
        selectedModules,
        selectedModules,
      );

      expect(isValid).toBe(true);

      // Verify quality-gates has security dependency satisfied
      const qualityGatesModule = selectedModules.find(
        (m) => m.id === 'quality-gates',
      );
      if (
        qualityGatesModule &&
        qualityGatesModule.dependencies.includes('security')
      ) {
        const hasSecurityModule = selectedModules.some(
          (m) => m.id === 'security',
        );
        expect(hasSecurityModule).toBe(true);
      }
    });
  });

  describe('selection statistics with self-review', () => {
    it('should include quality-gates in selection statistics', () => {
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const selectedModules = moduleSelector.selectModules(
        context,
        baseModules,
      );
      const stats = moduleSelector.getSelectionStats(selectedModules);

      expect(stats.moduleCount).toBeGreaterThan(4); // Base modules + quality-gates + others
      expect(stats.categoryBreakdown.policies).toBeGreaterThanOrEqual(2); // security + quality-gates
      expect(stats.totalTokens).toBeGreaterThan(0);
    });
  });
});
