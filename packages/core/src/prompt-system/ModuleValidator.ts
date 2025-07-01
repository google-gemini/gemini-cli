/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PromptModule,
  TaskContext,
  AssemblyResult,
} from './interfaces/prompt-assembly.js';
import type { ToolManifest } from './interfaces/tool-manifest.js';

/**
 * Interface for assembler objects used in validation
 */
interface AssemblerLike {
  assemblePrompt(context?: Partial<TaskContext>, userMemory?: string): Promise<AssemblyResult>;
}

/**
 * Validation result for a single module
 */
export interface ModuleValidationResult {
  /** Whether the module is valid */
  isValid: boolean;
  /** Any validation errors found */
  errors: string[];
  /** Validation warnings (non-fatal issues) */
  warnings: string[];
  /** Detailed validation info */
  details: {
    /** Whether the module content is valid */
    contentValid: boolean;
    /** Whether dependencies are resolvable */
    dependenciesValid: boolean;
    /** Whether token count is accurate */
    tokenCountAccurate: boolean;
    /** Actual vs declared token count */
    tokenCountDiff?: number;
  };
}

/**
 * Validation result for the entire module system
 */
export interface SystemValidationResult {
  /** Whether the entire system is valid */
  isValid: boolean;
  /** Overall system health score (0-100) */
  healthScore: number;
  /** Module-specific validation results */
  moduleResults: Map<string, ModuleValidationResult>;
  /** System-wide validation errors */
  systemErrors: string[];
  /** System-wide warnings */
  systemWarnings: string[];
  /** Validation summary statistics */
  summary: {
    totalModules: number;
    validModules: number;
    invalidModules: number;
    totalErrors: number;
    totalWarnings: number;
  };
}

/**
 * Options for module validation
 */
export interface ValidationOptions {
  /** Whether to validate module content thoroughly */
  validateContent?: boolean;
  /** Whether to check dependency resolution */
  validateDependencies?: boolean;
  /** Whether to verify token count accuracy */
  validateTokenCounts?: boolean;
  /** Whether to check for circular dependencies */
  checkCircularDependencies?: boolean;
  /** Token count tolerance (percentage) */
  tokenCountTolerance?: number;
  /** Maximum allowed module size in tokens */
  maxModuleTokens?: number;
  /** Minimum required content length */
  minContentLength?: number;
}

/**
 * Performance benchmark result
 */
export interface PerformanceBenchmark {
  /** Test name */
  name: string;
  /** Assembly time in milliseconds */
  assemblyTimeMs: number;
  /** Token count */
  tokenCount: number;
  /** Module count */
  moduleCount: number;
  /** Memory usage in bytes */
  memoryUsageBytes?: number;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Quality assurance test result
 */
export interface QualityTestResult {
  /** Test name */
  name: string;
  /** Whether test passed */
  passed: boolean;
  /** Test description */
  description: string;
  /** Expected behavior */
  expected: string;
  /** Actual result */
  actual: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Comprehensive module validation system
 */
export class ModuleValidator {
  private readonly defaultOptions: Required<ValidationOptions> = {
    validateContent: true,
    validateDependencies: true,
    validateTokenCounts: true,
    checkCircularDependencies: true,
    tokenCountTolerance: 10, // 10% tolerance
    maxModuleTokens: 800, // Maximum tokens per module
    minContentLength: 50, // Minimum content length
  };

  constructor(private options: ValidationOptions = {}) {
    this.options = { ...this.defaultOptions, ...this.options };
  }

  /**
   * Validate a single module
   */
  validateModule(
    module: PromptModule,
    availableModules: PromptModule[] = [],
  ): ModuleValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let contentValid = true;
    let dependenciesValid = true;
    let tokenCountAccurate = true;
    let tokenCountDiff: number | undefined;

    // Validate basic structure
    if (!module.id || typeof module.id !== 'string') {
      errors.push('Module ID is required and must be a string');
    }

    if (!module.version || typeof module.version !== 'string') {
      errors.push('Module version is required and must be a string');
    }

    if (!module.content || typeof module.content !== 'string') {
      errors.push('Module content is required and must be a string');
      contentValid = false;
    }

    if (!Array.isArray(module.dependencies)) {
      errors.push('Module dependencies must be an array');
      dependenciesValid = false;
    }

    if (typeof module.tokenCount !== 'number' || module.tokenCount < 0) {
      errors.push('Module tokenCount must be a non-negative number');
      tokenCountAccurate = false;
    }

    if (
      !module.category ||
      !['core', 'policies', 'playbook', 'context', 'example'].includes(
        module.category,
      )
    ) {
      errors.push(
        'Module category must be one of: core, policies, playbook, context, example',
      );
    }

