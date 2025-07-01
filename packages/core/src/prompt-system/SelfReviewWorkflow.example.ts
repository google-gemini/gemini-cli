/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Example workflow demonstrating the Self-Review Loop system
 *
 * This file shows practical usage patterns and integration examples
 * for the quality gates system in various scenarios.
 */

import { SelfReviewIntegration } from './SelfReviewIntegration.js';
import { PromptAssembler } from './PromptAssembler.js';
import type {
  TaskContext,
  AssemblyResult as _AssemblyResult,
} from './interfaces/prompt-assembly.js';
import type { ReviewResult as _ReviewResult, ReviewContext } from './interfaces/self-review.js';

/**
 * Example 1: Software Engineering Task with Full Quality Review
 */
export async function exampleSoftwareEngineeringWorkflow() {
  console.log('=== Software Engineering Workflow Example ===');

  const taskContext: TaskContext = {
    taskType: 'software-engineering',
    hasGitRepo: true,
    sandboxMode: false,
    hasUserMemory: false,
    contextFlags: {
      requiresSecurityGuidance: true,
    },
    environmentContext: {
      NODE_ENV: 'development',
      npm_package_devDependencies: JSON.stringify({
        typescript: '^5.0.0',
        vitest: '^1.0.0',
        eslint: '^8.0.0',
      }),
    },
  };

  // Assemble prompt with self-review integration
  const assembler = new PromptAssembler();
  const assemblyResult = await assembler.assemblePrompt(taskContext);

  console.log(
    'Included modules:',
    assemblyResult.includedModules.map((m) => m.id),
  );
  console.log('Total tokens:', assemblyResult.totalTokens);
  console.log(
    'Quality gates included:',
    assemblyResult.includedModules.some((m) => m.id === 'quality-gates'),
  );

  // Simulate AI-generated code
  const generatedCode = `
import { createHash } from 'crypto';

interface User {
  id: string;
  email: string;
  passwordHash: string;
}

export class UserService {
  private users: Map<string, User> = new Map();

  async createUser(email: string, password: string): Promise<User> {
    // Hash password securely
    const passwordHash = createHash('sha256').update(password).digest('hex');
    
    const user: User = {
      id: crypto.randomUUID(),
      email,
      passwordHash
    };

    this.users.set(user.id, user);
    return user;
  }

  async authenticateUser(email: string, password: string): Promise<User | null> {
    const passwordHash = createHash('sha256').update(password).digest('hex');
    
    for (const user of this.users.values()) {
      if (user.email === email && user.passwordHash === passwordHash) {
        return user;
      }
    }
    
    return null;
  }
}
`;

  // Execute quality review
  const integration = new SelfReviewIntegration();
  const reviewContext = integration.createReviewContext(
    taskContext,
    generatedCode,
  );
  const reviewResult = await integration.executeReview(reviewContext);

  console.log('Review result:', {
    success: reviewResult.success,
    action: reviewResult.action,
    passedChecks: reviewResult.passedChecks,
    failedChecks: reviewResult.failedChecks,
    totalTime: reviewResult.totalTime,
  });

  return { assemblyResult, reviewResult };
}

/**
 * Example 2: Security-Sensitive Code with Escalation
 */
export async function exampleSecurityEscalationWorkflow() {
  console.log('\n=== Security Escalation Workflow Example ===');

  const taskContext: TaskContext = {
    taskType: 'debug',
    hasGitRepo: true,
    sandboxMode: false,
    hasUserMemory: false,
    contextFlags: {
      requiresSecurityGuidance: true,
    },
    environmentContext: {
      NODE_ENV: 'production',
    },
  };

  // Code with security issues
  const problematicCode = `
// API configuration - DO NOT COMMIT TO VERSION CONTROL
const API_CONFIG = {
  endpoint: 'https://api.example.com',
  apiKey: 'sk-1234567890abcdef', // TODO: Move to environment
  secret: 'admin123'
};

export async function fetchUserData(userId: string) {
  const response = await fetch(\`\${API_CONFIG.endpoint}/users/\${userId}\`, {
    headers: {
      'Authorization': \`Bearer \${API_CONFIG.apiKey}\`,
      'X-Secret': API_CONFIG.secret
    }
  });
  
  return response.json();
}
`;

  const integration = new SelfReviewIntegration();
  const reviewContext = integration.createReviewContext(
    taskContext,
    problematicCode,
  );
  const reviewResult = await integration.executeReview(reviewContext);

  console.log('Security review result:', {
    success: reviewResult.success,
    action: reviewResult.action, // Should be 'escalate'
    failedChecks: reviewResult.failedChecks,
    securityIssues: reviewResult.failedChecks.includes('security_check'),
  });

  return reviewResult;
}

/**
 * Example 3: New Application Development with Progressive Review
 */
