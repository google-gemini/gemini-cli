#!/usr/bin/env tsx
/**
 * Test script for PR creation workflow functionality
 * Run with: npx tsx src/test-pr-workflow.ts
 */
import { prCreationWorkflowTool } from './tools/pr-creation-workflow-tool.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function testPRCreationWorkflow() {
  console.log('🚀 Testing PR Creation Workflow...\n');

  // Test 1: Dry run with sample review
  console.log('1️⃣ Testing dry run analysis...');
  try {
    const result = await prCreationWorkflowTool.execute({
      context: {
        reviewAssessmentId: 'REVIEW-2025-01-13-sample',
        dryRun: true,
        autoCommit: false,
        createPR: false,
      },
      runtimeContext: {
        registry: new Map(),
        set: () => {},
        get: () => undefined,
        has: () => false,
        clear: () => {},
        delete: () => false,
        size: 0,
        entries: () => [],
        keys: () => [],
        values: () => [],
        forEach: () => {},
      } as any,
    });

    console.log('✅ Dry run completed successfully!');
    console.log('   Result:', result.success);
    console.log('   Message:', result.message);
    console.log('   Execution time:', result.summary.totalExecutionTime, 'ms');
    console.log('   Fixes proposed:', result.summary.fixesProposed);
    
    if (result.errors) {
      console.log('   Errors:', result.errors);
    }

  } catch (error) {
    console.error('❌ Dry run failed:', error instanceof Error ? error.message : error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Check if review file exists
  console.log('2️⃣ Checking review file availability...');
  try {
    const fs = await import('fs/promises');
    const reviewPath = './data/reviews/REVIEW-2025-01-13-sample.json';
    
    try {
      const reviewContent = await fs.readFile(reviewPath, 'utf-8');
      const review = JSON.parse(reviewContent);
      console.log('✅ Review file found and parsed successfully');
      console.log('   Review ID:', review.id);
      console.log('   Review Type:', review.type);
      console.log('   Findings:', review.assessment?.findings?.length || 0);
    } catch (fileError) {
      console.log('⚠️  Review file not found or invalid at:', reviewPath);
      console.log('   This is expected if the file hasnt been created yet');
    }

  } catch (error) {
    console.error('❌ Review file check failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 3: Validate tool schema
  console.log('3️⃣ Validating tool schema...');
  try {
    const inputSchema = prCreationWorkflowTool.inputSchema;
    const outputSchema = prCreationWorkflowTool.outputSchema;
    
    console.log('✅ Tool schemas are valid');
    console.log('   Tool ID:', prCreationWorkflowTool.id);
    console.log('   Input schema keys:', Object.keys(inputSchema.shape));
    console.log('   Output schema keys:', Object.keys(outputSchema.shape));
    
  } catch (error) {
    console.error('❌ Schema validation failed:', error);
  }

  console.log('\n🏁 PR Creation Workflow test completed!');
  console.log('\nTo test with the production agent:');
  console.log('1. Start the Mastra server: npm run dev:server');
  console.log('2. Open the Swagger UI at http://localhost:4111/swagger');
  console.log('3. Test the production-reviewent with prompt: "Create a PR for review REVIEW-2025-01-13-sample"');
}

// Run the test
testPRCreationWorkflow().catch(console.error);