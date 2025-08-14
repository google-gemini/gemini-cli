/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mastra } from '../mastra/index.js';

/**
 * Example demonstrating how to use the Code Review Workflow
 * This script shows various use cases for the automated code review system
 */

// Sample JavaScript code with intentional issues for demonstration
const sampleJavaScriptCode = `
function getUserData(userId) {
    // SQL injection vulnerability
    const query = "SELECT * FROM users WHERE id = " + userId;
    
    // Performance issue - synchronous operation
    let result = executeQuery(query);
    
    // Memory leak potential
    const cache = {};
    for (let i = 0; i < 10000; i++) {
        cache[i] = "some data " + i;
    }
    
    // Security issue - no input validation
    return result[0];
}

// Missing error handling
function processUser(userData) {
    return userData.name.toUpperCase();
}

// Inefficient algorithm - O(n²) complexity
function findDuplicates(arr) {
    const duplicates = [];
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            if (arr[i] === arr[j] && duplicates.indexOf(arr[i]) === -1) {
                duplicates.push(arr[i]);
            }
        }
    }
    return duplicates;
}
`;

const samplePythonCode = `
import sqlite3

def get_user_data(user_id):
    # SQL injection vulnerability
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    query = f"SELECT * FROM users WHERE id = {user_id}"
    cursor.execute(query)
    result = cursor.fetchall()
    
    # Resource not properly closed
    return result[0] if result else None

def process_data(data_list):
    # Inefficient list operations
    result = []
    for item in data_list:
        # O(n) operation in loop = O(n²)
        if item not in result:
            result.append(item)
    return result

class UserManager:
    def __init__(self):
        # Potential memory issue
        self.cache = {}
    
    def add_user(self, user_data):
        # No input validation
        self.cache[len(self.cache)] = user_data
        return True
`;

/**
 * Run a basic code review workflow
 */
async function runBasicCodeReview() {
  console.log("🔍 Running basic code review workflow...");
  
  try {
    const workflow = mastra.getWorkflow('code-review-workflow');
    const run = await workflow.createRunAsync();

    const result = await run.start({
      inputData: {
        codeContent: sampleJavaScriptCode,
        filePath: 'src/user-service.js',
        language: 'javascript',
        reviewType: 'full',
        includeDocumentation: true,
      },
    });

    if (result.status === 'success') {
      console.log("✅ Code review completed successfully!");
      console.log("\n📊 Summary:");
      console.log(`Overall Score: ${result.result.summary.overallScore}/10`);
      console.log(`Issues Found: ${result.result.summary.issuesFound}`);
      console.log(`Recommendations: ${result.result.summary.recommendations}`);
      console.log(`Language: ${result.result.summary.language}`);

      console.log("\n🔒 Security Findings:");
      result.result.analysis.securityFindings.forEach((finding, index) => {
        console.log(`${index + 1}. [${finding.severity.toUpperCase()}] ${finding.issue}`);
        console.log(`   Recommendation: ${finding.recommendation}`);
      });

      console.log("\n⚡ Performance Issues:");
      result.result.analysis.performanceIssues.forEach((issue, index) => {
        console.log(`${index + 1}. [${issue.impact.toUpperCase()}] ${issue.description}`);
        console.log(`   Suggestion: ${issue.suggestion}`);
      });

      console.log("\n💡 Top Recommendations:");
      result.result.recommendations
        .filter(rec => rec.priority === 'high')
        .slice(0, 3)
        .forEach((rec, index) => {
          console.log(`${index + 1}. [${rec.category}] ${rec.description}`);
        });

      if (result.result.documentation?.generatedDocs) {
        console.log("\n📖 Documentation Generated:");
        console.log(result.result.documentation.generatedDocs.substring(0, 200) + "...");
      }

    } else if (result.status === 'failed') {
      console.error("❌ Workflow failed:", result.error);
    } else if (result.status === 'suspended') {
      console.log("⏸️ Workflow suspended at steps:", result.suspended);
    }

  } catch (error) {
    console.error("💥 Error running workflow:", error);
  }
}

/**
 * Run security-focused code review
 */
