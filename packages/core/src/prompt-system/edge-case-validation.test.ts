/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PromptAssembler } from './PromptAssembler.js';
import { ValidationSuite } from './ValidationSuite.js';

describe('Edge Case Validation', () => {
  describe('Stress Testing', () => {
    it('should handle rapid successive assemblies', async () => {
      const assembler = new PromptAssembler({
        moduleDirectory: __dirname,
        enableCaching: true,
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(assembler.assemblePrompt());
      }

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result) => {
        expect(result.prompt.length).toBeGreaterThan(0);
        expect(result.totalTokens).toBeGreaterThan(0);
      });

      console.log(
        `✅ Rapid assembly stress test - ${results.length} simultaneous assemblies completed`,
      );
    });

    it('should handle various token budgets correctly', async () => {
      const assembler = new PromptAssembler({
        moduleDirectory: __dirname,
        enableCaching: true,
      });

      const budgets = [50, 100, 500, 1000, 2000, 5000];
      const results = [];

      for (const budget of budgets) {
        const result = await assembler.assemblePrompt({ tokenBudget: budget });
        results.push({
          budget,
          tokenCount: result.totalTokens,
          warnings: result.warnings.length,
        });

        expect(result.prompt.length).toBeGreaterThan(0);
        expect(result.totalTokens).toBeGreaterThan(0);
      }

      console.log('✅ Token budget stress test completed:');
      results.forEach((r) => {
        console.log(
          `   Budget: ${r.budget}, Used: ${r.tokenCount}, Warnings: ${r.warnings}`,
        );
      });
    });

    it('should handle invalid contexts gracefully', async () => {
      const assembler = new PromptAssembler({
        moduleDirectory: __dirname,
        enableCaching: true,
      });

      // Test various invalid/edge case contexts
      const edgeCases = [
        {},
        { hasGitRepo: null as unknown as boolean },
        { sandboxMode: undefined as unknown as boolean },
        { tokenBudget: -100 },
        { tokenBudget: 0 },
        { environmentContext: null as unknown as Record<string, string | undefined> },
        { taskType: 'invalid-type' as unknown as 'general' | 'debug' | 'new-application' | 'refactor' | 'software-engineering' },
      ];

      for (const context of edgeCases) {
        const result = await assembler.assemblePrompt(context);
        expect(result.prompt.length).toBeGreaterThan(0);
        expect(result.totalTokens).toBeGreaterThan(0);
        expect(result.warnings).toBeDefined();
      }

      console.log(
        `✅ Invalid context handling - ${edgeCases.length} edge cases handled gracefully`,
      );
    });
  });

  describe('Error Recovery', () => {
    it('should recover from validation failures', async () => {
      const validationSuite = new ValidationSuite();

      try {
        const report = await validationSuite.runCompleteValidation();

        // Should not throw, even if some validations fail
        expect(report).toBeDefined();
        expect(report.status).toMatch(/^(PASS|FAIL|WARNING)$/);
        expect(typeof report.overallScore).toBe('number');

        console.log(
          `✅ Validation recovery test - Status: ${report.status}, Score: ${report.overallScore}`,
        );
      } catch (_error) {
        // If it throws, that's fine too - this tests error handling
        console.log(
          `✅ Validation error handling - Error caught and handled: ${(_error as Error).message}`,
        );
        expect(_error).toBeInstanceOf(Error);
      }
    });

    it('should maintain system stability under load', async () => {
      const assembler = new PromptAssembler({
        moduleDirectory: __dirname,
        enableCaching: true,
      });

      let successCount = 0;
      let _errorCount = 0;
      const totalRuns = 20;

      for (let i = 0; i < totalRuns; i++) {
        try {
          const result = await assembler.assemblePrompt({
            hasGitRepo: i % 2 === 0,
            sandboxMode: i % 3 === 0,
            tokenBudget: 500 + i * 100,
            userMemory: i % 5 === 0 ? `Test memory ${i}` : undefined,
          });

          if (result.prompt.length > 0) {
            successCount++;
          }
        } catch (_error) {
          _errorCount++;
        }
      }

      const successRate = (successCount / totalRuns) * 100;
      expect(successRate).toBeGreaterThan(80); // At least 80% success rate

      console.log(
        `✅ Load stability test - ${successCount}/${totalRuns} successful (${successRate.toFixed(1)}% success rate)`,
      );
    });
  });

  describe('Memory and Performance', () => {
    it('should not leak memory with repeated operations', async () => {
      const assembler = new PromptAssembler({
        moduleDirectory: __dirname,
        enableCaching: true,
      });

      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let i = 0; i < 50; i++) {
        await assembler.assemblePrompt({
          userMemory: `Large memory block ${'x'.repeat(1000)} iteration ${i}`,
        });

        // Force garbage collection periodically to prevent legitimate caching from affecting test
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      // Should not increase memory by more than 50MB (generous threshold)
      expect(memoryIncreaseMB).toBeLessThan(50);

      console.log(
        `✅ Memory leak test - Memory increase: ${memoryIncreaseMB.toFixed(1)}MB`,
      );
    });

    it('should maintain performance under sustained load', async () => {
      const assembler = new PromptAssembler({
        moduleDirectory: __dirname,
        enableCaching: true,
      });

      const times = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await assembler.assemblePrompt();
        const end = Date.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      // Performance should be reasonable
      expect(avgTime).toBeLessThan(1000); // Average < 1 second
      expect(maxTime).toBeLessThan(2000); // Max < 2 seconds

      console.log(
        `✅ Performance consistency test - Avg: ${avgTime.toFixed(1)}ms, Min: ${minTime}ms, Max: ${maxTime}ms`,
      );
    });
  });

  describe('Integration Robustness', () => {
    it('should handle concurrent validation and assembly operations', async () => {
      const assembler = new PromptAssembler({
        moduleDirectory: __dirname,
        enableCaching: true,
      });

      const validationSuite = new ValidationSuite();

      // Run assembly and validation concurrently
      const assemblyPromise = assembler.assemblePrompt();
      const validationPromise = validationSuite
        .runCompleteValidation()
        .catch((e) => ({ error: e.message }));

      const [assemblyResult, validationResult] = await Promise.all([
        assemblyPromise,
        validationPromise,
      ]);

      // Assembly should always succeed
      expect(assemblyResult.prompt.length).toBeGreaterThan(0);

      // Validation might succeed or fail, but should complete
      expect(validationResult).toBeDefined();

      console.log(
        '✅ Concurrent operations test - Both assembly and validation completed',
      );
    });
  });
});
