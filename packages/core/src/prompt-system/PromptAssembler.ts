/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PromptModule,
  TaskContext,
  AssemblyResult,
  PromptAssemblerOptions,
  ModuleLoader,
  ModuleSelector,
  ContextDetector,
} from './interfaces/prompt-assembly.js';
import { ModuleLoaderImpl } from './ModuleLoader.js';
import { ModuleSelectorImpl } from './ModuleSelector.js';
import { ContextDetectorImpl } from './ContextDetector.js';
import { PerformanceOptimizer } from './PerformanceOptimizer.js';
import { resolveToolReferences } from './ToolReferenceResolver.js';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Core dynamic assembly engine for context-aware prompt construction
 *
 * This class implements the heart of the modular prompt system as specified in PLAN.md Phase 1.2.
 * It intelligently selects and combines prompt modules based on task context, environment,
 * and user needs, targeting 60% token reduction through selective loading.
 */
export class PromptAssembler {
  private moduleLoader: ModuleLoader;
  private moduleSelector: ModuleSelector;
  private contextDetector: ContextDetector;
  private performanceOptimizer: PerformanceOptimizer;
  private options: Required<PromptAssemblerOptions>;
  private assemblyVersion = '1.0.0';

  constructor(options: PromptAssemblerOptions = {}) {
    // Set default options
    this.options = {
      moduleDirectory:
        options.moduleDirectory || this.getDefaultModuleDirectory(),
      enableCaching: options.enableCaching ?? true,
      maxTokenBudget: options.maxTokenBudget || 1500, // Target from PLAN.md
      validateDependencies: options.validateDependencies ?? true,
      selectionStrategy: options.selectionStrategy || 'default',
      customSelector: options.customSelector,
    };

    // Initialize components
    this.moduleLoader = new ModuleLoaderImpl(
      this.options.moduleDirectory,
      this.options.enableCaching,
    );
    this.moduleSelector = this.options.customSelector
      ? this.createCustomSelector(this.options.customSelector)
      : new ModuleSelectorImpl();
    this.contextDetector = new ContextDetectorImpl();
    this.performanceOptimizer = new PerformanceOptimizer();
  }

  /**
   * Main assembly method: intelligently combines modular prompt components
   * based on task context, environment, and user needs
   */
  async assemblePrompt(
    context?: Partial<TaskContext>,
    userMemory?: string,
  ): Promise<AssemblyResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Step 1: Detect or use provided context
      const fullContext = this.contextDetector.detectTaskContext(context);
      fullContext.hasUserMemory = Boolean(userMemory && userMemory.trim());

      // Step 1.5: Check performance cache
      if (this.options.enableCaching) {
        const cachedResult = this.performanceOptimizer.getCachedResult(
          fullContext,
          userMemory,
        );
        if (cachedResult) {
          return cachedResult;
        }
      }

      // Step 2: Load available modules
      const availableModules = await this.moduleLoader.loadAllModules();

      if (availableModules.length === 0) {
        warnings.push('No modules found - falling back to empty prompt');
        return this.createEmptyResult(fullContext, warnings);
      }

      // Step 3: Select modules based on context
      const selectedModules = this.selectModules(fullContext, availableModules);

      // Step 4: Validate selection if enabled
      if (this.options.validateDependencies) {
        const isValid = this.moduleSelector.validateSelection(
          selectedModules,
          availableModules,
        );
        if (!isValid) {
          warnings.push(
            'Module dependency validation failed - some dependencies may be missing',
          );
        }
      }

      // Step 5: Combine modules into final prompt
      const assembledPrompt = this.combineModules(selectedModules, fullContext);

      // Step 6: Apply tool reference resolution
      const resolvedPrompt = resolveToolReferences(assembledPrompt);

      // Step 7: Add user memory if provided
      const finalPrompt = this.addUserMemory(resolvedPrompt, userMemory);

      // Step 8: Calculate final metrics
      const totalTokens = this.estimateTokenCount(finalPrompt);

