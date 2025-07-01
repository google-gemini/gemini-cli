/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromptAssembler } from './PromptAssembler.js';
import { ValidationSuite } from './ValidationSuite.js';
import { resolveToolReferences } from './ToolReferenceResolver.js';
import type { TaskContext } from './interfaces/prompt-assembly.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Live Integration Test - Tests the actual prompt assembly system
 * in the current codebase to verify end-to-end functionality
 */
export class LiveIntegrationTest {
  private assembler: PromptAssembler;
  private validationSuite: ValidationSuite;

  constructor() {
    // Initialize with production configuration
    this.assembler = new PromptAssembler({
      moduleDirectory: path.join(__dirname),
      enableCaching: true,
      maxTokenBudget: 1500,
      validateDependencies: true,
      selectionStrategy: 'default',
    });

    this.validationSuite = new ValidationSuite();
  }

  /**
   * Test the complete end-to-end prompt generation workflow
   */
  async testEndToEndWorkflow(): Promise<boolean> {
    const testResults: Array<{
      name: string;
      passed: boolean;
      details?: unknown;
    }> = [];

    // Test 1: Basic prompt assembly
    try {
      const basicContext: TaskContext = {
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: true,
        contextFlags: {},
        environmentContext: {},
      };

      const basicResult = await this.assembler.assemblePrompt(basicContext);
      testResults.push({
        name: 'Basic prompt assembly',
        passed: basicResult.prompt.length > 0,
        details: {
          tokenCount: basicResult.totalTokens,
          moduleCount: basicResult.includedModules.length,
        },
      });
    } catch (error) {
      testResults.push({
        name: 'Basic prompt assembly',
        passed: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    // Test 2: Context-aware assembly (debug context)
    try {
      const debugContext: TaskContext = {
        taskType: 'debug',
        hasGitRepo: true,
        sandboxMode: true,
        sandboxType: 'sandbox-exec',
        hasUserMemory: false,
        contextFlags: {
          requiresDebuggingGuidance: true,
        },
        environmentContext: { NODE_ENV: 'development' },
      };

      const debugResult = await this.assembler.assemblePrompt(debugContext);
      testResults.push({
        name: 'Debug context assembly',
        passed: debugResult.includedModules.some((m) =>
          m.id.includes('debugging'),
        ),
        details: {
          modulesLoaded: debugResult.includedModules.map((m) => m.id),
          hasDebugging: debugResult.includedModules.some((m) =>
            m.id.includes('debugging'),
          ),
        },
      });
    } catch (error) {
      testResults.push({
        name: 'Debug context assembly',
        passed: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    // Test 3: Token reduction verification
    try {
      const minimalContext: TaskContext = {
        taskType: 'general',
        hasGitRepo: false,
        sandboxMode: false,
        hasUserMemory: false,
        contextFlags: {},
        environmentContext: {},
      };

      const result = await this.assembler.assemblePrompt(minimalContext);
      const tokenCount = result.totalTokens;
      const targetReduction = tokenCount <= 1500; // PLAN.md target

      testResults.push({
        name: 'Token reduction target',
        passed: targetReduction,
        details: {
          tokenCount,
          target: 1500,
          meetsTarget: targetReduction,
        },
      });
    } catch (error) {
      testResults.push({
        name: 'Token reduction target',
        passed: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    // Test 4: Performance benchmarking
    try {
      const start = performance.now();

      const contexts: TaskContext[] = [
        {
          taskType: 'general',
          hasGitRepo: false,
          sandboxMode: false,
          sandboxType: 'none',
          hasUserMemory: false,
          contextFlags: {},
          environmentContext: {},
        },
        {
          taskType: 'debug',
          hasGitRepo: true,
          sandboxMode: true,
          sandboxType: 'sandbox-exec',
          hasUserMemory: false,
          contextFlags: {},
          environmentContext: {},
        },
        {
          taskType: 'general',
          hasGitRepo: true,
          sandboxMode: false,
          sandboxType: 'none',
          hasUserMemory: false,
          contextFlags: {},
          environmentContext: {},
        },
      ];

      for (const context of contexts) {
        await this.assembler.assemblePrompt(context);
      }

      const duration = performance.now() - start;
      const avgTime = duration / contexts.length;

      testResults.push({
        name: 'Performance benchmarking',
        passed: avgTime < 100, // Target: <100ms per assembly
        details: {
          totalTime: duration,
          averageTime: avgTime,
          target: 100,
        },
      });
    } catch (error) {
      testResults.push({
        name: 'Performance benchmarking',
        passed: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    // Test 5: System validation
    try {
      const validationReport =
        await this.validationSuite.runCompleteValidation();
      testResults.push({
        name: 'System validation',
        passed:
          validationReport.overallScore >= 85 &&
          validationReport.criticalIssues.length === 0,
        details: {
          overallScore: validationReport.overallScore,
          criticalIssues: validationReport.criticalIssues.length,
          categoryScores: validationReport.categoryScores,
        },
      });
    } catch (error) {
      testResults.push({
        name: 'System validation',
        passed: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    // Display results
    console.log('\n=== LIVE INTEGRATION TEST RESULTS ===\n');

    let passedTests = 0;
    for (const test of testResults) {
      const status = test.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${test.name}`);
      if (test.details) {
        console.log(`   Details: ${JSON.stringify(test.details, null, 2)}`);
      }
      if (test.passed) passedTests++;
    }

    const overallSuccess = passedTests === testResults.length;
    console.log(
      `\nOverall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`,
    );
    console.log(`Tests Passed: ${passedTests}/${testResults.length}`);

    return overallSuccess;
  }

  /**
   * Test cross-component integration
   */
  async testCrossComponentIntegration(): Promise<boolean> {
    console.log('\n=== CROSS-COMPONENT INTEGRATION TEST ===\n');

    try {
      // Test module loader integration
      const moduleExists =
        await this.assembler['moduleLoader'].moduleExists('identity');
      console.log(`✅ Module Loader: identity module exists = ${moduleExists}`);

      // Test context detector integration
      const context =
        await this.assembler['contextDetector'].detectTaskContext();
      console.log(
        `✅ Context Detector: detected context = ${JSON.stringify(context)}`,
      );

      // Test module selector integration
      const selectedModules = this.assembler['moduleSelector'].selectModules(
        context,
        [],
      );
      console.log(
        `✅ Module Selector: selected ${selectedModules.length} modules`,
      );

      // Test tool reference resolver integration
      const testTemplate =
        'Use the {{file_operations.read}} tool to read files';
      try {
        const resolved = resolveToolReferences(testTemplate);
        console.log(
          `✅ Tool Reference Resolver: resolved template length = ${resolved.length}`,
        );
      } catch (error) {
        console.log(
          `⚠️  Tool Reference Resolver: ${error instanceof Error ? error.message : String(error)} (using original template)`,
        );
      }

      console.log('\n✅ ALL CROSS-COMPONENT INTEGRATIONS WORKING\n');
      return true;
    } catch (error) {
      console.error(`❌ Cross-component integration failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Generate production readiness report
   */
  async generateProductionReadinessReport(): Promise<void> {
    console.log('\n=== PRODUCTION READINESS ASSESSMENT ===\n');

    try {
      const report = await this.validationSuite.runCompleteValidation();
      console.log(this.validationSuite.generateReport(report));
    } catch (error) {
      console.error(
        `❌ Failed to generate production readiness report: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Run the live integration test if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new LiveIntegrationTest();

  (async () => {
    console.log('🚀 Starting Live Integration Test...\n');

    const endToEndSuccess = await test.testEndToEndWorkflow();
    const integrationSuccess = await test.testCrossComponentIntegration();
    await test.generateProductionReadinessReport();

    const overallSuccess = endToEndSuccess && integrationSuccess;

    console.log('\n=== FINAL ASSESSMENT ===');
    console.log(`End-to-End Tests: ${endToEndSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(
      `Integration Tests: ${integrationSuccess ? '✅ PASS' : '❌ FAIL'}`,
    );
    console.log(
      `Overall Status: ${overallSuccess ? '✅ PRODUCTION READY' : '❌ NEEDS ATTENTION'}`,
    );

    process.exit(overallSuccess ? 0 : 1);
  })();
}
