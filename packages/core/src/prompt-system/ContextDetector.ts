/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { isGitRepository } from '../utils/gitUtils.js';
import type {
  ContextDetector,
  TaskContext,
} from './interfaces/prompt-assembly.js';

/**
 * Implementation of context detection for intelligent module selection
 */
export class ContextDetectorImpl implements ContextDetector {
  private cachedContext: TaskContext | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5000; // Cache for 5 seconds

  /**
   * Detect task context from current environment and optional overrides
   */
  detectTaskContext(options?: Partial<TaskContext>): TaskContext {
    // Use cached context if still valid and no overrides provided
    if (
      !options &&
      this.cachedContext &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS
    ) {
      return this.cachedContext;
    }

    const hasGitRepo = this.detectGitRepository();
    const { sandboxMode, sandboxType } = this.detectSandboxMode();
    const environmentContext = this.analyzeEnvironment();

    // Detect task type from environment or default to general
    const taskType = this.detectTaskType(environmentContext, options?.taskType);

    // Build context flags based on detected conditions
    const contextFlags = this.buildContextFlags(
      taskType,
      hasGitRepo,
      sandboxMode,
      environmentContext,
    );

    const detectedContext: TaskContext = {
      taskType,
      hasGitRepo,
      sandboxMode,
      sandboxType,
      hasUserMemory: false, // This will be set by the caller
      contextFlags,
      tokenBudget: 1500, // Default budget from PLAN.md
      environmentContext,
      // Apply any overrides
      ...options,
    };

    // Cache the detected context if no overrides were provided
    if (!options) {
      this.cachedContext = detectedContext;
      this.cacheTimestamp = Date.now();
    }

    return detectedContext;
  }

  /**
   * Check if current directory is a git repository
   */
  detectGitRepository(): boolean {
    try {
      return isGitRepository(process.cwd());
    } catch (error) {
      // If git utils fail, assume not a git repo
      return false;
    }
  }

  /**
   * Detect sandbox mode and type from environment variables
   */
  detectSandboxMode(): { sandboxMode: boolean; sandboxType?: string } {
    const sandboxEnv = process.env.SANDBOX;

    if (!sandboxEnv) {
      return { sandboxMode: false, sandboxType: 'none' };
    }

    if (sandboxEnv === 'sandbox-exec') {
      return { sandboxMode: true, sandboxType: 'sandbox-exec' };
    }

    // Any other non-empty SANDBOX value indicates generic sandbox
    return { sandboxMode: true, sandboxType: 'generic' };
  }

  /**
   * Analyze environment for context clues
   */
  analyzeEnvironment(): Record<string, string | undefined> {
    return {
      SANDBOX: process.env.SANDBOX,
      GEMINI_SYSTEM_MD: process.env.GEMINI_SYSTEM_MD,
      GEMINI_WRITE_SYSTEM_MD: process.env.GEMINI_WRITE_SYSTEM_MD,
      NODE_ENV: process.env.NODE_ENV,
      PWD: process.cwd(),
      // Add other relevant environment variables
      DEBUG: process.env.DEBUG,
      DEV: process.env.DEV,
    };
  }

  /**
   * Detect task type from environment clues and hints
   */
  private detectTaskType(
    environmentContext: Record<string, string | undefined>,
    override?: TaskContext['taskType'],
  ): TaskContext['taskType'] {
    if (override) {
      return override;
    }

    // Check for debug-related environment variables
    if (environmentContext.DEBUG || environmentContext.DEV) {
      return 'debug';
    }

    // For now, default to general - this could be enhanced with more sophisticated detection
    // such as analyzing recent git commits, file patterns, or CLI arguments
    return 'general';
  }

  /**
   * Build context flags based on detected conditions
   */
  private buildContextFlags(
    taskType: TaskContext['taskType'],
    hasGitRepo: boolean,
    sandboxMode: boolean,
    environmentContext: Record<string, string | undefined>,
  ): TaskContext['contextFlags'] {
    const flags: TaskContext['contextFlags'] = {};

    // Set flags based on task type
    switch (taskType) {
      case 'debug':
        flags.requiresDebuggingGuidance = true;
        break;
      case 'new-application':
        flags.requiresApplicationGuidance = true;
        break;
      case 'refactor':
        flags.requiresRefactoringGuidance = true;
        break;
      case 'software-engineering':
        // General software engineering might need multiple guidances
        break;
    }

    // Set Git workflow flag
    if (hasGitRepo) {
      flags.requiresGitWorkflow = true;
    }

    // Set security flag for sandbox environments
    if (sandboxMode) {
      flags.requiresSecurityGuidance = true;
    }

    return flags;
  }

  /**
   * Clear the cached context (useful for testing)
   */
  public clearCache(): void {
    this.cachedContext = null;
    this.cacheTimestamp = 0;
  }
}
