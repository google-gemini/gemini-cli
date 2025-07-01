/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModuleSelector,
  PromptModule,
  TaskContext,
} from './interfaces/prompt-assembly.js';
import { getSelfReviewModule } from './SelfReviewIntegration.js';

/**
 * Implementation of intelligent module selection for prompt assembly
 */
export class ModuleSelectorImpl implements ModuleSelector {
  /**
   * Select modules based on task context using intelligent heuristics
   */
  selectModules(
    context: TaskContext,
    availableModules: PromptModule[],
  ): PromptModule[] {
    const selected = new Set<string>();
    const moduleMap = new Map<string, PromptModule>();

    // Build a lookup map for modules
    for (const module of availableModules) {
      moduleMap.set(module.id, module);
    }

    // Step 1: Always include base modules (as specified in PLAN.md)
    const baseModules = ['identity', 'mandates', 'security'];
    for (const moduleId of baseModules) {
      if (moduleMap.has(moduleId)) {
        selected.add(moduleId);
      }
    }

    // Step 2: Add task-specific modules based on context
    this.addTaskSpecificModules(context, selected, moduleMap);

    // Step 3: Add context-aware modules
    this.addContextAwareModules(context, selected, moduleMap);

    // Step 3.5: Add self-review module if appropriate
    this.addSelfReviewModule(context, selected, moduleMap);

    // Step 4: Resolve dependencies
    this.resolveDependencies(selected, moduleMap);

    // Step 5: Apply token budget optimization if specified
    let selectedModules = Array.from(selected)
      .map((id) => moduleMap.get(id)!)
      .filter(Boolean);

    if (context.tokenBudget) {
      selectedModules = this.optimizeForTokenBudget(
        selectedModules,
        context.tokenBudget,
      );
    }

    // Step 6: Sort by priority and category
    return this.sortModules(selectedModules);
  }

  /**
   * Add task-specific modules based on task type
   */
  private addTaskSpecificModules(
    context: TaskContext,
    selected: Set<string>,
    moduleMap: Map<string, PromptModule>,
  ): void {
    switch (context.taskType) {
      case 'debug':
        if (moduleMap.has('debugging')) selected.add('debugging');
        break;
      case 'new-application':
        if (moduleMap.has('new-application')) selected.add('new-application');
        break;
      case 'refactor':
        if (moduleMap.has('refactoring')) selected.add('refactoring');
        break;
      case 'software-engineering':
        if (moduleMap.has('software-engineering'))
          selected.add('software-engineering');
        break;
      case 'general':
        // For general tasks, include software-engineering as fallback
        if (moduleMap.has('software-engineering'))
          selected.add('software-engineering');
        break;

      default:
        // No specific modules for other task types
        break;
    }
  }

  /**
   * Add context-aware modules based on environment and flags
   */
  private addContextAwareModules(
    context: TaskContext,
    selected: Set<string>,
    moduleMap: Map<string, PromptModule>,
  ): void {
    const { contextFlags } = context;

    // Git workflow module
    if (context.hasGitRepo || contextFlags.requiresGitWorkflow) {
      if (moduleMap.has('git-workflows')) selected.add('git-workflows');
    }

    // Sandbox policies
    if (context.sandboxMode) {
      if (moduleMap.has('sandbox-policies')) selected.add('sandbox-policies');
    }

    // Additional context-specific modules based on flags
    if (contextFlags.requiresDebuggingGuidance) {
      if (moduleMap.has('debugging')) selected.add('debugging');
    }

    if (contextFlags.requiresApplicationGuidance) {
      if (moduleMap.has('new-application')) selected.add('new-application');
    }

    if (contextFlags.requiresRefactoringGuidance) {
      if (moduleMap.has('refactoring')) selected.add('refactoring');
    }

    if (contextFlags.requiresSecurityGuidance) {
      if (moduleMap.has('security')) selected.add('security');
    }

    // Tool usage guidance (generally useful)
    if (moduleMap.has('tool-usage')) selected.add('tool-usage');

    // Style guide (generally useful for code-related tasks)
    if (context.taskType !== 'general' && moduleMap.has('style-guide')) {
      selected.add('style-guide');
    }

    // ReAct reasoning patterns for complex tasks requiring structured reasoning
    if (
      this.shouldIncludeReActPattern(context) &&
      moduleMap.has('reasoning-patterns')
    ) {
      selected.add('reasoning-patterns');
    }
  }

  /**
   * Add self-review module if appropriate for the task context
   */
  private addSelfReviewModule(
    context: TaskContext,
    selected: Set<string>,
    moduleMap: Map<string, PromptModule>,
  ): void {
    const selfReviewModule = getSelfReviewModule(context);

    if (selfReviewModule) {
      // Add the self-review module to the module map if it's not already there
      if (!moduleMap.has(selfReviewModule.id)) {
        moduleMap.set(selfReviewModule.id, selfReviewModule);
      }

      // Select the module
      selected.add(selfReviewModule.id);
    }
  }