    // Validate content if enabled
    if (this.options.validateContent && module.content) {
      if (module.content.length < this.options.minContentLength!) {
        warnings.push(
          `Module content is very short (${module.content.length} characters)`,
        );
      }

      // Check for basic markdown structure in content
      if (!module.content.includes('#') && module.content.length > 100) {
        warnings.push(
          'Module content may be missing proper markdown structure',
        );
      }
    }

    // Validate dependencies if enabled
    if (this.options.validateDependencies && module.dependencies) {
      for (const depId of module.dependencies) {
        const depModule = availableModules.find((m) => m.id === depId);
        if (!depModule) {
          errors.push(`Dependency '${depId}' not found in available modules`);
          dependenciesValid = false;
        }
      }
    }

    // Validate token count if enabled
    if (this.options.validateTokenCounts && module.content) {
      const estimatedTokens = this.estimateTokenCount(module.content);
      const tolerance = this.options.tokenCountTolerance! / 100;
      const diff = Math.abs(estimatedTokens - module.tokenCount);
      const maxDiff = module.tokenCount * tolerance;

      tokenCountDiff = estimatedTokens - module.tokenCount;

      if (diff > maxDiff) {
        warnings.push(
          `Token count mismatch: declared ${module.tokenCount}, estimated ${estimatedTokens} (diff: ${tokenCountDiff})`,
        );
        tokenCountAccurate = false;
      }

      if (module.tokenCount > this.options.maxModuleTokens!) {
        warnings.push(
          `Module exceeds maximum token limit (${module.tokenCount} > ${this.options.maxModuleTokens})`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details: {
        contentValid,
        dependenciesValid,
        tokenCountAccurate,
        tokenCountDiff,
      },
    };
  }

  /**
   * Validate the entire module system
   */
  validateSystem(modules: PromptModule[]): SystemValidationResult {
    const moduleResults = new Map<string, ModuleValidationResult>();
    const systemErrors: string[] = [];
    const systemWarnings: string[] = [];

    // Validate individual modules
    for (const module of modules) {
      const result = this.validateModule(module, modules);
      moduleResults.set(module.id, result);
    }

    // Check for circular dependencies if enabled
    if (this.options.checkCircularDependencies) {
      const circularDeps = this.findCircularDependencies(modules);
      if (circularDeps.length > 0) {
        systemErrors.push(
          `Circular dependencies found: ${circularDeps.join(', ')}`,
        );
      }
    }

    // Check for duplicate module IDs
    const moduleIds = modules.map((m) => m.id);
    const duplicateIds = moduleIds.filter(
      (id, index) => moduleIds.indexOf(id) !== index,
    );
    if (duplicateIds.length > 0) {
      systemErrors.push(
        `Duplicate module IDs found: ${[...new Set(duplicateIds)].join(', ')}`,
      );
    }

    // Check for required core modules
    const requiredCoreModules = ['identity', 'mandates', 'security'];
    const availableCoreModules = modules
      .filter((m) => m.category === 'core')
      .map((m) => m.id);
    const missingCoreModules = requiredCoreModules.filter(
      (id) => !availableCoreModules.includes(id),
    );
    if (missingCoreModules.length > 0) {
      systemWarnings.push(
        `Missing recommended core modules: ${missingCoreModules.join(', ')}`,
      );
    }

    // Calculate summary statistics
    const validModules = Array.from(moduleResults.values()).filter(
      (r) => r.isValid,
    ).length;
    const invalidModules = modules.length - validModules;
    const totalErrors =
      Array.from(moduleResults.values()).reduce(
        (sum, r) => sum + r.errors.length,
        0,
      ) + systemErrors.length;
    const totalWarnings =
      Array.from(moduleResults.values()).reduce(
        (sum, r) => sum + r.warnings.length,
        0,
      ) + systemWarnings.length;

    // Calculate health score (0-100)
    const baseScore = (validModules / modules.length) * 100;
    const errorPenalty = Math.min(totalErrors * 5, 30); // Max 30 point penalty for errors
    const warningPenalty = Math.min(totalWarnings * 2, 20); // Max 20 point penalty for warnings
    const healthScore = Math.max(0, baseScore - errorPenalty - warningPenalty);

    return {
      isValid: systemErrors.length === 0 && invalidModules === 0,
      healthScore,
      moduleResults,
      systemErrors,
      systemWarnings,
      summary: {
        totalModules: modules.length,
        validModules,
        invalidModules,
        totalErrors,
        totalWarnings,
      },
    };
  }

  /**
   * Run performance benchmarks
   */
  async runPerformanceBenchmarks(
    assembler: AssemblerLike,
  ): Promise<PerformanceBenchmark[]> {
    const benchmarks: PerformanceBenchmark[] = [];

    // Test scenarios
    const scenarios = [
      {
        name: 'Minimal Context',
        context: { taskType: 'general' as const, tokenBudget: 800 },
      },
      {
        name: 'Debug Context',
        context: { taskType: 'debug' as const, tokenBudget: 1200 },
      },
      {
        name: 'Software Engineering',
        context: {
          taskType: 'software-engineering' as const,
          tokenBudget: 1500,
        },
      },
      {
        name: 'New Application',
        context: { taskType: 'new-application' as const, tokenBudget: 1800 },
      },
      {
        name: 'Git + Sandbox',
        context: {
          taskType: 'general' as const,
          hasGitRepo: true,
          sandboxMode: true,
          tokenBudget: 1600,
        },
      },
    ];

    for (const scenario of scenarios) {
      const startTime = performance.now();
      const startMemory = this.getMemoryUsage();
      let success = false;
      let error: string | undefined;
      let result: AssemblyResult | undefined;

      try {
        result = await assembler.assemblePrompt(scenario.context);
        success = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      const endTime = performance.now();
      const endMemory = this.getMemoryUsage();

      benchmarks.push({
        name: scenario.name,
        assemblyTimeMs: endTime - startTime,
        tokenCount: result?.totalTokens ?? 0,
        moduleCount: result?.includedModules.length ?? 0,
        memoryUsageBytes: endMemory - startMemory,
        success,
        error,
      });
    }

    return benchmarks;
  }

  /**
   * Run quality assurance tests
   */
  async runQualityTests(assembler: AssemblerLike): Promise<QualityTestResult[]> {
    const tests: QualityTestResult[] = [];

    // Test 1: Basic assembly functionality
    tests.push(await this.testBasicAssembly(assembler));

    // Test 2: Context-aware module selection
    tests.push(await this.testContextAwareSelection(assembler));

    // Test 3: Token budget compliance
    tests.push(await this.testTokenBudgetCompliance(assembler));

    // Test 4: Dependency resolution
    tests.push(await this.testDependencyResolution(assembler));

    // Test 5: User memory integration
    tests.push(await this.testUserMemoryIntegration(assembler));

    return tests;
  }

  /**
   * Check backward compatibility
   */
  async validateBackwardCompatibility(
    originalPrompt: string,
    assembler: AssemblerLike,
  ): Promise<{
    compatible: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Test basic assembly
      const result = await assembler.assemblePrompt();

      // Check if essential components are preserved
      const essentialComponents = [
        'agent',
        'CLI',
        'software engineering',
        'tool',
        'security',
        'file',
        'shell',
      ];

      for (const component of essentialComponents) {
        const inOriginal = originalPrompt
          .toLowerCase()
          .includes(component.toLowerCase());
        const inDynamic = result.prompt
          .toLowerCase()
          .includes(component.toLowerCase());

        if (inOriginal && !inDynamic) {
          issues.push(
            `Essential component '${component}' missing from dynamic prompt`,
          );
        }
      }

      // Check if prompt is reasonably comprehensive
      if (result.prompt.length < originalPrompt.length * 0.3) {
        issues.push(
          'Dynamic prompt is significantly shorter than original (may be missing content)',
        );
        recommendations.push(
          'Review module selection to ensure adequate coverage',
        );
      }

      // Check if core instructions are preserved
      const coreInstructions = [
        'convention',
        'security',
        'tool usage',
        'file path',
      ];
      for (const instruction of coreInstructions) {
        if (
          originalPrompt.toLowerCase().includes(instruction) &&
          !result.prompt.toLowerCase().includes(instruction)
        ) {
          issues.push(`Core instruction about '${instruction}' may be missing`);
        }
      }
    } catch (error) {
      issues.push(
        `Failed to test compatibility: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      compatible: issues.length === 0,
      issues,
      recommendations,
    };
  }

  // Private helper methods

  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private findCircularDependencies(modules: PromptModule[]): string[] {
    const circularDeps: string[] = [];
    const moduleMap = new Map(modules.map((m) => [m.id, m]));

    for (const module of modules) {
      if (this.hasCircularDependency(module.id, moduleMap, new Set())) {
        circularDeps.push(module.id);
      }
    }

    return circularDeps;
  }

  private hasCircularDependency(
    moduleId: string,
    moduleMap: Map<string, PromptModule>,
    visited: Set<string>,
    path: Set<string> = new Set(),
  ): boolean {
    if (path.has(moduleId)) {
      return true; // Circular dependency found
    }

    if (visited.has(moduleId)) {
      return false; // Already checked this module
    }

    visited.add(moduleId);
    path.add(moduleId);

    const module = moduleMap.get(moduleId);
    if (module) {
      for (const depId of module.dependencies) {
        if (this.hasCircularDependency(depId, moduleMap, visited, path)) {
          return true;
        }
      }
    }

    path.delete(moduleId);
    return false;
  }

  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  private async testBasicAssembly(assembler: AssemblerLike): Promise<QualityTestResult> {
    try {
      const result = await assembler.assemblePrompt();
      return {
        name: 'Basic Assembly',
        passed: result.prompt.length > 0 && result.includedModules.length > 0,
        description: 'Tests that basic prompt assembly works',
        expected: 'Non-empty prompt with included modules',
        actual: `Prompt length: ${result.prompt.length}, Modules: ${result.includedModules.length}`,
      };
    } catch (error) {
      return {
        name: 'Basic Assembly',
        passed: false,
        description: 'Tests that basic prompt assembly works',
        expected: 'Successful assembly',
        actual: 'Assembly failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async testContextAwareSelection(
    assembler: AssemblerLike,
  ): Promise<QualityTestResult> {
    try {
      const generalResult = await assembler.assemblePrompt({
        taskType: 'general',
      });
      const debugResult = await assembler.assemblePrompt({ taskType: 'debug' });

      const differentModules =
        generalResult.includedModules.length !==
        debugResult.includedModules.length;

      return {
        name: 'Context-Aware Selection',
        passed: differentModules,
        description: 'Tests that different contexts select different modules',
        expected: 'Different module selection for different contexts',
        actual: `General: ${generalResult.includedModules.length}, Debug: ${debugResult.includedModules.length}`,
      };
    } catch (error) {
      return {
        name: 'Context-Aware Selection',
        passed: false,
        description: 'Tests that different contexts select different modules',
        expected: 'Context-aware module selection',
        actual: 'Selection failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async testTokenBudgetCompliance(
    assembler: AssemblerLike,
  ): Promise<QualityTestResult> {
    try {
      const budget = 1000;
      const result = await assembler.assemblePrompt({ tokenBudget: budget });

      return {
        name: 'Token Budget Compliance',
        passed: result.totalTokens <= budget,
        description: 'Tests that assembly respects token budget limits',
        expected: `Token count <= ${budget}`,
        actual: `Token count: ${result.totalTokens}`,
      };
    } catch (error) {
      return {
        name: 'Token Budget Compliance',
        passed: false,
        description: 'Tests that assembly respects token budget limits',
        expected: 'Successful budget compliance',
        actual: 'Budget test failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async testDependencyResolution(
    assembler: AssemblerLike,
  ): Promise<QualityTestResult> {
    try {
      const result = await assembler.assemblePrompt();

      // Check if all modules have their dependencies included
      const moduleIds = new Set(result.includedModules.map((m) => m.id));
      let allDependenciesResolved = true;

      for (const module of result.includedModules) {
        for (const depId of module.dependencies) {
          if (!moduleIds.has(depId)) {
            allDependenciesResolved = false;
            break;
          }
        }
      }

      return {
        name: 'Dependency Resolution',
        passed: allDependenciesResolved,
        description: 'Tests that all module dependencies are properly resolved',
        expected: 'All dependencies included in assembly',
        actual: allDependenciesResolved
          ? 'All dependencies resolved'
          : 'Some dependencies missing',
      };
    } catch (error) {
      return {
        name: 'Dependency Resolution',
        passed: false,
        description: 'Tests that all module dependencies are properly resolved',
        expected: 'Successful dependency resolution',
        actual: 'Dependency test failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async testUserMemoryIntegration(
    assembler: AssemblerLike,
  ): Promise<QualityTestResult> {
    try {
      const userMemory = 'Test user memory content for validation';
      const result = await assembler.assemblePrompt(undefined, userMemory);

      return {
        name: 'User Memory Integration',
        passed:
          result.prompt.includes(userMemory) && result.context.hasUserMemory,
        description:
          'Tests that user memory is properly integrated into prompts',
        expected: 'User memory included in prompt and context',
        actual: `Memory in prompt: ${result.prompt.includes(userMemory)}, Context flag: ${result.context.hasUserMemory}`,
      };
    } catch (error) {
      return {
        name: 'User Memory Integration',
        passed: false,
        description:
          'Tests that user memory is properly integrated into prompts',
        expected: 'Successful memory integration',
        actual: 'Memory test failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