      // Step 9: Check token budget
      if (fullContext.tokenBudget && totalTokens > fullContext.tokenBudget) {
        warnings.push(
          `Assembled prompt exceeds token budget: ${totalTokens} > ${fullContext.tokenBudget}`,
        );
      }

      const result: AssemblyResult = {
        prompt: finalPrompt,
        includedModules: selectedModules,
        totalTokens,
        context: fullContext,
        warnings,
        metadata: {
          assemblyTime: new Date(startTime),
          assemblyVersion: this.assemblyVersion,
          moduleSelectionStrategy: this.options.selectionStrategy,
        },
      };

      // Step 10: Cache the result for future use
      if (this.options.enableCaching) {
        this.performanceOptimizer.cacheResult(fullContext, result, userMemory);
      }

      return result;
    } catch (error) {
      warnings.push(
        `Assembly failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.createEmptyResult(
        context
          ? this.contextDetector.detectTaskContext(context)
          : this.contextDetector.detectTaskContext(),
        warnings,
      );
    }
  }

  /**
   * Select modules based on task context using the configured strategy
   */
  private selectModules(
    context: TaskContext,
    availableModules: PromptModule[],
  ): PromptModule[] {
    let selectedModules: PromptModule[];

    switch (this.options.selectionStrategy) {
      case 'minimal':
        selectedModules = this.selectMinimalModules(context, availableModules);
        break;
      case 'comprehensive':
        selectedModules = this.selectComprehensiveModules(
          context,
          availableModules,
        );
        break;
      case 'custom':
        if (this.options.customSelector) {
          selectedModules = this.options.customSelector(
            context,
            availableModules,
          );
        } else {
          selectedModules = this.moduleSelector.selectModules(
            context,
            availableModules,
          );
        }
        break;
      case 'default':
      default:
        selectedModules = this.moduleSelector.selectModules(
          context,
          availableModules,
        );
        break;
    }

    // Apply token budget optimization if needed
    if (context.tokenBudget) {
      selectedModules = this.moduleSelector.optimizeForTokenBudget(
        selectedModules,
        context.tokenBudget,
      );
    }

    return selectedModules;
  }

  /**
   * Select minimal set of modules (base modules only)
   */
  private selectMinimalModules(
    context: TaskContext,
    availableModules: PromptModule[],
  ): PromptModule[] {
    const moduleMap = new Map(availableModules.map((m) => [m.id, m]));
    const baseModules = ['identity', 'mandates', 'security'];

    return baseModules
      .map((id) => moduleMap.get(id))
      .filter((module): module is PromptModule => module !== undefined);
  }

  /**
   * Select comprehensive set of modules (include most relevant modules)
   */
  private selectComprehensiveModules(
    context: TaskContext,
    availableModules: PromptModule[],
  ): PromptModule[] {
    // For comprehensive mode, temporarily increase token budget to include more modules
    const expandedContext: TaskContext = {
      ...context,
      tokenBudget: context.tokenBudget ? context.tokenBudget * 1.5 : 2000,
    };

    return this.moduleSelector.selectModules(expandedContext, availableModules);
  }

  /**
   * Combine selected modules into a coherent prompt
   */
  private combineModules(
    modules: PromptModule[],
    context: TaskContext,
  ): string {
    if (modules.length === 0) {
      return 'You are an interactive CLI agent specializing in software engineering tasks.';
    }

    // Sort modules by priority and category
    const sortedModules = [...modules].sort((a, b) => {
      // Sort by category first (core -> policy -> playbook -> context -> example)
      const categoryOrder = {
        core: 0,
        policy: 1,
        playbook: 2,
        context: 3,
        example: 4,
      };
      const categoryDiff =
        categoryOrder[a.category] - categoryOrder[b.category];
      if (categoryDiff !== 0) return categoryDiff;

      // Then by priority
      if (a.priority !== undefined && b.priority !== undefined) {
        return a.priority - b.priority;
      }
      if (a.priority !== undefined) return -1;
      if (b.priority !== undefined) return 1;

      // Finally by ID
      return a.id.localeCompare(b.id);
    });

    // Combine module contents with appropriate spacing
    const sections = sortedModules.map((module) => {
      // Clean up the content and ensure proper spacing
      let content = module.content.trim();

      // Remove any HTML comments (metadata) from the final output
      content = content.replace(/<!--[\s\S]*?-->/g, '').trim();

      return content;
    });

    return sections.join('\n\n').trim();
  }

  /**
   * Add user memory to the assembled prompt if provided
   */
  private addUserMemory(prompt: string, userMemory?: string): string {
    if (!userMemory || !userMemory.trim()) {
      return prompt;
    }

    const cleanMemory = userMemory.trim();
    return `${prompt}\n\n---\n\n${cleanMemory}`;
  }

  /**
   * Estimate token count for the assembled prompt
   */
  private estimateTokenCount(prompt: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    // This could be enhanced with a more sophisticated tokenizer
    return Math.ceil(prompt.length / 4);
  }

  /**
   * Create an empty result for error cases
   */
  private createEmptyResult(
    context: TaskContext,
    warnings: string[],
  ): AssemblyResult {
    return {
      prompt:
        'You are an interactive CLI agent specializing in software engineering tasks.',
      includedModules: [],
      totalTokens: 20,
      context,
      warnings,
      metadata: {
        assemblyTime: new Date(),
        assemblyVersion: this.assemblyVersion,
        moduleSelectionStrategy: 'fallback',
      },
    };
  }

  /**
   * Create a custom selector wrapper
   */
  private createCustomSelector(
    customFn: (context: TaskContext, modules: PromptModule[]) => PromptModule[],
  ): ModuleSelector {
    return {
      selectModules: customFn,
      validateSelection: (selected, available) =>
        this.moduleSelector.validateSelection(selected, available),
      optimizeForTokenBudget: (selected, budget) =>
        this.moduleSelector.optimizeForTokenBudget(selected, budget),
    };
  }

  /**
   * Get default module directory relative to this file
   */
  private getDefaultModuleDirectory(): string {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    return __dirname; // This points to the prompt-system directory
  }

  /**
   * Get assembly statistics
   */
  async getAssemblyStats(): Promise<{
    availableModules: number;
    cacheStats: { modules: number; metadata: number };
  }> {
    const availableModules = await this.moduleLoader.loadAllModules();
    const cacheStats = (this.moduleLoader as ModuleLoaderImpl).getCacheStats();

    return {
      availableModules: availableModules.length,
      cacheStats,
    };
  }

  /**
   * Clear all caches (useful for development and testing)
   */
  clearCache(): void {
    (this.moduleLoader as ModuleLoaderImpl).clearCache();
    (this.contextDetector as ContextDetectorImpl).clearCache();
    this.performanceOptimizer.clearCache();
  }

  /**
   * Pre-warm the cache with common contexts for better performance
   */
  async preWarmCache(): Promise<void> {
    await this.performanceOptimizer.preWarmCache((context: TaskContext) =>
      this.assemblePrompt(context),
    );
  }

  /**
   * Get comprehensive performance statistics
   */
  getPerformanceStats(): {
    cacheStats: ReturnType<typeof this.performanceOptimizer.getCacheStats>;
    moduleLoaderStats: ReturnType<
      (typeof this.moduleLoader & ModuleLoaderImpl)['getCacheStats']
    >;
  } {
    return {
      cacheStats: this.performanceOptimizer.getCacheStats(),
      moduleLoaderStats: (
        this.moduleLoader as ModuleLoaderImpl
      ).getCacheStats(),
    };
  }

  /**
   * Clear expired cache entries to manage memory usage
   */
  clearExpiredCaches(): {
    assemblyEntriesCleared: number;
  } {
    return {
      assemblyEntriesCleared: this.performanceOptimizer.clearExpiredEntries(),
    };
  }
}