export async function exampleNewApplicationWorkflow() {
  console.log('\n=== New Application Development Workflow Example ===');

  const taskContext: TaskContext = {
    taskType: 'new-application',
    hasGitRepo: false,
    sandboxMode: false,
    hasUserMemory: false,
    contextFlags: {},
    environmentContext: {
      NODE_ENV: 'development',
    },
  };

  // Clean, well-structured code
  const cleanCode = `
import { describe, it, expect } from 'vitest';

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}

export class TodoService {
  private todos: TodoItem[] = [];

  addTodo(title: string): TodoItem {
    const todo: TodoItem = {
      id: crypto.randomUUID(),
      title: title.trim(),
      completed: false,
      createdAt: new Date()
    };

    this.todos.push(todo);
    return todo;
  }

  getTodos(): readonly TodoItem[] {
    return Object.freeze([...this.todos]);
  }

  toggleTodo(id: string): boolean {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
      return true;
    }
    return false;
  }
}

// Tests
describe('TodoService', () => {
  it('should add a new todo', () => {
    const service = new TodoService();
    const todo = service.addTodo('Test todo');
    
    expect(todo.title).toBe('Test todo');
    expect(todo.completed).toBe(false);
    expect(todo.id).toBeDefined();
  });

  it('should toggle todo completion', () => {
    const service = new TodoService();
    const todo = service.addTodo('Test todo');
    
    const success = service.toggleTodo(todo.id);
    expect(success).toBe(true);
    expect(service.getTodos()[0].completed).toBe(true);
  });
});
`;

  const integration = new SelfReviewIntegration();
  const reviewContext = integration.createReviewContext(taskContext, cleanCode);
  const reviewResult = await integration.executeReview(reviewContext);

  console.log('Clean code review result:', {
    success: reviewResult.success, // Should be true
    action: reviewResult.action, // Should be 'approve'
    passedChecks: reviewResult.passedChecks,
    gatePerformance: Object.entries(reviewResult.checkResults).map(
      ([gate, result]) => ({
        gate,
        success: result.success,
        time: result.executionTime,
      }),
    ),
  });

  return reviewResult;
}

/**
 * Example 4: Custom Quality Gate Configuration
 */
export async function exampleCustomQualityGatesWorkflow() {
  console.log('\n=== Custom Quality Gates Workflow Example ===');

  const taskContext: TaskContext = {
    taskType: 'software-engineering',
    hasGitRepo: true,
    sandboxMode: false,
    hasUserMemory: false,
    contextFlags: {},
    environmentContext: {},
  };

  // Create integration with custom configuration
  const integration = new SelfReviewIntegration();

  // Get current gates and add custom one
  const currentGates = integration.getQualityGatesConfig().qualityGates || [];
  const _customGates = [
    ...currentGates,
    {
      id: 'documentation_check',
      name: 'Documentation Validation',
      description: 'Validates code has proper documentation',
      condition: 'functions and classes have JSDoc comments',
      action: 'revise' as const,
      priority: 10,
      enabled: true,
      timeout: 3000,
      customValidator: async (context: ReviewContext) => {
        const hasJSDoc = context.codeContent.includes('/**');
        const hasComments = context.codeContent.includes('//');

        if (hasJSDoc || hasComments) {
          return {
            success: true,
            message: 'Documentation check passed - code has comments',
          };
        } else {
          return {
            success: false,
            message: 'Documentation check failed - missing comments or JSDoc',
          };
        }
      },
    },
  ];

  // Note: In practice, you'd create a new SelfReviewLoop with custom gates
  // This example shows the structure for custom validation

  const codeWithoutDocs = `
export function calculateTax(income: number, rate: number): number {
  return income * rate;
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
`;

  const reviewContext = integration.createReviewContext(
    taskContext,
    codeWithoutDocs,
  );
  const reviewResult = await integration.executeReview(reviewContext);

  console.log('Custom gates review result:', {
    success: reviewResult.success,
    action: reviewResult.action,
    checkResults: reviewResult.checkResults,
  });

  return reviewResult;
}

/**
 * Example 5: Performance and Metrics Monitoring
 */
export async function exampleMetricsMonitoringWorkflow() {
  console.log('\n=== Metrics Monitoring Workflow Example ===');

  const integration = new SelfReviewIntegration();

  // Run multiple reviews to generate metrics
  const testCases = [
    {
      code: 'const valid = "code";',
      taskType: 'software-engineering' as const,
      expectSuccess: true,
    },
    {
      code: 'const apiKey = "sk-invalidkey123";',
      taskType: 'software-engineering' as const,
      expectSuccess: false,
    },
    {
      code: 'import { nonExistent } from "missing-package";',
      taskType: 'new-application' as const,
      expectSuccess: false,
    },
  ];

  for (const testCase of testCases) {
    const taskContext: TaskContext = {
      taskType: testCase.taskType,
      hasGitRepo: false,
      sandboxMode: false,
      hasUserMemory: false,
      contextFlags: {},
      environmentContext: {},
    };

    const reviewContext = integration.createReviewContext(
      taskContext,
      testCase.code,
    );
    await integration.executeReview(reviewContext);
  }

  // Get metrics
  const metrics = integration.getReviewMetrics();
  console.log('Review metrics:', {
    totalReviews: metrics.totalReviews,
    successRate: `${metrics.successRate.toFixed(1)}%`,
    averageTime: `${metrics.averageReviewTime.toFixed(0)}ms`,
    commonFailures: metrics.commonFailures,
    gatePerformance: metrics.gatePerformance,
  });

  return metrics;
}

/**
 * Main demonstration function
 */
export async function runAllWorkflowExamples() {
  console.log('Self-Review Loop System - Workflow Examples\n');

  try {
    await exampleSoftwareEngineeringWorkflow();
    await exampleSecurityEscalationWorkflow();
    await exampleNewApplicationWorkflow();
    await exampleCustomQualityGatesWorkflow();
    await exampleMetricsMonitoringWorkflow();

    console.log('\n=== All workflow examples completed successfully ===');
  } catch (error) {
    console.error('Error running workflow examples:', error);
  }
}

// Export for testing
export const workflowExamples = {
  exampleSoftwareEngineeringWorkflow,
  exampleSecurityEscalationWorkflow,
  exampleNewApplicationWorkflow,
  exampleCustomQualityGatesWorkflow,
  exampleMetricsMonitoringWorkflow,
};
