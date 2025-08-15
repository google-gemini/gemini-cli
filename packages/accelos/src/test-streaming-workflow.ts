/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mastra } from './mastra/index.js';

/**
 * Enhanced test script to verify streaming works with detailed Claude Code logs
 */

async function testStreaming() {
  console.log("🚀 Testing Streaming Workflow with Claude Code Logs\n");
  
  // Set required environment variables
  process.env.REPOSITORY_PATH = process.env.REPOSITORY_PATH || '/tmp/test-repo';
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';
  
  try {
    console.log("📋 Environment:");
    console.log(`  Repository: ${process.env.REPOSITORY_PATH}`);
    console.log(`  API Key: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log();

    // Get the streaming workflow
    const workflow = mastra.getWorkflow('review-to-pr-streaming-workflow');
    if (!workflow) {
      console.error("❌ Streaming workflow not found!");
      console.log("Available workflows:", Object.keys(mastra.getWorkflows?.() || {}));
      return;
    }

    console.log("✅ Found streaming workflow");
    
    // Create a run
    const run = await workflow.createRunAsync();
    console.log("✅ Created workflow run");

    // Start streaming - this is where you'll see real-time progress
    console.log("\n📡 Starting streaming workflow...");
    console.log("=".repeat(70));

    const stream = await run.streamVNext({
      inputData: {
        reviewAssessmentId: 'test-streaming-review-123',
        dryRun: true, // Safe mode - no actual changes
        autoCommit: false,
        createPR: false
      }
    });

    let eventCount = 0;
    let lastPhase = '';
    let claudeCodeEvents = 0;

    // Process streaming events in real-time with detailed logging
    for await (const chunk of stream) {
      eventCount++;
      
      const timestamp = new Date().toLocaleTimeString();
      
      switch (chunk.type) {
        case 'workflow-phase':
          const phase = chunk.payload.phase?.toUpperCase() || 'UNKNOWN';
          if (phase !== lastPhase) {
            console.log(`\n🔄 [${timestamp}] WORKFLOW PHASE: ${phase}`);
            lastPhase = phase;
          }
          console.log(`   📝 ${chunk.payload.message}`);
          
          // Show additional details for some phases
          if (chunk.payload.reviewType) {
            console.log(`   📊 Review: ${chunk.payload.reviewType} (Score: ${chunk.payload.score}/100)`);
          }
          if (chunk.payload.branchName) {
            console.log(`   🌿 Branch: ${chunk.payload.branchName}`);
          }
          if (chunk.payload.executionTime) {
            console.log(`   ⏱️  Execution Time: ${chunk.payload.executionTime}ms`);
          }
          if (chunk.payload.turnsUsed) {
            console.log(`   🔄 Turns Used: ${chunk.payload.turnsUsed}`);
          }
          if (chunk.payload.toolsCalled?.length > 0) {
            console.log(`   🔧 Tools Called: ${chunk.payload.toolsCalled.join(', ')}`);
          }
          break;
          
        case 'claude-code-progress':
          claudeCodeEvents++;
          const claudeEvent = chunk.payload.type || 'processing';
          const claudeTimestamp = new Date(chunk.payload.timestamp || Date.now()).toLocaleTimeString();
          
          // Show detailed Claude Code progress with proper formatting
          switch (chunk.payload.type) {
            case 'starting':
              console.log(`\n🚀 [${claudeTimestamp}] CLAUDE CODE: Starting execution`);
              if (chunk.payload.prompt) {
                const promptPreview = chunk.payload.prompt.substring(0, 100);
                console.log(`   📝 Prompt: ${promptPreview}${chunk.payload.prompt.length > 100 ? '...' : ''}`);
              }
              break;
            case 'thinking':
              console.log(`   🤔 [${claudeTimestamp}] ${chunk.payload.message}`);
              break;
            case 'tool_use':
              console.log(`   🔧 [${claudeTimestamp}] Using tool: ${chunk.payload.toolName}`);
              if (chunk.payload.toolInput) {
                const inputStr = JSON.stringify(chunk.payload.toolInput, null, 2);
                console.log(`       Input: ${inputStr.substring(0, 150)}${inputStr.length > 150 ? '...' : ''}`);
              }
              break;
            case 'tool_result':
              const status = chunk.payload.success ? '✅' : '❌';
              console.log(`   ${status} [${claudeTimestamp}] Tool '${chunk.payload.toolName}' ${chunk.payload.success ? 'completed' : 'failed'}`);
              if (chunk.payload.result) {
                const resultStr = typeof chunk.payload.result === 'string' ? chunk.payload.result : JSON.stringify(chunk.payload.result);
                console.log(`       Result: ${resultStr.substring(0, 200)}${resultStr.length > 200 ? '...' : ''}`);
              }
              if (chunk.payload.error) {
                console.log(`       Error: ${chunk.payload.error}`);
              }
              break;
            case 'response':
              console.log(`   💬 [${claudeTimestamp}] Claude: ${chunk.payload.message.substring(0, 150)}${chunk.payload.message.length > 150 ? '...' : ''}`);
              break;
            case 'turn_complete':
              console.log(`   🔄 [${claudeTimestamp}] Turn ${chunk.payload.turnNumber} completed`);
              break;
            case 'session_complete':
              console.log(`   ✅ [${claudeTimestamp}] Session complete (${chunk.payload.turnsUsed} turns)`);
              break;
            case 'error':
              console.log(`   ❌ [${claudeTimestamp}] Error: ${chunk.payload.error}`);
              break;
            default:
              console.log(`   ℹ️  [${claudeTimestamp}] ${claudeEvent}: ${chunk.payload.message || 'Event received'}`);
          }
          break;
          
        case 'workflow-complete':
          console.log(`\n✅ [${timestamp}] WORKFLOW COMPLETED`);
          if (chunk.payload.executionTime) {
            console.log(`   ⏱️  Total time: ${chunk.payload.executionTime}ms`);
          }
          if (chunk.payload.streamingEventsEmitted) {
            console.log(`   📊 Events emitted: ${chunk.payload.streamingEventsEmitted}`);
          }
          break;
          
        case 'workflow-error':
          console.log(`\n❌ [${timestamp}] WORKFLOW ERROR: ${chunk.payload.error}`);
          break;
          
        default:
          console.log(`   ℹ️  ${chunk.type}: ${chunk.payload.message || 'Event received'}`);
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("📊 STREAMING SUMMARY:");
    console.log(`  • Total streaming events: ${eventCount}`);
    console.log(`  • Claude Code events: ${claudeCodeEvents}`);

    // Get final results
    const result = await stream.result;
    const status = await stream.status;
    const usage = await stream.usage;

    console.log(`  • Final status: ${status}`);
    console.log(`  • Workflow success: ${result?.success ? '✅' : '❌'}`);
    
    // Handle different result structures
    if (result?.summary) {
      console.log(`  • Execution time: ${result.summary.totalExecutionTime || 'N/A'}ms`);
      console.log(`  • Events emitted by workflow: ${result.summary.streamingEventsEmitted || 'N/A'}`);
    } else {
      console.log(`  • Execution time: N/A (no summary available)`);
      console.log(`  • Events emitted by workflow: N/A (no summary available)`);
    }
    
    console.log(`  • Token usage: ${usage?.totalTokens || 0} tokens`);

    // Debug: Show the actual result structure
    console.log("\n🔍 DEBUG - Result structure:");
    console.log("Keys in result:", Object.keys(result || {}));
    if (result?.summary) {
      console.log("Keys in summary:", Object.keys(result.summary));
    }

    if (result?.success) {
      console.log("\n🎉 Streaming test completed successfully!");
      console.log("✅ Real-time progress events were received and displayed");
      
      if (eventCount > 0) {
        console.log(`✅ Received ${eventCount} streaming events in real-time`);
        if (claudeCodeEvents > 0) {
          console.log(`✅ Received ${claudeCodeEvents} Claude Code progress events`);
          console.log("✅ This confirms Claude Code streaming is working!");
        }
        console.log("✅ This confirms the streaming implementation is working!");
      } else {
        console.log("⚠️  No streaming events received - streaming may not be working");
      }
    } else {
      console.log("\n⚠️  Workflow completed but with issues:");
      if (result?.errors?.length) {
        result.errors.forEach(error => console.log(`  • ${error}`));
      } else {
        console.log("  • No specific errors provided in result");
        console.log("  • This might be due to missing environment variables or test data");
      }
      
      // Still check if streaming worked
      if (eventCount > 0) {
        console.log("\n✅ However, streaming events were received successfully!");
        if (claudeCodeEvents > 0) {
          console.log(`✅ Received ${claudeCodeEvents} Claude Code progress events`);
        }
        console.log("✅ The streaming implementation is working correctly");
      }
    }

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    
    if (error instanceof Error && error.message.includes('WritableStream')) {
      console.log("🔧 This looks like the WritableStream error we fixed!");
      console.log("   The error should have been handled gracefully.");
    }
  }
}

// Add some colored output helpers
function colorLog(color: string, message: string) {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[color as keyof typeof colors]}${message}${colors.reset}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testStreaming().catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
}