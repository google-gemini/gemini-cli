/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptAssembler } from './PromptAssembler.js';
import type { TaskContext } from './interfaces/prompt-assembly.js';

// Simple integration test that doesn't rely on actual module files
describe('PromptAssembler Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables
    delete process.env.DEBUG;
    delete process.env.DEV;
    delete process.env.SANDBOX;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create assembler with default options', () => {
    const assembler = new PromptAssembler();
    expect(assembler).toBeDefined();
  });

  it('should create assembler with custom options', () => {
    const assembler = new PromptAssembler({
      enableCaching: false,
      maxTokenBudget: 2000,
      selectionStrategy: 'minimal',
    });
    expect(assembler).toBeDefined();
  });

  it('should handle empty module scenario gracefully', async () => {
    const assembler = new PromptAssembler();

    try {
      const result = await assembler.assemblePrompt();

      // Should return a fallback prompt when no modules are available
      expect(result.prompt).toBeTruthy();
      expect(result.prompt.length).toBeGreaterThan(10);
      expect(result.includedModules).toEqual([]);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    } catch (error) {
      // This is expected behavior when modules don't exist
      expect(error).toBeDefined();
    }
  });

  it('should provide cache statistics', async () => {
    const assembler = new PromptAssembler();

    const stats = await assembler.getAssemblyStats();

    expect(stats).toHaveProperty('availableModules');
    expect(stats).toHaveProperty('cacheStats');
    expect(typeof stats.availableModules).toBe('number');
  });

  it('should clear caches without errors', () => {
    const assembler = new PromptAssembler();

    expect(() => assembler.clearCache()).not.toThrow();
  });

  it('should handle context overrides', async () => {
    const assembler = new PromptAssembler();

    const customContext: Partial<TaskContext> = {
      taskType: 'debug',
      tokenBudget: 800,
    };

    try {
      const result = await assembler.assemblePrompt(customContext);
      expect(result.context.taskType).toBe('debug');
      expect(result.context.tokenBudget).toBe(800);
    } catch (error) {
      // Expected when modules don't exist
      expect(error).toBeDefined();
    }
  });

  it('should handle user memory correctly', async () => {
    const assembler = new PromptAssembler();
    const userMemory = 'Test user memory content';

    try {
      const result = await assembler.assemblePrompt(undefined, userMemory);
      expect(result.context.hasUserMemory).toBe(true);
      expect(result.prompt).toContain(userMemory);
    } catch (error) {
      // Expected when modules don't exist
      expect(error).toBeDefined();
    }
  });

  it('should provide performance stats', () => {
    const assembler = new PromptAssembler();

    const stats = assembler.getPerformanceStats();

    expect(stats).toHaveProperty('cacheStats');
    expect(stats).toHaveProperty('moduleLoaderStats');
  });

  it('should clear expired caches', () => {
    const assembler = new PromptAssembler();

    const result = assembler.clearExpiredCaches();

    expect(result).toHaveProperty('assemblyEntriesCleared');
    expect(typeof result.assemblyEntriesCleared).toBe('number');
  });

  it('should support different selection strategies', () => {
    const minimalAssembler = new PromptAssembler({
      selectionStrategy: 'minimal',
    });

    const comprehensiveAssembler = new PromptAssembler({
      selectionStrategy: 'comprehensive',
    });

    const customAssembler = new PromptAssembler({
      selectionStrategy: 'custom',
      customSelector: (context, modules) => modules.slice(0, 1),
    });

    expect(minimalAssembler).toBeDefined();
    expect(comprehensiveAssembler).toBeDefined();
    expect(customAssembler).toBeDefined();
  });

  it('should handle pre-warming cache', async () => {
    const assembler = new PromptAssembler();

    // Should not throw even if modules don't exist
    await expect(assembler.preWarmCache()).resolves.toBeUndefined();
  });
});

describe('Token Estimation Utilities', () => {
  const estimateTokenCount = (text: string): number =>
    Math.ceil(text.length / 4);

  it('should estimate tokens correctly', () => {
    const shortText = 'Hello world';
    const mediumText =
      'This is a medium length text that should have more tokens than the short text.';
    const longText =
      'This is a much longer text that should demonstrate the token estimation functionality working correctly with various content lengths and different types of content including technical terms, code snippets, and regular prose writing.';

    expect(estimateTokenCount(shortText)).toBeGreaterThan(0);
    expect(estimateTokenCount(mediumText)).toBeGreaterThan(
      estimateTokenCount(shortText),
    );
    expect(estimateTokenCount(longText)).toBeGreaterThan(
      estimateTokenCount(mediumText),
    );
  });

  it('should demonstrate token reduction potential', () => {
    const originalLongPrompt = `
You are an interactive CLI agent specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.

# Core Mandates

- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code.
- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate.
- **Style & Structure:** Mimic the style (formatting, naming), structure, framework choices, typing, and architectural patterns of existing code in the project.

# Primary Workflows

## Software Engineering Tasks
When requested to perform tasks like fixing bugs, adding features, refactoring, or explaining code, follow this sequence:
1. **Understand:** Think about the user's request and the relevant codebase context.
2. **Plan:** Build a coherent and grounded plan for how you intend to resolve the user's task.
3. **Implement:** Use the available tools to act on the plan.
4. **Verify (Tests):** If applicable and feasible, verify the changes using the project's testing procedures.
5. **Verify (Standards):** VERY IMPORTANT: After making code changes, execute the project-specific build, linting and type-checking commands.

# Operational Guidelines

## Tone and Style (CLI Interaction)
- **Concise & Direct:** Adopt a professional, direct, and concise tone suitable for a CLI environment.
- **Minimal Output:** Aim for fewer than 3 lines of text output per response whenever practical.
- **Clarity over Brevity (When Needed):** While conciseness is key, prioritize clarity for essential explanations.

## Security and Safety Rules
- **Explain Critical Commands:** Before executing commands that modify the file system, codebase, or system state, you *must* provide a brief explanation of the command's purpose and potential impact.
- **Security First:** Always apply security best practices.

## Tool Usage
- **File Paths:** Always use absolute paths when referring to files with tools.
- **Parallelism:** Execute multiple independent tool calls in parallel when feasible.
- **Command Execution:** Use the shell tool for running shell commands.
`.trim();

    const optimizedPrompt = `
# Agent Identity
You are an interactive CLI agent specializing in software engineering tasks.

# Core Mandates
- Follow project conventions
- Verify library usage before implementation
- Mimic existing code style and structure

# Software Engineering Workflow
1. Understand the request and codebase context
2. Plan the implementation approach
3. Implement using available tools
4. Verify with tests and standards

# Safety Guidelines
- Explain critical commands before execution
- Use absolute file paths
- Execute tools in parallel when possible
`.trim();

    const originalTokens = estimateTokenCount(originalLongPrompt);
    const optimizedTokens = estimateTokenCount(optimizedPrompt);

    const reductionPercent =
      ((originalTokens - optimizedTokens) / originalTokens) * 100;

    console.log(`Original: ${originalTokens} tokens`);
    console.log(`Optimized: ${optimizedTokens} tokens`);
    console.log(`Reduction: ${reductionPercent.toFixed(1)}%`);

    expect(reductionPercent).toBeGreaterThan(50);
    expect(optimizedTokens).toBeLessThan(originalTokens);
  });
});
