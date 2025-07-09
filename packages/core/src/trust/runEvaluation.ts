#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCallEvaluator } from './functionCallEvaluator.js';
import { TrustContentGenerator } from './trustContentGenerator.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🧪 Starting Trust CLI Function Call Evaluation...\n');
  
  try {
    // Initialize configuration
    const config = new Config({
      sessionId: `eval_${Date.now()}`,
      targetDir: process.cwd(),
      debugMode: false,
      cwd: process.cwd(),
      model: 'trust-model'
    });
    
    // Initialize tool registry
    const toolRegistry = new ToolRegistry(config);
    
    // Initialize content generator
    const contentGenerator = new TrustContentGenerator(
      undefined, // Use default models directory
      config,
      toolRegistry
    );
    
    await contentGenerator.initialize();
    
    // Create evaluator
    const evaluator = new FunctionCallEvaluator(contentGenerator);
    
    // Run evaluation
    const startTime = Date.now();
    const summary = await evaluator.runEvaluation();
    const totalTime = Date.now() - startTime;
    
    // Print results
    evaluator.printReport(summary);
    
    console.log(`\n⏱️  Total evaluation time: ${(totalTime / 1000).toFixed(1)}s`);
    
    // Save results to file
    const resultsPath = path.join(process.cwd(), 'evaluation-results.json');
    const resultsData = {
      timestamp: new Date().toISOString(),
      summary,
      totalTime,
      model: contentGenerator.getCurrentModel()?.name || 'unknown'
    };
    
    fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));
    console.log(`📊 Results saved to: ${resultsPath}`);
    
    // Exit with error code if success rate is below threshold
    const successRate = (summary.successfulCalls / summary.totalPrompts) * 100;
    if (successRate < 70) {
      console.log(`\n❌ SUCCESS RATE BELOW 70% (${successRate.toFixed(1)}%)`);
      process.exit(1);
    } else {
      console.log(`\n✅ SUCCESS RATE ACCEPTABLE (${successRate.toFixed(1)}%)`);
      process.exit(0);
    }
    
  } catch (error) {
    console.error('💥 Evaluation failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as runEvaluation };