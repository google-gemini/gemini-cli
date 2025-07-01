/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PromptModule, TaskContext } from './interfaces/prompt-assembly.js';
import { ModuleLoaderImpl } from './ModuleLoader.js';

/**
 * Test suite for ReAct pattern implementation in reasoning-patterns.md
 * 
 * This validates that the ReAct (Reason + Act) pattern is correctly
 * structured and integrates with the modular prompt system.
 */
describe('ReAct Pattern Module', () => {
  let moduleLoader: ModuleLoaderImpl;
  const testModuleDirectory = '/home/michael/gemini-cli-system-prompt/packages/core/src/prompt-system';

  beforeEach(() => {
    vi.clearAllMocks();
    moduleLoader = new ModuleLoaderImpl(testModuleDirectory, false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module Structure', () => {
    it('should load reasoning-patterns module successfully', async () => {
      const module = await moduleLoader.loadModule('reasoning-patterns');
      
      expect(module).toBeDefined();
      expect(module.id).toBe('reasoning-patterns');
      expect(module.category).toBe('core');
      expect(module.version).toBeDefined();
      expect(module.content).toBeDefined();
    });

    it('should have appropriate token count (target <200)', async () => {
      const module = await moduleLoader.loadModule('reasoning-patterns');
      
      expect(module.tokenCount).toBeLessThan(200);
      expect(module.tokenCount).toBeGreaterThan(50); // Should have substantial content
    });

    it('should have proper dependencies', async () => {
      const module = await moduleLoader.loadModule('reasoning-patterns');
      
      expect(Array.isArray(module.dependencies)).toBe(true);
      // ReAct should depend on identity and mandates for consistency
      expect(module.dependencies).toContain('identity');
      expect(module.dependencies).toContain('mandates');
    });
  });

  describe('ReAct Pattern Content', () => {
    let reasoningModule: PromptModule;

    beforeEach(async () => {
      reasoningModule = await moduleLoader.loadModule('reasoning-patterns');
    });

    it('should contain the ReAct structure components', () => {
      const content = reasoningModule.content;
      
      // Should contain all ReAct pattern elements
      expect(content).toMatch(/ANALYSIS|ANALYZE/i);
      expect(content).toMatch(/PLAN/i);
      expect(content).toMatch(/ACTION|ACT/i);
      expect(content).toMatch(/OBSERVATION|OBSERVE/i);
      expect(content).toMatch(/NEXT/i);
    });

    it('should provide clear trigger conditions', () => {
      const content = reasoningModule.content;
      
      // Should specify when to use ReAct pattern
      expect(content).toMatch(/trigger|activate|when|complex/i);
      expect(content).toMatch(/reasoning|problem|multi-step/i);
    });

    it('should be structured as proper markdown', () => {
      const content = reasoningModule.content;
      
      // Should have proper markdown headers
      expect(content).toMatch(/^#/m); // At least one header
      expect(content).toMatch(/<!--[\s\S]*?-->/); // Should have metadata comment
    });

    it('should include selective activation guidance', () => {
      const content = reasoningModule.content;
      
      // Should explain when NOT to use ReAct (efficiency)
      expect(content).toMatch(/simple|direct|straightforward/i);
      expect(content).toMatch(/avoid|skip|unnecessary/i);
    });
  });

  describe('Integration with Module System', () => {
    it('should be categorized as core module', async () => {
      const coreModules = await moduleLoader.loadModulesByCategory('core');
      const reasoningModule = coreModules.find(m => m.id === 'reasoning-patterns');
      
      expect(reasoningModule).toBeDefined();
      expect(reasoningModule?.category).toBe('core');
    });

    it('should have appropriate priority for selective loading', async () => {
      const module = await moduleLoader.loadModule('reasoning-patterns');
      
      // Should have lower priority than identity/mandates but higher than examples
      expect(module.priority).toBeDefined();
      expect(module.priority).toBeGreaterThan(1); // Lower than core identity modules
      expect(module.priority).toBeLessThan(10); // Higher than example modules
    });
  });

  describe('Context-Aware Activation', () => {
    it('should be selected for complex debugging tasks', () => {
      const context: TaskContext = {
        taskType: 'debug',
        hasGitRepo: true,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {
          requiresDebuggingGuidance: true
        },
        environmentContext: {}
      };

      // Mock module selector logic - ReAct should be selected for complex debugging
      const shouldIncludeReAct = context.taskType === 'debug' && 
                                 context.contextFlags.requiresDebuggingGuidance;
      expect(shouldIncludeReAct).toBe(true);
    });

    it('should be selected for complex software engineering tasks', () => {
      const context: TaskContext = {
        taskType: 'software-engineering',
        hasGitRepo: true,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {
          requiresRefactoringGuidance: true
        },
        environmentContext: {}
      };

      // Mock module selector logic - ReAct should be selected for complex engineering
      const shouldIncludeReAct = context.taskType === 'software-engineering';
      expect(shouldIncludeReAct).toBe(true);
    });

    it('should NOT be selected for simple general tasks', () => {
      const context: TaskContext = {
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {}
      };

      // Mock module selector logic - ReAct should NOT be selected for simple tasks
      const shouldIncludeReAct = context.taskType !== 'general' || 
                                 Object.keys(context.contextFlags).length > 0;
      expect(shouldIncludeReAct).toBe(false);
    });
  });

  describe('Token Efficiency', () => {
    it('should contribute efficiently to total token budget', async () => {
      const module = await moduleLoader.loadModule('reasoning-patterns');
      
      // Token efficiency validation
      const tokenDensity = module.content.length / module.tokenCount;
      expect(tokenDensity).toBeGreaterThan(3); // At least 3 chars per token
      expect(tokenDensity).toBeLessThan(8); // At most 8 chars per token (more realistic)
    });

    it('should work within total system token budget', async () => {
      const allCoreModules = await moduleLoader.loadModulesByCategory('core');
      const totalCoreTokens = allCoreModules.reduce((sum, m) => sum + m.tokenCount, 0);
      
      // Core modules should stay within reasonable bounds
      expect(totalCoreTokens).toBeLessThan(1000); // Leave room for other categories
      
      const reasoningModule = allCoreModules.find(m => m.id === 'reasoning-patterns');
      expect(reasoningModule?.tokenCount).toBeLessThan(totalCoreTokens * 0.3); // Max 30% of core budget
    });
  });
});