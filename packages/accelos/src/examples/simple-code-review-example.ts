/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mastra } from '../mastra/index.js';

/**
 * Example demonstrating the simplified code review workflow
 */

const sampleCode = `
function getUserData(userId) {
    // Potential security issue - SQL injection
    const query = "SELECT * FROM users WHERE id = " + userId;
    
    // Performance issue - synchronous operation
    let result = executeQuery(query);
    
    // Missing error handling
    return result[0];
}

// Inefficient algorithm O(n²)
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

async function runSimpleCodeReview() {
  console.log("🔍 Running simplified code review workflow...");
  
  try {
    const workflow = mastra.getWorkflow('simple-code-review-workflow');
    const run = await workflow.createRunAsync();

    const result = await run.start({
      inputData: {
        codeContent: sampleCode,
        filePath: 'src/user-service.js',
        language: 'javascript',
        reviewType: 'full',
        includeDocumentation: true,
      },
    });

    if (result.status === 'success') {
      console.log("✅ Code review completed successfully!");
      console.log("\n📊 Summary:");
      console.log(`Overall Score: ${result.summary.overallScore}/10`);
      console.log(`Issues Found: ${result.summary.issuesFound}`);
      console.log(`Recommendations: ${result.summary.recommendations}`);
      console.log(`Language: ${result.summary.language}`);

      console.log("\n🔒 Security Findings:");
      result.analysis.securityFindings.forEach((finding, index) => {
        console.log(`${index + 1}. [${finding.severity.toUpperCase()}] ${finding.issue}`);
        console.log(`   Recommendation: ${finding.recommendation}`);
      });

      console.log("\n⚡ Performance Issues:");
      result.analysis.performanceIssues.forEach((issue, index) => {
        console.log(`${index + 1}. [${issue.impact.toUpperCase()}] ${issue.description}`);
        console.log(`   Suggestion: ${issue.suggestion}`);
      });

      console.log("\n💡 Top Recommendations:");
      result.recommendations
        .filter(rec => rec.priority === 'high')
        .slice(0, 3)
        .forEach((rec, index) => {
          console.log(`${index + 1}. [${rec.category}] ${rec.description}`);
        });

      if (result.documentation?.generatedDocs) {
        console.log("\n📖 Documentation Generated:");
        console.log(result.documentation.generatedDocs.substring(0, 200) + "...");
      }

    } else {
      console.error("❌ Workflow failed:", result.error || 'Unknown error');
    }

  } catch (error) {
    console.error("💥 Error running workflow:", error);
  }
}

async function main() {
  console.log("🚀 Simple Code Review Workflow Example");
  console.log("====================================");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY environment variable is required");
    console.log("Please set it to your Anthropic API key:");
    console.log("export ANTHROPIC_API_KEY='your-api-key-here'");
    process.exit(1);
  }

  await runSimpleCodeReview();
  
  console.log("\n🎉 Simple workflow example completed!");
  console.log("\n💡 Benefits of the simplified workflow:");
  console.log("- Single-step execution for faster results");
  console.log("- Comprehensive analysis in one Claude Code call");
  console.log("- Easier to understand and maintain");
  console.log("- Better error handling and type safety");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runSimpleCodeReview };