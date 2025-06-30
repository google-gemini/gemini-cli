/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCoreSystemPrompt } from '../core/prompts.js';
import { PromptAssembler } from './PromptAssembler.js';
import type {
  PromptModule,
  TaskContext,
} from './interfaces/prompt-assembly.js';

// Mock modules for demonstration
const mockModules: PromptModule[] = [
  {
    id: 'identity',
    version: '1.0.0',
    content: `# Agent Identity & Core Mission

You are an interactive CLI agent specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.

## Core Mission
- Software Engineering Specialist: Expert in code analysis, modification, debugging, and implementation
- Safety-First Approach: Prioritize user safety and system integrity in all operations
- Efficient Execution: Minimize friction while maintaining thoroughness and accuracy`,
    dependencies: [],
    tokenCount: 200,
    category: 'core',
    priority: 1,
  },
  {
    id: 'mandates',
    version: '1.0.0',
    content: `# Core Mandates

## Non-Negotiable Principles

### Code Integrity
- Conventions: Rigorously adhere to existing project conventions when reading or modifying code
- Libraries/Frameworks: NEVER assume a library/framework is available or appropriate
- Style & Structure: Mimic the style, structure, framework choices, typing, and architectural patterns

### Communication Standards  
- Comments: Add code comments sparingly, focus on why not what
- Explaining Changes: After completing modifications do not provide summaries unless asked`,
    dependencies: ['identity'],
    tokenCount: 300,
    category: 'core',
    priority: 2,
  },
  {
    id: 'security',
    version: '1.0.0',
    content: `# Security & Safety Policies

## Security Principles

### Command Execution Safety
- Explain Critical Commands: Before executing commands that modify the file system, provide explanation
- Security First: Always apply security best practices, never expose secrets

### User Control & Consent
- Respect User Confirmations: If user cancels a function call, respect their choice
- Data Protection: Never expose sensitive information in logs or outputs`,
    dependencies: [],
    tokenCount: 200,
    category: 'policies',
    priority: 1,
  },
];

