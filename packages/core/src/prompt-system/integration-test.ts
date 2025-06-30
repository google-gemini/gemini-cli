#!/usr/bin/env node
import { PromptAssembler } from './PromptAssembler';
import { ContextDetector } from './ContextDetector';
import { ModuleLoader } from './ModuleLoader';
import { ModuleSelector } from './ModuleSelector';
import { ToolReferenceResolver } from './ToolReferenceResolver';

async function testIntegration() {
  try {
    console.log('🔄 Testing Real-world Integration...');

    const moduleLoader = new ModuleLoader();
    const moduleSelector = new ModuleSelector();
    const contextDetector = new ContextDetector();
    const toolReferenceResolver = new ToolReferenceResolver();

    const assembler = new PromptAssembler(
      moduleLoader,
      moduleSelector,
      contextDetector,
      toolReferenceResolver,
    );

    // Test basic assembly
    const result = await assembler.assemblePrompt();

    console.log('✅ Integration Test Results:');
    console.log(`   Modules included: ${result.includedModules.length}`);
    console.log(`   Token estimate: ${result.tokenCount}`);
    console.log(`   Warnings: ${result.warnings.length}`);
    console.log(`   Assembly time: ${result.assemblyTime}ms`);
    console.log(`   Prompt length: ${result.prompt.length} chars`);

    if (result.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      result.warnings.forEach((w) => console.log(`     - ${w}`));
    }

    // Test with context
    const gitContext = {
      hasGitRepo: true,
      sandboxMode: false,
      userMemory: 'Test user context',
      tokenBudget: 2000,
    };

    const gitResult = await assembler.assemblePrompt(gitContext);
    console.log(
      `\n✅ Git Context Test - Modules: ${gitResult.includedModules.length}, Tokens: ${gitResult.tokenCount}`,
    );

    // Test with sandbox context
    const sandboxContext = {
      hasGitRepo: false,
      sandboxMode: true,
      userMemory: '',
      tokenBudget: 1200,
    };

    const sandboxResult = await assembler.assemblePrompt(sandboxContext);
    console.log(
      `✅ Sandbox Context Test - Modules: ${sandboxResult.includedModules.length}, Tokens: ${sandboxResult.tokenCount}`,
    );

    // Test token reduction calculation
    const estimatedOriginal = 4200; // From PLAN.md
    const reductionPercentage =
      ((estimatedOriginal - result.tokenCount) / estimatedOriginal) * 100;
    console.log(`\n📊 Token Efficiency Analysis:`);
    console.log(`   Original estimate: ${estimatedOriginal} tokens`);
    console.log(`   Current dynamic: ${result.tokenCount} tokens`);
    console.log(`   Reduction achieved: ${reductionPercentage.toFixed(1)}%`);
    console.log(
      `   Target (60%+): ${reductionPercentage >= 60 ? '✅ MET' : '❌ NOT MET'}`,
    );

    // Test prompt quality
    console.log(`\n🔍 Prompt Quality Check:`);
    const hasIdentity = result.prompt.includes(
      'You are an interactive CLI agent',
    );
    const hasSecurity =
      result.prompt.includes('security') || result.prompt.includes('safety');
    const hasToolGuidance =
      result.prompt.includes('tool') || result.prompt.includes('function');

    console.log(`   Identity present: ${hasIdentity ? '✅' : '❌'}`);
    console.log(`   Security policies: ${hasSecurity ? '✅' : '❌'}`);
    console.log(`   Tool guidance: ${hasToolGuidance ? '✅' : '❌'}`);

    // Test performance metrics
    console.log(`\n⚡ Performance Metrics:`);
    console.log(`   Assembly time: ${result.assemblyTime}ms (target: <100ms)`);
    console.log(
      `   Assembly speed: ${result.assemblyTime < 100 ? '✅ MET' : '❌ NOT MET'}`,
    );

    const assemblySuccessful =
      result.prompt.length > 0 && result.tokenCount > 0;
    console.log(`   Assembly successful: ${assemblySuccessful ? '✅' : '❌'}`);

    // Test edge cases
    const emptyContext = {};
    const emptyResult = await assembler.assemblePrompt(emptyContext);
    console.log(
      `   Empty context handling: ${emptyResult.prompt.length > 0 ? '✅' : '❌'}`,
    );

    console.log('\n🎯 Integration test completed successfully!');

    // Return summary for further processing
    return {
      success: true,
      tokenReduction: reductionPercentage,
      assemblyTime: result.assemblyTime,
      modulesLoaded: result.includedModules.length,
      promptGenerated: result.prompt.length > 0,
      warnings: result.warnings.length,
    };
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error(error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run if called directly
if (require.main === module) {
  testIntegration();
}

export { testIntegration };
