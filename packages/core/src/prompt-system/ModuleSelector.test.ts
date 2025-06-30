/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleSelectorImpl } from './ModuleSelector.js';
import type {
  PromptModule,
  TaskContext,
} from './interfaces/prompt-assembly.js';

describe('ModuleSelector', () => {
  let moduleSelector: ModuleSelectorImpl;
  let mockModules: PromptModule[];
  let baseContext: TaskContext;

  beforeEach(() => {
    moduleSelector = new ModuleSelectorImpl();

    mockModules = [
      {
        id: 'identity',
        version: '1.0.0',
        content: '# Identity',
        dependencies: [],
        tokenCount: 200,
        category: 'core',
        priority: 1,
      },
      {
        id: 'mandates',
        version: '1.0.0',
        content: '# Mandates',
        dependencies: ['identity'],
        tokenCount: 300,
        category: 'core',
        priority: 2,
      },
      {
        id: 'security',
        version: '1.0.0',
        content: '# Security',
        dependencies: [],
        tokenCount: 200,
        category: 'policies',
        priority: 1,
      },
      {
        id: 'debugging',
        version: '1.0.0',
        content: '# Debugging',
        dependencies: ['security'],
        tokenCount: 300,
        category: 'playbook',
      },
      {
        id: 'git-workflows',
        version: '1.0.0',
        content: '# Git Workflows',
        dependencies: [],
        tokenCount: 280,
        category: 'context',
      },
      {
        id: 'sandbox-policies',
        version: '1.0.0',
        content: '# Sandbox Policies',
        dependencies: ['security'],
        tokenCount: 290,
        category: 'context',
      },
      {
        id: 'software-engineering',
        version: '1.0.0',
        content: '# Software Engineering',
        dependencies: ['mandates'],
        tokenCount: 400,
        category: 'playbook',
      },
      {
        id: 'tool-usage',
        version: '1.0.0',
        content: '# Tool Usage',
        dependencies: [],
        tokenCount: 150,
        category: 'policies',
      },
    ];

    baseContext = {
      taskType: 'general',
      hasGitRepo: false,
      sandboxMode: false,
      hasUserMemory: false,
      contextFlags: {},
      environmentContext: {},
    };
  });

  describe('selectModules', () => {
    it('should always include base modules', () => {
      const selected = moduleSelector.selectModules(baseContext, mockModules);

      const selectedIds = selected.map((m) => m.id);
      expect(selectedIds).toContain('identity');
      expect(selectedIds).toContain('mandates');
      expect(selectedIds).toContain('security');
    });

    it('should include debug module for debug task type', () => {
      const debugContext: TaskContext = {
        ...baseContext,
        taskType: 'debug',
      };

      const selected = moduleSelector.selectModules(debugContext, mockModules);
      const selectedIds = selected.map((m) => m.id);

      expect(selectedIds).toContain('debugging');
    });

    it('should include git workflows when in git repo', () => {
      const gitContext: TaskContext = {
        ...baseContext,
        hasGitRepo: true,
      };

      const selected = moduleSelector.selectModules(gitContext, mockModules);
      const selectedIds = selected.map((m) => m.id);

      expect(selectedIds).toContain('git-workflows');
    });

    it('should include sandbox policies when in sandbox mode', () => {
      const sandboxContext: TaskContext = {
        ...baseContext,
        sandboxMode: true,
      };

      const selected = moduleSelector.selectModules(
        sandboxContext,
        mockModules,
      );
      const selectedIds = selected.map((m) => m.id);

      expect(selectedIds).toContain('sandbox-policies');
    });

    it('should resolve dependencies automatically', () => {
      const debugContext: TaskContext = {
        ...baseContext,
        taskType: 'debug',
      };

      const selected = moduleSelector.selectModules(debugContext, mockModules);
      const selectedIds = selected.map((m) => m.id);

      // debugging depends on security, which should be included
      expect(selectedIds).toContain('debugging');
      expect(selectedIds).toContain('security');
    });

    it('should include software-engineering for general tasks', () => {
      const selected = moduleSelector.selectModules(baseContext, mockModules);
      const selectedIds = selected.map((m) => m.id);

      expect(selectedIds).toContain('software-engineering');
    });

    it('should include tool-usage guidance', () => {
      const selected = moduleSelector.selectModules(baseContext, mockModules);
      const selectedIds = selected.map((m) => m.id);

      expect(selectedIds).toContain('tool-usage');
    });

    it('should handle context flags', () => {
      const contextWithFlags: TaskContext = {
        ...baseContext,
        contextFlags: {
          requiresDebuggingGuidance: true,
          requiresGitWorkflow: true,
        },
      };

      const selected = moduleSelector.selectModules(
        contextWithFlags,
        mockModules,
      );
      const selectedIds = selected.map((m) => m.id);

      expect(selectedIds).toContain('debugging');
      expect(selectedIds).toContain('git-workflows');
    });
  });

  describe('validateSelection', () => {
    it('should return true for valid selection with dependencies', () => {
      const selectedModules = mockModules.filter((m) =>
        ['identity', 'mandates', 'security', 'debugging'].includes(m.id),
      );

      const isValid = moduleSelector.validateSelection(
        selectedModules,
        mockModules,
      );

      expect(isValid).toBe(true);
    });

    it('should return false when dependencies are missing from selection', () => {
      const selectedModules = mockModules.filter(
        (m) => ['identity', 'debugging'].includes(m.id), // missing 'security' dependency
      );

      const isValid = moduleSelector.validateSelection(
        selectedModules,
        mockModules,
      );

      expect(isValid).toBe(false);
    });

    it('should return false when dependencies are not available', () => {
      const selectedModules = [mockModules.find((m) => m.id === 'debugging')!];
      const availableModules = mockModules.filter((m) => m.id !== 'security');

      const isValid = moduleSelector.validateSelection(
        selectedModules,
        availableModules,
      );

      expect(isValid).toBe(false);
    });

    it('should return true for modules without dependencies', () => {
      const selectedModules = mockModules.filter((m) =>
        ['identity', 'security'].includes(m.id),
      );

      const isValid = moduleSelector.validateSelection(
        selectedModules,
        mockModules,
      );

      expect(isValid).toBe(true);
    });
  });

  describe('optimizeForTokenBudget', () => {
    it('should keep all modules when within budget', () => {
      const selectedModules = mockModules.filter((m) =>
        ['identity', 'security'].includes(m.id),
      );
      const tokenBudget = 1000;

      const optimized = moduleSelector.optimizeForTokenBudget(
        selectedModules,
        tokenBudget,
      );

      expect(optimized).toHaveLength(2);
    });

    it('should prioritize required modules even if over budget', () => {
      const selectedModules = mockModules.filter((m) =>
        ['identity', 'mandates', 'security'].includes(m.id),
      );
      const tokenBudget = 100; // Much smaller than total tokens

      const optimized = moduleSelector.optimizeForTokenBudget(
        selectedModules,
        tokenBudget,
      );

      // Should keep all required modules despite budget (order may vary due to sorting)
      const optimizedIds = optimized.map((m) => m.id);
      expect(optimizedIds).toContain('identity');
      expect(optimizedIds).toContain('mandates');
      expect(optimizedIds).toContain('security');
      expect(optimizedIds.length).toBe(3);
    });

    it('should drop optional modules when budget is exceeded', () => {
      const selectedModules = [...mockModules];
      const tokenBudget = 800; // Only enough for base modules + some extras

      const optimized = moduleSelector.optimizeForTokenBudget(
        selectedModules,
        tokenBudget,
      );

      // Should keep required modules
      const optimizedIds = optimized.map((m) => m.id);
      expect(optimizedIds).toContain('identity');
      expect(optimizedIds).toContain('mandates');
      expect(optimizedIds).toContain('security');

      // Should have fewer modules than input
      expect(optimized.length).toBeLessThan(selectedModules.length);
    });

    it('should respect module priority when optimizing', () => {
      const selectedModules = mockModules.filter((m) =>
        ['identity', 'mandates', 'security', 'tool-usage'].includes(m.id),
      );
      const tokenBudget = 700; // Tight budget

      const optimized = moduleSelector.optimizeForTokenBudget(
        selectedModules,
        tokenBudget,
      );

      // Higher priority modules should be included first
      const optimizedIds = optimized.map((m) => m.id);
      expect(optimizedIds).toContain('identity'); // priority 1
      expect(optimizedIds).toContain('security'); // priority 1
    });
  });

  describe('getSelectionStats', () => {
    it('should calculate correct statistics', () => {
      const selectedModules = mockModules.filter((m) =>
        ['identity', 'mandates', 'security', 'debugging'].includes(m.id),
      );

      const stats = moduleSelector.getSelectionStats(selectedModules);

      expect(stats).toEqual({
        totalTokens: 200 + 300 + 200 + 300, // Sum of token counts
        moduleCount: 4,
        categoryBreakdown: {
          core: 2,
          policies: 1,
          playbook: 1,
        },
      });
    });

    it('should handle empty selection', () => {
      const stats = moduleSelector.getSelectionStats([]);

      expect(stats).toEqual({
        totalTokens: 0,
        moduleCount: 0,
        categoryBreakdown: {},
      });
    });
  });

  describe('module sorting', () => {
    it('should sort modules by category priority', () => {
      const unsortedModules = [
        mockModules.find((m) => m.id === 'debugging')!, // playbook
        mockModules.find((m) => m.id === 'security')!, // policy
        mockModules.find((m) => m.id === 'identity')!, // core
      ];

      const context: TaskContext = {
        ...baseContext,
        taskType: 'debug',
      };

      const selected = moduleSelector.selectModules(context, unsortedModules);

      // Core modules should come first
      const coreIndex = selected.findIndex((m) => m.category === 'core');
      const policyIndex = selected.findIndex((m) => m.category === 'policies');
      const playbookIndex = selected.findIndex(
        (m) => m.category === 'playbook',
      );

      expect(coreIndex).toBeLessThan(policyIndex);
      expect(policyIndex).toBeLessThan(playbookIndex);
    });

    it('should sort by explicit priority within category', () => {
      const coreModules = mockModules.filter((m) => m.category === 'core');

      const selected = moduleSelector.selectModules(baseContext, coreModules);

      // identity has priority 1, mandates has priority 2
      const identityIndex = selected.findIndex((m) => m.id === 'identity');
      const mandatesIndex = selected.findIndex((m) => m.id === 'mandates');

      expect(identityIndex).toBeLessThan(mandatesIndex);
    });
  });
});