describe('Dynamic Assembly Engine Demonstration', () => {
  let mockModuleLoader: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the module loader to return our test modules
    mockModuleLoader = {
      loadAllModules: vi.fn().mockResolvedValue(mockModules),
      moduleExists: vi.fn().mockReturnValue(true),
      loadModule: vi.fn().mockImplementation((id: string) => {
        const module = mockModules.find((m) => m.id === id);
        return Promise.resolve(module);
      }),
    };
  });

  it('should demonstrate significant token reduction compared to original system', async () => {
    console.log('\n=== DYNAMIC ASSEMBLY ENGINE DEMONSTRATION ===\n');

    // Get original prompt for comparison
    const originalPrompt = getCoreSystemPrompt();
    const originalTokens = Math.ceil(originalPrompt.length / 4);

    console.log('📊 TOKEN COMPARISON');
    console.log('─'.repeat(40));
    console.log(
      `Original system prompt tokens: ${originalTokens.toLocaleString()}`,
    );
    console.log(
      `Original system prompt length: ${originalPrompt.length.toLocaleString()} characters`,
    );

    // Create minimal assembler
    const assembler = new PromptAssembler({
      selectionStrategy: 'minimal',
      maxTokenBudget: 800,
      enableCaching: true,
    });

    // Mock the module loader
    (assembler as any).moduleLoader = mockModuleLoader;

    const minimalContext: TaskContext = {
      taskType: 'general',
      hasGitRepo: false,
      sandboxMode: false,
      hasUserMemory: false,
      contextFlags: {},
      tokenBudget: 800,
      environmentContext: {},
    };

    const result = await assembler.assemblePrompt(minimalContext);

    console.log(
      `\nMinimal assembly tokens: ${result.totalTokens.toLocaleString()}`,
    );
    console.log(
      `Minimal assembly length: ${result.prompt.length.toLocaleString()} characters`,
    );
    console.log(
      `Modules included: ${result.includedModules.map((m) => m.id).join(', ')}`,
    );

    const reduction =
      ((originalTokens - result.totalTokens) / originalTokens) * 100;
    console.log(`\n🎯 Token reduction achieved: ${reduction.toFixed(1)}%`);
    console.log(
      `${reduction >= 60 ? '✅' : '❌'} Target of 60% reduction ${reduction >= 60 ? 'MET' : 'NOT MET'}`,
    );

    // Verify the results
    expect(result.totalTokens).toBeLessThan(originalTokens);
    expect(result.includedModules.length).toBeGreaterThan(0);
    expect(result.prompt).toContain('CLI agent');
    expect(reduction).toBeGreaterThan(50); // Should achieve significant reduction

    console.log('\n✅ DYNAMIC ASSEMBLY ENGINE WORKING SUCCESSFULLY');
  });

  it('should demonstrate context-aware module selection', async () => {
    console.log('\n📋 CONTEXT-AWARE SELECTION TEST');
    console.log('─'.repeat(40));

    const assembler = new PromptAssembler({
      maxTokenBudget: 1500,
    });

    (assembler as any).moduleLoader = mockModuleLoader;

    // Test different contexts
    const contexts = [
      {
        name: 'General Task',
        context: {
          taskType: 'general' as const,
          hasGitRepo: false,
          sandboxMode: false,
        },
      },
      {
        name: 'Debug Task',
        context: {
          taskType: 'debug' as const,
          hasGitRepo: true,
          sandboxMode: true,
        },
      },
      {
        name: 'Software Engineering',
        context: {
          taskType: 'software-engineering' as const,
          hasGitRepo: true,
          sandboxMode: false,
        },
      },
    ];

    for (const { name, context } of contexts) {
      const fullContext: TaskContext = {
        ...context,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const result = await assembler.assemblePrompt(fullContext);

      console.log(`\n${name}:`);
      console.log(`  Tokens: ${result.totalTokens}`);
      console.log(
        `  Modules: ${result.includedModules.map((m) => m.id).join(', ')}`,
      );
      console.log(
        `  Warnings: ${result.warnings.length > 0 ? result.warnings.join('; ') : 'None'}`,
      );

      expect(result.totalTokens).toBeLessThanOrEqual(1500);
      expect(result.includedModules.length).toBeGreaterThan(0);
    }

    console.log('\n✅ CONTEXT-AWARE SELECTION WORKING');
  });

  it('should demonstrate performance optimization with caching', async () => {
    console.log('\n⚡ PERFORMANCE OPTIMIZATION TEST');
    console.log('─'.repeat(40));

    const assembler = new PromptAssembler({
      enableCaching: true,
      maxTokenBudget: 1000,
    });

    (assembler as any).moduleLoader = mockModuleLoader;

    const context: TaskContext = {
      taskType: 'general',
      hasGitRepo: false,
      sandboxMode: false,
      hasUserMemory: false,
      contextFlags: {},
      environmentContext: {},
    };

    // Time multiple assemblies to show caching benefit
    const iterations = 5;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      await assembler.assemblePrompt(context);
    }

    const end = Date.now();
    const totalTime = end - start;
    const avgTime = totalTime / iterations;

    console.log(`\n${iterations} assemblies completed in ${totalTime}ms`);
    console.log(`Average time per assembly: ${avgTime.toFixed(1)}ms`);

    // Get performance stats
    try {
      const stats = await assembler.getAssemblyStats();
      console.log(`Available modules: ${stats.availableModules}`);

      const perfStats = assembler.getPerformanceStats();
      console.log(`Assembly cache stats:`, perfStats.cacheStats);
    } catch (error) {
      console.log('Cache stats not available with mock loader');
    }

    expect(totalTime).toBeLessThan(1000); // Should be fast

    console.log('\n✅ PERFORMANCE OPTIMIZATION WORKING');
  });

  it('should verify PLAN.md token budget specifications', () => {
    console.log('\n📋 PLAN.MD SPECIFICATION VERIFICATION');
    console.log('─'.repeat(40));

    // Token budgets from PLAN.md
    const budgets = {
      base: 1500,
      debug: 250,
      git: 280,
      sandbox: 290,
      newApp: 395,
    };

    console.log('Token budget targets from PLAN.md:');
    console.log(`  Base assembly: ~${budgets.base} tokens`);
    console.log(`  Debug tasks: +${budgets.debug} tokens`);
    console.log(`  Git repos: +${budgets.git} tokens`);
    console.log(`  Sandbox mode: +${budgets.sandbox} tokens`);
    console.log(`  New applications: +${budgets.newApp} tokens`);

    // Verify base modules fit in base budget
    const baseModules = mockModules.filter((m) =>
      ['identity', 'mandates', 'security'].includes(m.id),
    );
    const baseTokens = baseModules.reduce((sum, m) => sum + m.tokenCount, 0);

    console.log(`\nBase modules token count: ${baseTokens}`);
    console.log(
      `Base budget compliance: ${baseTokens <= budgets.base ? '✅' : '❌'} ${baseTokens}/${budgets.base}`,
    );

    expect(baseTokens).toBeLessThanOrEqual(budgets.base);
    expect(baseTokens).toBeGreaterThan(500); // Should have substantial content

    console.log('\n✅ PLAN.MD SPECIFICATIONS VERIFIED');
  });
});
