/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelfReviewLoop } from './SelfReviewLoop.js';
import type {
  QualityGate,
  QualityCheck,
  ReviewResult,
  ReviewAction,
  QualityGateConfig,
  ReviewContext,
} from './interfaces/self-review.js';

describe('SelfReviewLoop', () => {
  let selfReviewLoop: SelfReviewLoop;
  let mockQualityGates: QualityGate[];
  let mockReviewContext: ReviewContext;

  beforeEach(() => {
    // Setup default mock quality gates
    mockQualityGates = [
      {
        id: 'syntax_valid',
        name: 'Syntax Validation',
        description: 'Validates code compiles without errors',
        condition: 'code compiles',
        action: 'revise',
        priority: 1,
        enabled: true,
        timeout: 5000,
      },
      {
        id: 'tests_pass',
        name: 'Test Execution',
        description: 'Validates tests execute successfully',
        condition: 'tests execute successfully',
        action: 'revise',
        priority: 2,
        enabled: true,
        timeout: 10000,
      },
      {
        id: 'style_compliant',
        name: 'Style Compliance',
        description: 'Validates code follows project style guide',
        condition: 'follows project style',
        action: 'approve',
        priority: 3,
        enabled: true,
        timeout: 3000,
      },
      {
        id: 'security_check',
        name: 'Security Validation',
        description: 'Validates no exposed secrets or vulnerabilities',
        condition: 'no exposed secrets/vulnerabilities',
        action: 'escalate',
        priority: 0,
        enabled: true,
        timeout: 7000,
      },
      {
        id: 'dependency_valid',
        name: 'Dependency Validation',
        description: 'Validates dependencies are available and secure',
        condition: 'dependencies are available and secure',
        action: 'revise',
        priority: 4,
        enabled: true,
        timeout: 8000,
      },
    ];

    mockReviewContext = {
      taskType: 'software-engineering',
      language: 'typescript',
      framework: 'node',
      hasTests: true,
      hasLinting: true,
      hasSecurityChecks: true,
      codeContent: 'const example = "hello world";',
      filePaths: ['/test/example.ts'],
      environmentContext: {
        NODE_ENV: 'development',
        CI: 'false',
      },
    };

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default quality gates', () => {
      selfReviewLoop = new SelfReviewLoop();
      expect(selfReviewLoop).toBeDefined();
      expect(selfReviewLoop.getEnabledGates()).toHaveLength(5); // Default gates
    });

    it('should initialize with custom quality gates', () => {
      const customGates = mockQualityGates.slice(0, 2);
      selfReviewLoop = new SelfReviewLoop({ qualityGates: customGates });
      expect(selfReviewLoop.getEnabledGates()).toHaveLength(2);
    });

    it('should initialize with custom configuration', () => {
      const config: QualityGateConfig = {
        maxReviewAttempts: 5,
        reviewTimeout: 30000,
        enableProgressiveReview: true,
        tokenBudget: 200,
        qualityGates: mockQualityGates,
      };
      selfReviewLoop = new SelfReviewLoop(config);
      const result = selfReviewLoop.getConfiguration();
      expect(result.maxReviewAttempts).toBe(5);
      expect(result.reviewTimeout).toBe(30000);
      expect(result.enableProgressiveReview).toBe(true);
      expect(result.tokenBudget).toBe(200);
      expect(result.qualityGates).toEqual(mockQualityGates);
    });
  });

  describe('executeReview', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should execute quality checks in priority order', async () => {
      const mockExecuteCheck = vi.spyOn(selfReviewLoop as any, 'executeQualityCheck');
      mockExecuteCheck.mockResolvedValue({ success: true, message: 'Check passed' });

      const result = await selfReviewLoop.executeReview(mockReviewContext);

      expect(result.success).toBe(true);
      expect(result.action).toBe('approve');
      // Security check should be first (priority 0)
      expect(mockExecuteCheck).toHaveBeenNthCalledWith(1, mockQualityGates[3], mockReviewContext);
    });

    it('should return revise action when syntax validation fails', async () => {
      const mockExecuteCheck = vi.spyOn(selfReviewLoop as any, 'executeQualityCheck');
      mockExecuteCheck
        .mockResolvedValueOnce({ success: true, message: 'Security check passed' }) // security_check
        .mockResolvedValueOnce({ success: false, message: 'Syntax error found' }) // syntax_valid
        .mockResolvedValue({ success: true, message: 'Check passed' }); // others

      const result = await selfReviewLoop.executeReview(mockReviewContext);

      expect(result.success).toBe(false);
      expect(result.action).toBe('revise');
      expect(result.failedChecks).toContain('syntax_valid');
    });

    it('should return escalate action when security check fails', async () => {
      const mockExecuteCheck = vi.spyOn(selfReviewLoop as any, 'executeQualityCheck');
      mockExecuteCheck
        .mockResolvedValueOnce({ success: false, message: 'Security vulnerability found' }) // security_check
        .mockResolvedValue({ success: true, message: 'Check passed' }); // others

      const result = await selfReviewLoop.executeReview(mockReviewContext);

      expect(result.success).toBe(false);
      expect(result.action).toBe('escalate');
      expect(result.failedChecks).toContain('security_check');
    });

    it('should handle timeout correctly', async () => {
      const shortTimeoutConfig = { 
        reviewTimeout: 50, // Very short timeout
        qualityGates: mockQualityGates 
      };
      selfReviewLoop = new SelfReviewLoop(shortTimeoutConfig);

      // Mock the executeQualityChecks to take longer than timeout
      const mockExecuteQualityChecks = vi.spyOn(selfReviewLoop as any, 'executeQualityChecks');
      mockExecuteQualityChecks.mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 1000)); // Takes 1 second, timeout is 50ms
      });

      const result = await selfReviewLoop.executeReview(mockReviewContext);

      expect(result.success).toBe(false);
      expect(result.action).toBe('revise');
      expect(result.errors).toContain('Review timeout exceeded');
    });

    it('should skip disabled quality gates', async () => {
      const gatesWithDisabled = mockQualityGates.map((gate, index) => ({
        ...gate,
        enabled: index !== 1, // Disable tests_pass
      }));
      selfReviewLoop = new SelfReviewLoop({ qualityGates: gatesWithDisabled });

      const mockExecuteCheck = vi.spyOn(selfReviewLoop as any, 'executeQualityCheck');
      mockExecuteCheck.mockResolvedValue({ success: true, message: 'Check passed' });

      const result = await selfReviewLoop.executeReview(mockReviewContext);

      expect(result.success).toBe(true);
      expect(mockExecuteCheck).toHaveBeenCalledTimes(4); // 5 gates - 1 disabled
    });
  });

  describe('executeQualityCheck', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should execute syntax validation check', async () => {
      const syntaxGate = mockQualityGates.find(g => g.id === 'syntax_valid')!;
      const mockValidateSyntax = vi.spyOn(selfReviewLoop as any, 'validateSyntax');
      mockValidateSyntax.mockResolvedValue({ success: true, message: 'Syntax is valid' });

      const result = await (selfReviewLoop as any).executeQualityCheck(syntaxGate, mockReviewContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Syntax is valid');
      expect(mockValidateSyntax).toHaveBeenCalledWith(mockReviewContext);
    });

    it('should execute test validation check', async () => {
      const testGate = mockQualityGates.find(g => g.id === 'tests_pass')!;
      const mockValidateTests = vi.spyOn(selfReviewLoop as any, 'validateTests');
      mockValidateTests.mockResolvedValue({ success: true, message: 'All tests pass' });

      const result = await (selfReviewLoop as any).executeQualityCheck(testGate, mockReviewContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('All tests pass');
      expect(mockValidateTests).toHaveBeenCalledWith(mockReviewContext);
    });

    it('should execute style validation check', async () => {
      const styleGate = mockQualityGates.find(g => g.id === 'style_compliant')!;
      const mockValidateStyle = vi.spyOn(selfReviewLoop as any, 'validateStyle');
      mockValidateStyle.mockResolvedValue({ success: true, message: 'Style is compliant' });

      const result = await (selfReviewLoop as any).executeQualityCheck(styleGate, mockReviewContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Style is compliant');
      expect(mockValidateStyle).toHaveBeenCalledWith(mockReviewContext);
    });

    it('should execute security validation check', async () => {
      const securityGate = mockQualityGates.find(g => g.id === 'security_check')!;
      const mockValidateSecurity = vi.spyOn(selfReviewLoop as any, 'validateSecurity');
      mockValidateSecurity.mockResolvedValue({ success: true, message: 'No security issues found' });

      const result = await (selfReviewLoop as any).executeQualityCheck(securityGate, mockReviewContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('No security issues found');
      expect(mockValidateSecurity).toHaveBeenCalledWith(mockReviewContext);
    });

    it('should execute dependency validation check', async () => {
      const dependencyGate = mockQualityGates.find(g => g.id === 'dependency_valid')!;
      const mockValidateDependencies = vi.spyOn(selfReviewLoop as any, 'validateDependencies');
      mockValidateDependencies.mockResolvedValue({ success: true, message: 'Dependencies are valid' });

      const result = await (selfReviewLoop as any).executeQualityCheck(dependencyGate, mockReviewContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Dependencies are valid');
      expect(mockValidateDependencies).toHaveBeenCalledWith(mockReviewContext);
    });

    it('should handle unknown quality gate type', async () => {
      const unknownGate: QualityGate = {
        id: 'unknown_check',
        name: 'Unknown Check',
        description: 'Unknown quality gate',
        condition: 'unknown condition',
        action: 'approve',
        priority: 10,
        enabled: true,
        timeout: 5000,
      };

      const result = await (selfReviewLoop as any).executeQualityCheck(unknownGate, mockReviewContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown quality gate type');
    });
  });

  describe('validateSyntax', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should validate TypeScript syntax', async () => {
      const contextWithValidTS = {
        ...mockReviewContext,
        language: 'typescript',
        codeContent: 'const valid: string = "hello";',
      };

      const result = await (selfReviewLoop as any).validateSyntax(contextWithValidTS);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Syntax validation passed');
    });

    it('should detect TypeScript syntax errors', async () => {
      const contextWithInvalidTS = {
        ...mockReviewContext,
        language: 'typescript',
        codeContent: 'const invalid: string = 123;', // Type error
      };

      const result = await (selfReviewLoop as any).validateSyntax(contextWithInvalidTS);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Syntax validation failed');
    });

    it('should validate JavaScript syntax', async () => {
      const contextWithValidJS = {
        ...mockReviewContext,
        language: 'javascript',
        codeContent: 'const valid = "hello";',
      };

      const result = await (selfReviewLoop as any).validateSyntax(contextWithValidJS);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Syntax validation passed');
    });

    it('should handle unsupported language gracefully', async () => {
      const contextWithUnsupportedLang = {
        ...mockReviewContext,
        language: 'rust',
        codeContent: 'fn main() { println!("Hello"); }',
      };

      const result = await (selfReviewLoop as any).validateSyntax(contextWithUnsupportedLang);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Syntax validation skipped');
    });
  });

  describe('validateTests', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should validate when tests are present and pass', async () => {
      const contextWithTests = {
        ...mockReviewContext,
        hasTests: true,
        framework: 'vitest',
      };

      const result = await (selfReviewLoop as any).validateTests(contextWithTests);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test validation passed');
    });

    it('should fail when tests are required but missing', async () => {
      const contextWithoutTests = {
        ...mockReviewContext,
        hasTests: false,
      };

      const result = await (selfReviewLoop as any).validateTests(contextWithoutTests);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No tests found');
    });

    it('should skip validation when tests are not expected', async () => {
      const contextWithoutTestRequirement = {
        ...mockReviewContext,
        hasTests: false,
        taskType: 'general' as const,
      };

      const result = await (selfReviewLoop as any).validateTests(contextWithoutTestRequirement);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test validation skipped');
    });
  });

  describe('validateStyle', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should validate style compliance', async () => {
      const contextWithLinting = {
        ...mockReviewContext,
        hasLinting: true,
      };

      const result = await (selfReviewLoop as any).validateStyle(contextWithLinting);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Style validation passed');
    });

    it('should detect style violations', async () => {
      const contextWithStyleIssues = {
        ...mockReviewContext,
        hasLinting: true,
        codeContent: 'const   bad_style="no-spaces";', // Style issues
      };

      const result = await (selfReviewLoop as any).validateStyle(contextWithStyleIssues);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Style validation failed');
    });

    it('should skip validation when linting is not configured', async () => {
      const contextWithoutLinting = {
        ...mockReviewContext,
        hasLinting: false,
      };

      const result = await (selfReviewLoop as any).validateStyle(contextWithoutLinting);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Style validation skipped');
    });
  });

  describe('validateSecurity', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should pass security validation for clean code', async () => {
      const contextWithCleanCode = {
        ...mockReviewContext,
        hasSecurityChecks: true,
        codeContent: 'const safeCode = "no secrets here";',
      };

      const result = await (selfReviewLoop as any).validateSecurity(contextWithCleanCode);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Security validation passed');
    });

    it('should detect exposed secrets', async () => {
      const contextWithSecrets = {
        ...mockReviewContext,
        hasSecurityChecks: true,
        codeContent: 'const apiKey = "sk-1234567890abcdef";', // Exposed API key
      };

      const result = await (selfReviewLoop as any).validateSecurity(contextWithSecrets);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Potential security issue detected');
    });

    it('should detect hardcoded passwords', async () => {
      const contextWithPassword = {
        ...mockReviewContext,
        hasSecurityChecks: true,
        codeContent: 'const password = "admin123";',
      };

      const result = await (selfReviewLoop as any).validateSecurity(contextWithPassword);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Potential security issue detected');
    });

    it('should skip validation when security checks are disabled', async () => {
      const contextWithoutSecurity = {
        ...mockReviewContext,
        hasSecurityChecks: false,
      };

      const result = await (selfReviewLoop as any).validateSecurity(contextWithoutSecurity);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Security validation skipped');
    });
  });

  describe('validateDependencies', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should validate available dependencies', async () => {
      const contextWithValidDeps = {
        ...mockReviewContext,
        codeContent: 'import { describe } from "vitest";',
      };

      const result = await (selfReviewLoop as any).validateDependencies(contextWithValidDeps);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Dependency validation passed');
    });

    it('should detect missing dependencies', async () => {
      const contextWithMissingDeps = {
        ...mockReviewContext,
        codeContent: 'import { nonExistentPackage } from "does-not-exist";',
      };

      const result = await (selfReviewLoop as any).validateDependencies(contextWithMissingDeps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing dependencies detected');
    });

    it('should skip validation for files without imports', async () => {
      const contextWithoutImports = {
        ...mockReviewContext,
        codeContent: 'const localVar = "no imports";',
      };

      const result = await (selfReviewLoop as any).validateDependencies(contextWithoutImports);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Dependency validation skipped');
    });
  });

  describe('getReviewPrompt', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should generate review prompt with quality gates', () => {
      const prompt = selfReviewLoop.getReviewPrompt();

      expect(prompt).toContain('QUALITY REVIEW SYSTEM');
      expect(prompt).toContain('syntax_valid');
      expect(prompt).toContain('tests_pass');
      expect(prompt).toContain('style_compliant');
      expect(prompt).toContain('security_check');
      expect(prompt).toContain('dependency_valid');
    });

    it('should generate contextual review prompt', () => {
      const prompt = selfReviewLoop.getReviewPrompt(mockReviewContext);

      expect(prompt).toContain('typescript');
      expect(prompt).toContain('software-engineering');
      expect(prompt).toContain('Quality Gates Active');
    });

    it('should respect token budget in prompt generation', () => {
      const compactConfig = {
        tokenBudget: 100,
        qualityGates: mockQualityGates.slice(0, 2), // Only use 2 gates
      };
      selfReviewLoop = new SelfReviewLoop(compactConfig);

      const prompt = selfReviewLoop.getReviewPrompt();

      expect(prompt.length).toBeLessThan(500); // Compact prompt
      expect(prompt).toContain('syntax_valid');
      expect(prompt).toContain('tests_pass');
      // With only 2 gates and limited budget, style gate should not be included
    });
  });

  describe('getTokenCount', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should return token count for review prompt', () => {
      const tokenCount = selfReviewLoop.getTokenCount();

      expect(tokenCount).toBeGreaterThan(0);
      expect(tokenCount).toBeLessThan(250); // Should meet token budget requirement
    });

    it('should respect token budget configuration', () => {
      const budgetConfig = { tokenBudget: 150, qualityGates: mockQualityGates.slice(0, 2) };
      selfReviewLoop = new SelfReviewLoop(budgetConfig);

      const tokenCount = selfReviewLoop.getTokenCount();

      expect(tokenCount).toBeLessThanOrEqual(150);
    });
  });

  describe('integration with existing systems', () => {
    beforeEach(() => {
      selfReviewLoop = new SelfReviewLoop({ qualityGates: mockQualityGates });
    });

    it('should integrate with TaskContext', () => {
      const taskContext = {
        taskType: 'software-engineering' as const,
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

      const reviewContext = selfReviewLoop.createReviewContext(taskContext, 'const code = "test";');

      expect(reviewContext.taskType).toBe('software-engineering');
      expect(reviewContext.hasSecurityChecks).toBe(true);
      expect(reviewContext.environmentContext.NODE_ENV).toBe('production');
    });

    it('should provide module-compatible interface', () => {
      const moduleInterface = selfReviewLoop.getModuleInterface();

      expect(moduleInterface).toHaveProperty('id');
      expect(moduleInterface).toHaveProperty('version');
      expect(moduleInterface).toHaveProperty('content');
      expect(moduleInterface).toHaveProperty('tokenCount');
      expect(moduleInterface.category).toBe('policies');
    });
  });
});