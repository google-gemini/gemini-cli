/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a single prompt module with metadata
 */
export interface PromptModule {
  /** Unique identifier for the module */
  id: string;
  /** Version of the module for compatibility */
  version: string;
  /** The actual prompt content */
  content: string;
  /** Other modules this module depends on */
  dependencies: string[];
  /** Estimated token count for this module */
  tokenCount: number;
  /** Category of the module (core, policy, playbook, context, example) */
  category: 'core' | 'policy' | 'playbook' | 'context' | 'example';
  /** Optional priority for module ordering */
  priority?: number;
}

/**
 * Context information for intelligent module selection
 */
export interface TaskContext {
  /** Type of task being performed */
  taskType:
    | 'general'
    | 'debug'
    | 'new-application'
    | 'refactor'
    | 'software-engineering';
  /** Whether the current directory is a git repository */
  hasGitRepo: boolean;
  /** Whether running in sandbox mode */
  sandboxMode: boolean;
  /** Specific sandbox type if applicable */
  sandboxType?: 'sandbox-exec' | 'generic' | 'none';
  /** Whether user memory is being included */
  hasUserMemory: boolean;
  /** Additional context flags */
  contextFlags: {
    requiresSecurityGuidance?: boolean;
    requiresGitWorkflow?: boolean;
    requiresDebuggingGuidance?: boolean;
    requiresApplicationGuidance?: boolean;
    requiresRefactoringGuidance?: boolean;
  };
  /** Target token budget for the assembled prompt */
  tokenBudget?: number;
  /** Environment variables that might affect module selection */
  environmentContext: {
    [key: string]: string | undefined;
  };
}

/**
 * Result of module selection and assembly
 */
export interface AssemblyResult {
  /** The assembled prompt text */
  prompt: string;
  /** Modules that were included in the assembly */
  includedModules: PromptModule[];
  /** Total estimated token count */
  totalTokens: number;
  /** Context used for assembly */
  context: TaskContext;
  /** Any warnings or issues during assembly */
  warnings: string[];
  /** Assembly metadata */
  metadata: {
    assemblyTime: Date;
    assemblyVersion: string;
    moduleSelectionStrategy: string;
  };
}

/**
 * Configuration options for the PromptAssembler
 */
export interface PromptAssemblerOptions {
  /** Base directory for prompt modules */
  moduleDirectory?: string;
  /** Whether to enable caching of loaded modules */
  enableCaching?: boolean;
  /** Maximum token budget for assembled prompts */
  maxTokenBudget?: number;
  /** Whether to validate module dependencies */
  validateDependencies?: boolean;
  /** Custom module selection strategy */
  selectionStrategy?: 'default' | 'minimal' | 'comprehensive' | 'custom';
  /** Custom module selector function */
  customSelector?: (
    context: TaskContext,
    availableModules: PromptModule[],
  ) => PromptModule[];
}

/**
 * Interface for module loading and management
 */
export interface ModuleLoader {
  /** Load a specific module by ID */
  loadModule(id: string): Promise<PromptModule>;
  /** Load all modules from a category */
  loadModulesByCategory(
    category: PromptModule['category'],
  ): Promise<PromptModule[]>;
  /** Load all available modules */
  loadAllModules(): Promise<PromptModule[]>;
  /** Check if a module exists */
  moduleExists(id: string): boolean;
  /** Get module metadata without loading content */
  getModuleMetadata(id: string): Promise<Omit<PromptModule, 'content'>>;
}

/**
 * Interface for intelligent module selection
 */
export interface ModuleSelector {
  /** Select modules based on task context */
  selectModules(
    context: TaskContext,
    availableModules: PromptModule[],
  ): PromptModule[];
  /** Validate module selection against dependencies */
  validateSelection(
    selectedModules: PromptModule[],
    availableModules: PromptModule[],
  ): boolean;
  /** Optimize module selection for token budget */
  optimizeForTokenBudget(
    selectedModules: PromptModule[],
    tokenBudget: number,
  ): PromptModule[];
}

/**
 * Context detection utilities interface
 */
export interface ContextDetector {
  /** Detect task context from current environment */
  detectTaskContext(options?: Partial<TaskContext>): TaskContext;
  /** Check if current directory is a git repository */
  detectGitRepository(): boolean;
  /** Detect sandbox mode and type */
  detectSandboxMode(): { sandboxMode: boolean; sandboxType?: string };
  /** Analyze environment for context clues */
  analyzeEnvironment(): Record<string, string | undefined>;
}
