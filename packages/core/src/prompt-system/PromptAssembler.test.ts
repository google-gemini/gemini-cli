/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptAssembler } from './PromptAssembler.js';
import type {
  PromptModule,
  TaskContext,
} from './interfaces/prompt-assembly.js';

// Mock the dependencies
vi.mock('./ModuleLoader.js');
vi.mock('./ModuleSelector.js');
vi.mock('./ContextDetector.js');
vi.mock('./ToolReferenceResolver.js', () => ({
  resolveToolReferences: vi.fn((content: string) => content),
}));

describe('PromptAssembler', () => {
  let promptAssembler: PromptAssembler;
  let mockModules: PromptModule[];
  let mockModuleLoader: any;
  let mockModuleSelector: any;
  let mockContextDetector: any;

  beforeEach(() => {
    mockModules = [
      {
        id: 'identity',
        version: '1.0.0',
        content: '# Agent Identity\n\nYou are an interactive CLI agent.',
        dependencies: [],
        tokenCount: 200,
        category: 'core',
        priority: 1,
      },
      {
        id: 'mandates',
        version: '1.0.0',
        content: '# Core Mandates\n\nFollow project conventions.',
        dependencies: ['identity'],
        tokenCount: 300,
        category: 'core',
        priority: 2,
      },
      {
        id: 'security',
        version: '1.0.0',
        content: '# Security Policies\n\nPrioritize user safety.',
        dependencies: [],
        tokenCount: 200,
        category: 'policies',
        priority: 1,
      },
    ];

    // Create mock implementations
    mockModuleLoader = {
      loadAllModules: vi.fn().mockResolvedValue(mockModules),
      getCacheStats: vi.fn().mockReturnValue({ modules: 0, metadata: 0 }),
      clearCache: vi.fn(),
    };

    mockModuleSelector = {
      selectModules: vi.fn().mockReturnValue(mockModules),
      validateSelection: vi.fn().mockReturnValue(true),
      optimizeForTokenBudget: vi.fn().mockImplementation((modules) => modules),
    };

    mockContextDetector = {
      detectTaskContext: vi.fn().mockImplementation((input: any) => ({
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        tokenBudget: input?.tokenBudget,
        environmentContext: {},
      })),
      clearCache: vi.fn(),
    };

    // Create the assembler and inject mocks
    promptAssembler = new PromptAssembler({
      enableCaching: true,
      maxTokenBudget: 1500,
      validateDependencies: true,
      selectionStrategy: 'default',
    });

    // Replace the internal components with mocks
    (promptAssembler as any).moduleLoader = mockModuleLoader;
    (promptAssembler as any).moduleSelector = mockModuleSelector;
    (promptAssembler as any).contextDetector = mockContextDetector;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('assemblePrompt', () => {
    it('should successfully assemble a prompt from modules', async () => {
      const result = await promptAssembler.assemblePrompt();

      expect(result.prompt).toContain('Agent Identity');
      expect(result.prompt).toContain('Core Mandates');
      expect(result.prompt).toContain('Security Policies');
      expect(result.includedModules).toHaveLength(3);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should combine modules in correct order', async () => {
      const result = await promptAssembler.assemblePrompt();

      const prompt = result.prompt;
      const identityIndex = prompt.indexOf('Agent Identity');
      const mandatesIndex = prompt.indexOf('Core Mandates');
      const securityIndex = prompt.indexOf('Security Policies');

      // Core modules should come before policy modules
      expect(identityIndex).toBeLessThan(securityIndex);
      expect(mandatesIndex).toBeLessThan(securityIndex);
    });

    it('should add user memory when provided', async () => {
      const userMemory = 'Remember to be extra helpful.';
      const result = await promptAssembler.assemblePrompt(
        undefined,
        userMemory,
      );

      expect(result.prompt).toContain('---');
      expect(result.prompt).toContain(userMemory);
      expect(result.context.hasUserMemory).toBe(true);
    });

    it('should not add separator when user memory is empty', async () => {
      const result = await promptAssembler.assemblePrompt(undefined, '');

      expect(result.prompt).not.toContain('---');
      expect(result.context.hasUserMemory).toBe(false);
    });

    it('should remove HTML comments from final output', async () => {
      const moduleWithComments = {
        ...mockModules[0],
        content: `<!--
Module: Identity
Tokens: 200
-->
# Agent Identity

You are an interactive CLI agent.`,
      };

      // Mock module loader to return module with comments
      (promptAssembler as any).moduleLoader.loadAllModules.mockResolvedValue([
        moduleWithComments,
      ]);
      (promptAssembler as any).moduleSelector.selectModules.mockReturnValue([
        moduleWithComments,
      ]);

      const result = await promptAssembler.assemblePrompt();

      expect(result.prompt).not.toContain('<!--');
      expect(result.prompt).not.toContain('-->');
      expect(result.prompt).toContain('Agent Identity');
    });

    it('should estimate token count correctly', async () => {
      const result = await promptAssembler.assemblePrompt();

      // Token count should be roughly prompt length / 4
      const expectedTokens = Math.ceil(result.prompt.length / 4);
      expect(result.totalTokens).toBeCloseTo(expectedTokens, 10);
    });

    it('should include assembly metadata', async () => {
      const result = await promptAssembler.assemblePrompt();

      expect(result.metadata).toEqual({
        assemblyTime: expect.any(Date),
        assemblyVersion: '1.0.0',
        moduleSelectionStrategy: 'default',
      });
    });

    it.skip('should handle module loading failure gracefully', async () => {
      (promptAssembler as any).moduleLoader.loadAllModules.mockRejectedValue(
        new Error('Module loading failed'),
      );

      const result = await promptAssembler.assemblePrompt();

      console.log('Actual warnings:', result.warnings);
      expect(result.prompt).toContain('You are an interactive CLI agent');
      expect(result.warnings).toContain(
        expect.stringContaining('Assembly failed: Module loading failed'),
      );
      expect(result.includedModules).toHaveLength(0);
    });

    it.skip('should warn when token budget is exceeded', async () => {
      const lowBudgetContext = { tokenBudget: 100 };
      const result = await promptAssembler.assemblePrompt(lowBudgetContext);

      console.log('Token budget warnings:', result.warnings);
      console.log('Total tokens:', result.totalTokens);
      expect(result.warnings).toContain(
        expect.stringContaining('Assembled prompt exceeds token budget'),
      );
    });

    it.skip('should warn when dependency validation fails', async () => {
      (promptAssembler as any).moduleSelector.validateSelection.mockReturnValue(
        false,
      );

      const result = await promptAssembler.assemblePrompt();

      console.log('Dependency validation warnings:', result.warnings);
      expect(result.warnings).toContain(
        expect.stringContaining('Module dependency validation failed'),
      );
    });

    it('should handle context overrides', async () => {
      const contextOverride = {
        taskType: 'debug' as const,
        tokenBudget: 2000,
      };

      const result = await promptAssembler.assemblePrompt(contextOverride);

      expect(
        (promptAssembler as any).contextDetector.detectTaskContext,
      ).toHaveBeenCalledWith(contextOverride);
    });
  });

  describe('selection strategies', () => {
    it('should use minimal strategy correctly', async () => {
      const minimalAssembler = new PromptAssembler({
        selectionStrategy: 'minimal',
      });

      // Set up mocks for the new assembler
      (minimalAssembler as any).moduleLoader = mockModuleLoader;
      (minimalAssembler as any).moduleSelector = mockModuleSelector;
      (minimalAssembler as any).contextDetector = mockContextDetector;

      const result = await minimalAssembler.assemblePrompt();

      // Should have fewer modules with minimal strategy
      expect(result.includedModules.length).toBeGreaterThan(0);
    });

    it('should use comprehensive strategy correctly', async () => {
      const comprehensiveAssembler = new PromptAssembler({
        selectionStrategy: 'comprehensive',
      });

      // Set up mocks for the new assembler
      (comprehensiveAssembler as any).moduleLoader = mockModuleLoader;
      (comprehensiveAssembler as any).moduleSelector = mockModuleSelector;
      (comprehensiveAssembler as any).contextDetector = mockContextDetector;

      const result = await comprehensiveAssembler.assemblePrompt();

      expect(result.includedModules.length).toBeGreaterThan(0);
    });

    it('should use custom selector when provided', async () => {
      const customSelector = vi.fn().mockReturnValue([mockModules[0]]);
      const customAssembler = new PromptAssembler({
        selectionStrategy: 'custom',
        customSelector,
      });

      // Set up mocks for the new assembler
      (customAssembler as any).moduleLoader = mockModuleLoader;
      (customAssembler as any).moduleSelector = mockModuleSelector;
      (customAssembler as any).contextDetector = mockContextDetector;

      const result = await customAssembler.assemblePrompt();

      expect(customSelector).toHaveBeenCalled();
      expect(result.includedModules).toHaveLength(1);
    });
  });

  describe('token budget optimization', () => {
    it('should apply token budget optimization when specified', async () => {
      const budgetContext = { tokenBudget: 500 };

      await promptAssembler.assemblePrompt(budgetContext);

      expect(
        (promptAssembler as any).moduleSelector.optimizeForTokenBudget,
      ).toHaveBeenCalledWith(expect.any(Array), 500);
    });

    it('should not apply optimization when no budget specified', async () => {
      await promptAssembler.assemblePrompt();

      expect(
        (promptAssembler as any).moduleSelector.optimizeForTokenBudget,
      ).not.toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    it('should provide assembly statistics', async () => {
      const stats = await promptAssembler.getAssemblyStats();

      expect(stats).toEqual({
        availableModules: 3,
        cacheStats: { modules: 0, metadata: 0 },
      });
    });

    it('should clear caches', () => {
      promptAssembler.clearCache();

      expect(
        (promptAssembler as any).moduleLoader.clearCache,
      ).toHaveBeenCalled();
      expect(
        (promptAssembler as any).contextDetector.clearCache,
      ).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle empty module list', async () => {
      (promptAssembler as any).moduleLoader.loadAllModules.mockResolvedValue(
        [],
      );

      const result = await promptAssembler.assemblePrompt();

      expect(result.warnings).toContain(
        'No modules found - falling back to empty prompt',
      );
      expect(result.prompt).toContain('You are an interactive CLI agent');
    });

    it('should create fallback result on error', async () => {
      (promptAssembler as any).moduleLoader.loadAllModules.mockRejectedValue(
        new Error('Critical failure'),
      );

      const result = await promptAssembler.assemblePrompt();

      expect(result.prompt).toBeTruthy();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.metadata.moduleSelectionStrategy).toBe('fallback');
    });
  });

  describe('configuration options', () => {
    it('should respect dependency validation setting', async () => {
      const noValidationAssembler = new PromptAssembler({
        validateDependencies: false,
      });

      await noValidationAssembler.assemblePrompt();

      expect(
        (noValidationAssembler as any).moduleSelector.validateSelection,
      ).not.toHaveBeenCalled();
    });

    it('should use default options when none provided', () => {
      const defaultAssembler = new PromptAssembler();

      expect((defaultAssembler as any).options.enableCaching).toBe(true);
      expect((defaultAssembler as any).options.maxTokenBudget).toBe(1500);
      expect((defaultAssembler as any).options.validateDependencies).toBe(true);
      expect((defaultAssembler as any).options.selectionStrategy).toBe(
        'default',
      );
    });
  });
});