  /**
   * Resolve module dependencies by adding required modules
   */
  private resolveDependencies(
    selected: Set<string>,
    moduleMap: Map<string, PromptModule>,
  ): void {
    const toProcess = Array.from(selected);
    const processed = new Set<string>();

    while (toProcess.length > 0) {
      const moduleId = toProcess.shift()!;

      if (processed.has(moduleId)) {
        continue;
      }

      processed.add(moduleId);
      const module = moduleMap.get(moduleId);

      if (module && module.dependencies) {
        for (const dependency of module.dependencies) {
          if (!selected.has(dependency) && moduleMap.has(dependency)) {
            selected.add(dependency);
            toProcess.push(dependency);
          }
        }
      }
    }
  }

  /**
   * Validate module selection against dependencies
   */
  validateSelection(
    selectedModules: PromptModule[],
    availableModules: PromptModule[],
  ): boolean {
    const selectedIds = new Set(selectedModules.map((m) => m.id));
    const availableIds = new Set(availableModules.map((m) => m.id));

    for (const module of selectedModules) {
      for (const dependency of module.dependencies) {
        // Check if dependency is available
        if (!availableIds.has(dependency)) {
          return false;
        }

        // Check if dependency is selected
        if (!selectedIds.has(dependency)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Optimize module selection for token budget constraints
   */
  optimizeForTokenBudget(
    selectedModules: PromptModule[],
    tokenBudget: number,
  ): PromptModule[] {
    // Sort modules by priority (higher priority first, then by category importance)
    const prioritized = this.sortModules(selectedModules);

    // Calculate current token count
    let currentTokens = 0;
    const optimized: PromptModule[] = [];

    // Define absolutely essential modules (minimal viable set)
    const essential = new Set(['identity', 'mandates', 'security']);

    // Add quality-gates as essential if it was selected (means the context requires it)
    const hasQualityGates = selectedModules.some(
      (m) => m.id === 'quality-gates',
    );
    if (hasQualityGates) {
      essential.add('quality-gates');
    }

    // First pass: Add essential modules
    for (const module of prioritized) {
      if (essential.has(module.id)) {
        optimized.push(module);
        currentTokens += module.tokenCount;
      }
    }

    // Second pass: Add optional modules if they fit in budget
    for (const module of prioritized) {
      if (essential.has(module.id)) {
        continue; // Already added
      }

      const newTotal = currentTokens + module.tokenCount;
      if (newTotal <= tokenBudget) {
        optimized.push(module);
        currentTokens = newTotal;
      }
    }

    return optimized;
  }

  /**
   * Sort modules by priority and category importance
   */
  private sortModules(modules: PromptModule[]): PromptModule[] {
    // Define category priority order
    const categoryPriority: Record<PromptModule['category'], number> = {
      core: 1,
      policies: 2,
      playbook: 3,
      context: 4,
      example: 5,
    };

    return modules.sort((a, b) => {
      // First, sort by explicit priority if both have it
      if (a.priority !== undefined && b.priority !== undefined) {
        return a.priority - b.priority;
      }

      // If only one has priority, it goes first
      if (a.priority !== undefined) return -1;
      if (b.priority !== undefined) return 1;

      // Then sort by category priority
      const categoryDiff =
        categoryPriority[a.category] - categoryPriority[b.category];
      if (categoryDiff !== 0) return categoryDiff;

      // Finally, sort alphabetically by ID
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Get selection statistics
   */
  getSelectionStats(selectedModules: PromptModule[]): {
    totalTokens: number;
    moduleCount: number;
    categoryBreakdown: Record<string, number>;
  } {
    const totalTokens = selectedModules.reduce(
      (sum, module) => sum + module.tokenCount,
      0,
    );
    const categoryBreakdown: Record<string, number> = {};

    for (const module of selectedModules) {
      categoryBreakdown[module.category] =
        (categoryBreakdown[module.category] || 0) + 1;
    }

    return {
      totalTokens,
      moduleCount: selectedModules.length,
      categoryBreakdown,
    };
  }

  /**
   * Determine if ReAct reasoning pattern should be included based on task context
   * ReAct is valuable for complex, multi-step problems requiring structured reasoning
   */
  private shouldIncludeReActPattern(context: TaskContext): boolean {
    // Include for complex task types that benefit from structured reasoning
    const complexTaskTypes: Array<TaskContext['taskType']> = [
      'debug',
      'software-engineering',
      'refactor',
    ];

    if (complexTaskTypes.includes(context.taskType)) {
      return true;
    }

    // Include if specific guidance flags are set (indicates complexity)
    const { contextFlags } = context;
    if (
      contextFlags.requiresDebuggingGuidance ||
      contextFlags.requiresRefactoringGuidance ||
      contextFlags.requiresApplicationGuidance
    ) {
      return true;
    }

    // Don't include for simple general tasks to maintain efficiency
    return false;
  }
}