async function runSecurityFocusedReview() {
  console.log("\n🛡️ Running security-focused code review...");
  
  try {
    const workflow = mastra.getWorkflow('code-review-workflow');
    const run = await workflow.createRunAsync();

    const result = await run.start({
      inputData: {
        codeContent: samplePythonCode,
        filePath: 'src/user_manager.py',
        language: 'python',
        reviewType: 'security',
        includeDocumentation: false,
      },
    });

    if (result.status === 'success') {
      console.log("✅ Security review completed!");
      
      const criticalIssues = result.result.analysis.securityFindings.filter(
        finding => finding.severity === 'critical' || finding.severity === 'high'
      );
      
      console.log(`\n🚨 Critical/High Security Issues (${criticalIssues.length}):`);
      criticalIssues.forEach((issue, index) => {
        console.log(`${index + 1}. [${issue.severity.toUpperCase()}] ${issue.issue}`);
        console.log(`   Fix: ${issue.recommendation}`);
      });

      const securityScore = result.result.analysis.securityFindings.length > 0 
        ? 10 - (criticalIssues.length * 3)
        : 10;
      console.log(`\n🔐 Security Score: ${Math.max(0, securityScore)}/10`);
    }

  } catch (error) {
    console.error("💥 Error running security review:", error);
  }
}

/**
 * Run performance-focused code review
 */
async function runPerformanceReview() {
  console.log("\n⚡ Running performance-focused code review...");
  
  try {
    const workflow = mastra.getWorkflow('code-review-workflow');
    const run = await workflow.createRunAsync();

    const result = await run.start({
      inputData: {
        codeContent: sampleJavaScriptCode,
        filePath: 'src/algorithms.js',
        language: 'javascript',
        reviewType: 'performance',
        includeDocumentation: false,
      },
    });

    if (result.status === 'success') {
      console.log("✅ Performance review completed!");
      
      const highImpactIssues = result.result.analysis.performanceIssues.filter(
        issue => issue.impact === 'high'
      );
      
      console.log(`\n🐌 High Impact Performance Issues (${highImpactIssues.length}):`);
      highImpactIssues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue.type}: ${issue.description}`);
        console.log(`   Optimization: ${issue.suggestion}`);
      });

      console.log(`\n📈 Performance Score: ${result.result.summary.overallScore}/10`);
    }

  } catch (error) {
    console.error("💥 Error running performance review:", error);
  }
}

/**
 * Demonstrate workflow streaming
 */
async function demonstrateWorkflowStreaming() {
  console.log("\n🔄 Demonstrating workflow streaming...");
  
  try {
    const workflow = mastra.getWorkflow('code-review-workflow');
    const run = await workflow.createRunAsync();

    console.log("Starting stream...");
    const streamResult = await run.stream({
      inputData: {
        codeContent: sampleJavaScriptCode,
        filePath: 'src/streaming-example.js',
        language: 'javascript',
        reviewType: 'full',
        includeDocumentation: true,
      },
    });

    console.log("📡 Streaming workflow progress:");
    for await (const chunk of streamResult.stream) {
      console.log(`📡 Received chunk: ${chunk.type}`);
      // Handle different chunk types based on actual Mastra streaming format
      if (chunk.type.includes('step')) {
        console.log(`🔄 Step event: ${chunk.type}`);
      } else if (chunk.type.includes('complete')) {
        console.log("🎉 Workflow completed!");
      }
    }

  } catch (error) {
    console.error("💥 Error streaming workflow:", error);
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log("🚀 Code Review Workflow Examples");
  console.log("================================");

  // Ensure ANTHROPIC_API_KEY is set
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY environment variable is required");
    console.log("Please set it to your Anthropic API key:");
    console.log("export ANTHROPIC_API_KEY='your-api-key-here'");
    process.exit(1);
  }

  try {
    // Run different types of code reviews
    await runBasicCodeReview();
    await runSecurityFocusedReview();
    await runPerformanceReview();
    
    // Uncomment to test streaming (requires more setup)
    // await demonstrateWorkflowStreaming();

    console.log("\n🎉 All workflow examples completed successfully!");
    console.log("\n💡 Tips:");
    console.log("- Use reviewType: 'security' for security-only reviews");
    console.log("- Use reviewType: 'performance' for performance-only reviews");
    console.log("- Set includeDocumentation: false to skip documentation generation");
    console.log("- The workflow can handle multiple programming languages");
    console.log("- Results include actionable recommendations with priorities");

  } catch (error) {
    console.error("💥 Unexpected error:", error);
    process.exit(1);
  }
}

// Run the examples
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  runBasicCodeReview,
  runSecurityFocusedReview,
  runPerformanceReview,
  demonstrateWorkflowStreaming,
};