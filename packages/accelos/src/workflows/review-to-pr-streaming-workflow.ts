/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { execSync } from "child_process";
import { claudeCodeTool } from "../tools/claude-code.js";
import { reviewLoaderTool } from "../tools/review-loader.js";
import { githubTools } from "../mcp/github-mcp-client.js";

/**
 * Streaming workflow that demonstrates real-time progress from Claude Code operations
 */

const reviewToPRStreamingInputSchema = z.object({
  reviewAssessmentId: z.string().describe("ID of the review assessment to process"),
  dryRun: z.boolean().default(true).describe("Whether to run in dry-run mode (no actual changes)"),
  autoCommit: z.boolean().default(false).describe("Whether to automatically commit changes"),
  createPR: z.boolean().default(false).describe("Whether to create a pull request"),
});

const reviewToPRStreamingOutputSchema = z.object({
  success: z.boolean().describe("Whether the workflow completed successfully"),
  reviewAssessmentId: z.string().describe("ID of the processed review assessment"),
  summary: z.object({
    phase: z.string().describe("Final phase reached"),
    claudeCodeExecutions: z.number().describe("Number of Claude Code executions"),
    totalExecutionTime: z.number().describe("Total execution time in milliseconds"),
    streamingEventsEmitted: z.number().describe("Total streaming events emitted"),
  }),
  errors: z.array(z.string()).optional().describe("Any errors that occurred"),
});

// Step 1: Load and analyze the review assessment
const loadReviewStep = createStep({
  id: "load-review",
  inputSchema: reviewToPRStreamingInputSchema,
  outputSchema: z.object({
    reviewAssessmentId: z.string(),
    dryRun: z.boolean(),
    autoCommit: z.boolean(),
    createPR: z.boolean(),
    reviewData: z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
      findings: z.array(z.object({
        category: z.string(),
        issue: z.string(),
        severity: z.string(),
        recommendation: z.string(),
        resolved: z.boolean(),
      })).optional(),
      recommendations: z.array(z.string()).optional(),
    }),
    success: z.boolean(),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    console.log("🔍 DEBUG loadReviewStep inputData:", JSON.stringify(inputData, null, 2));
    
    const { reviewAssessmentId, dryRun, autoCommit, createPR } = inputData;
    
    console.log(`🔄 [${new Date().toLocaleTimeString()}] Loading review assessment data for ${reviewAssessmentId}`);

    try {
      let reviewData;

      // Check if this is a test/demo review ID
      if (reviewAssessmentId.startsWith('sse-streaming-test-')) {
        console.log(`🎭 [${new Date().toLocaleTimeString()}] Creating mock review data for SSE demo`);
        
        // Create comprehensive mock review data for streaming demo
        reviewData = {
          id: reviewAssessmentId,
          type: "security-performance-review",
          score: 72,
          issues: [
            "SQL injection vulnerability in user authentication",
            "Inefficient database queries in dashboard",
            "Missing input validation in API endpoints",
            "Memory leak in background processing"
          ],
          findings: [
            {
              category: "security",
              issue: "SQL injection vulnerability in user authentication",
              severity: "high",
              recommendation: "Use parameterized queries and input validation",
              resolved: false
            },
            {
              category: "performance", 
              issue: "Inefficient database queries causing slow dashboard load",
              severity: "medium",
              recommendation: "Add database indexing and query optimization",
              resolved: false
            },
            {
              category: "security",
              issue: "Missing CSRF protection on API endpoints",
              severity: "medium", 
              recommendation: "Implement CSRF tokens for all state-changing operations",
              resolved: false
            },
            {
              category: "performance",
              issue: "Memory leak in background event processing",
              severity: "high",
              recommendation: "Fix event listener cleanup and implement proper garbage collection",
              resolved: false
            },
            {
              category: "testing",
              issue: "Insufficient test coverage for authentication flows",
              severity: "low",
              recommendation: "Add comprehensive unit and integration tests",
              resolved: false
            }
          ],
          recommendations: [
            "Implement comprehensive input validation across all endpoints",
            "Add security headers and CSRF protection",
            "Optimize database queries with proper indexing",
            "Fix memory management in background processes",
            "Increase test coverage to 85%+"
          ]
        };

        console.log(`✅ [${new Date().toLocaleTimeString()}] Mock review created: ${reviewData.type} (Score: ${reviewData.score}/100) with ${reviewData.findings.length} findings`);
      } else {
        // Use real review loader tool for production reviews
        const reviewResult = await reviewLoaderTool.execute({
          context: {
            type: undefined, // Load any type
            severity: undefined, // Load any severity 
            page: 1,
            pageSize: 100,
            includeContent: true,
            sortBy: 'createdAt' as const,
            sortOrder: 'desc' as const,
          },
          runtimeContext: runtimeContext!,
        });

        if (!reviewResult.success || !reviewResult.reviews) {
          throw new Error(`Failed to load reviews: ${reviewResult.message}`);
        }

        // Find the specific review by ID
        const review = reviewResult.reviews.find(r => r.id === reviewAssessmentId);
        if (!review) {
          throw new Error(`Review ${reviewAssessmentId} not found`);
        }

        // Extract data from actual review structure
        reviewData = {
          id: review.id,
          type: review.type,
          score: review.assessment?.score || 0,
          issues: review.assessment?.findings?.map(f => f.issue) || [],
          findings: review.assessment?.findings || [],
          recommendations: review.assessment?.recommendations || [],
        };

        console.log(`✅ [${new Date().toLocaleTimeString()}] Loaded review: ${reviewData.type} (Score: ${reviewData.score}/100) with ${reviewData.issues.length} issues`);
      }

      return {
        reviewAssessmentId,
        dryRun,
        autoCommit,
        createPR,
        reviewData,
        success: true,
      };
    } catch (error) {
      console.error(`❌ [${new Date().toLocaleTimeString()}] Failed to load review:`, error);
      return {
        reviewAssessmentId,
        dryRun,
        autoCommit,
        createPR,
        reviewData: {
          id: reviewAssessmentId,
          type: "unknown",
          score: 0,
          issues: [],
          findings: [],
          recommendations: [],
        },
        success: false,
      };
    }
  },
});

// Step 2: Use Claude Code to analyze and create fixes
const claudeCodeAnalysisStep = createStep({
  id: "claude-code-analysis",
  inputSchema: z.object({
    reviewAssessmentId: z.string(),
    dryRun: z.boolean(),
    autoCommit: z.boolean(),
    createPR: z.boolean(),
    reviewData: z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
      findings: z.array(z.object({
        category: z.string(),
        issue: z.string(),
        severity: z.string(),
        recommendation: z.string(),
        resolved: z.boolean(),
      })).optional(),
      recommendations: z.array(z.string()).optional(),
    }),
    success: z.boolean(),
  }),
  outputSchema: z.object({
    reviewAssessmentId: z.string(),
    dryRun: z.boolean(),
    autoCommit: z.boolean(),
    createPR: z.boolean(),
    reviewData: z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
      findings: z.array(z.object({
        category: z.string(),
        issue: z.string(),
        severity: z.string(),
        recommendation: z.string(),
        resolved: z.boolean(),
      })).optional(),
      recommendations: z.array(z.string()).optional(),
    }),
    analysisResult: z.string(),
    fixesProposed: z.array(z.string()),
    executionTime: z.number(),
    success: z.boolean(),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { reviewData, dryRun, reviewAssessmentId, autoCommit, createPR } = inputData;
    
    console.log(`🚀 [${new Date().toLocaleTimeString()}] Starting Claude Code analysis of review findings for ${reviewData.id}`);

    const startTime = Date.now();

    // Process all findings together with single Claude Code execution
    const findings = reviewData.findings || [];
    console.log(`🔍 [${new Date().toLocaleTimeString()}] Processing ${findings.length} findings`);
    
    let allFixesProposed: string[] = [];
    let combinedAnalysisResult = "";

    if (findings.length > 0) {
      const generalPrompt = generateGeneralPrompt(findings, reviewData, dryRun);
      
      try {
        // Use real Claude Code SDK tool
        const claudeResult = await claudeCodeTool.execute({
          context: {
            prompt: generalPrompt,
            options: {
              mode: "streaming",
              cwd: process.env.REPOSITORY_PATH,
              customSystemPrompt: `You are a seasoned staff engineer. Work efficiently and concisely. Implement fixes without lengthy explanations.`,
              maxTurns: 200,
              permissionMode: dryRun ? "plan" : "acceptEdits",
              allowedTools: ["read", "write", "edit", "grep", "bash"],
              debug: false,
            },
          },
          runtimeContext,
        });

        combinedAnalysisResult = claudeResult?.result || "No result from Claude Code";
        
        // Extract fixes from findings
        allFixesProposed = findings.map((f: any) => f.recommendation);
        
        console.log(`✅ [${new Date().toLocaleTimeString()}] Completed analysis (${claudeResult?.metadata?.turnsUsed || 0} turns)`);
        
      } catch (error) {
        console.error(`❌ [${new Date().toLocaleTimeString()}] Analysis failed:`, error);
        combinedAnalysisResult = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    const executionTime = Date.now() - startTime;

    console.log(`✅ [${new Date().toLocaleTimeString()}] Claude Code analysis completed in ${executionTime}ms (${allFixesProposed.length} fixes proposed)`);

    return {
      reviewAssessmentId,
      dryRun,
      autoCommit,
      createPR,
      reviewData,
      analysisResult: combinedAnalysisResult || "No analysis results",
      fixesProposed: allFixesProposed,
      executionTime,
      success: allFixesProposed.length > 0,
    };
  },
});

// Step 3: Finalize and report
const finalizeStep = createStep({
  id: "finalize",
  inputSchema: z.object({
    reviewAssessmentId: z.string(),
    dryRun: z.boolean(),
    autoCommit: z.boolean(),
    createPR: z.boolean(),
    reviewData: z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      issues: z.array(z.string()),
      findings: z.array(z.object({
        category: z.string(),
        issue: z.string(),
        severity: z.string(),
        recommendation: z.string(),
        resolved: z.boolean(),
      })).optional(),
      recommendations: z.array(z.string()).optional(),
    }),
    analysisResult: z.string(),
    fixesProposed: z.array(z.string()),
    executionTime: z.number(),
    success: z.boolean(),
  }),
  outputSchema: reviewToPRStreamingOutputSchema,
  execute: async ({ inputData, runtimeContext }) => {
    const { reviewData, fixesProposed, executionTime, dryRun, autoCommit, createPR, reviewAssessmentId } = inputData;
    
    console.log(`🏁 [${new Date().toLocaleTimeString()}] Finalizing workflow results for review ${reviewData.id}`);

    let branchName: string | undefined;
    let prUrl: string | undefined;
    let errors: string[] = [];

    if (!dryRun && fixesProposed.length > 0) {
      branchName = `fix/review-${reviewData.id}-${Date.now()}`;
      const workingDir = process.env.REPOSITORY_PATH || process.cwd();
      console.log(`🌱 [${new Date().toLocaleTimeString()}] Creating branch: ${branchName} in ${workingDir}`);
      
      try {
        // Create git branch locally in the same directory where Claude Code ran
        execSync(`git checkout -b ${branchName}`, { 
          stdio: 'inherit',
          cwd: workingDir 
        });
        console.log(`✅ [${new Date().toLocaleTimeString()}] Git branch created successfully`);
        
        if (autoCommit) {
          // Check if there are any changes to commit
          const statusResult = execSync('git status --porcelain', { 
            encoding: 'utf8',
            stdio: 'pipe',
            cwd: workingDir 
          }).trim();

          if (!statusResult) {
            console.warn(`⚠️ [${new Date().toLocaleTimeString()}] No changes detected - Claude Code may not have made any modifications`);
            errors.push('No changes to commit - Claude Code did not make any file modifications');
          } else {
            console.log(`📝 [${new Date().toLocaleTimeString()}] Changes detected, staging files...`);
            
            // Stage only modified/new files (ignoring .gitignore entries)
            try {
              // Add only tracked files that were modified
              execSync('git add -u', { 
                stdio: 'pipe',
                cwd: workingDir 
              });
              // Add any new files that aren't ignored
              execSync('git add . --ignore-errors', { 
                stdio: 'pipe',
                cwd: workingDir 
              });
            } catch (addError) {
              console.warn(`Staging attempt failed, trying alternative approach: ${addError instanceof Error ? addError.message : String(addError)}`);
              // If that fails, try a more conservative approach - just add modified tracked files
              execSync('git add -u', { 
                stdio: 'pipe',
                cwd: workingDir 
              });
            }
            
            const fixList = fixesProposed.slice(0, 5).map(fix => `- ${fix}`).join('\n');
            const additionalFixes = fixesProposed.length > 5 ? `\n... and ${fixesProposed.length - 5} more fixes` : '';
            const commitMessage = `Fix issues from production review ${reviewData.id}

Addresses:
${fixList}${additionalFixes}`;
            
            execSync(`git commit -m "${commitMessage}"`, { 
              stdio: 'inherit',
              cwd: workingDir 
            });
            
            // Push branch to remote
            execSync(`git push -u origin ${branchName}`, { 
              stdio: 'inherit',
              cwd: workingDir 
            });
            console.log(`💾 [${new Date().toLocaleTimeString()}] Changes committed and pushed`);
            
            if (createPR) {
              try {
                // Try GitHub CLI first as it's more reliable
                console.log(`🔄 [${new Date().toLocaleTimeString()}] Creating pull request using GitHub CLI...`);
                prUrl = (await createPRWithGitHubCLI(branchName!, reviewData, fixesProposed, workingDir)) || undefined;
                
                if (prUrl) {
                  console.log(`✅ [${new Date().toLocaleTimeString()}] Pull request created: ${prUrl}`);
                } else {
                  errors.push('Failed to create PR with GitHub CLI');
                }
              } catch (prError) {
                const errorMsg = `Failed to create PR: ${prError instanceof Error ? prError.message : String(prError)}`;
                console.error(`❌ [${new Date().toLocaleTimeString()}] ${errorMsg}`);
                errors.push(errorMsg);
              }
            }
          }
        }
      } catch (gitError) {
        const errorMsg = gitError instanceof Error ? gitError.message : String(gitError);
        const detailedMsg = `Git operations failed: ${errorMsg}. Ensure git is configured and repository has proper permissions.`;
        console.error(`❌ [${new Date().toLocaleTimeString()}] ${detailedMsg}`);
        errors.push(detailedMsg);
      }
    }

    const success = errors.length === 0 && (dryRun || fixesProposed.length > 0);
    console.log(`${success ? '✅' : '❌'} [${new Date().toLocaleTimeString()}] Workflow ${success ? 'completed successfully' : 'completed with errors'}! Review: ${reviewData.type}, Score: ${reviewData.score}/100, Fixes: ${fixesProposed.length}, Branch: ${branchName || 'N/A'}, PR: ${prUrl || 'N/A'}`);

    return {
      success,
      reviewAssessmentId,
      summary: {
        phase: "complete",
        claudeCodeExecutions: (reviewData.findings?.length || 0) > 0 ? Math.ceil((reviewData.findings?.length || 0) / 3) : 1,
        totalExecutionTime: executionTime,
        streamingEventsEmitted: 0,
      },
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});

// Create the streaming workflow using Mastra's workflow syntax
export const reviewToPRStreamingWorkflow = createWorkflow({
  id: "review-to-pr-streaming-workflow",
  description: "Streaming workflow that demonstrates real-time progress from Claude Code operations",
  inputSchema: reviewToPRStreamingInputSchema,
  outputSchema: reviewToPRStreamingOutputSchema,
})
.then(loadReviewStep)
.then(claudeCodeAnalysisStep)
.then(finalizeStep)
.commit();

// Helper function to create PR using GitHub CLI as fallback
async function createPRWithGitHubCLI(
  branchName: string,
  reviewData: any,
  fixesProposed: string[],
  workingDir: string
): Promise<string | null> {
  try {
    const prTitle = `Fix issues from production review ${reviewData.id}`;
    const fixList = fixesProposed.slice(0, 5).map(fix => `- ${fix}`).join('\\n');
    const additionalFixes = fixesProposed.length > 5 ? `\\n... and ${fixesProposed.length - 5} more fixes` : '';
    
    const prBody = `## Summary
This PR addresses ${fixesProposed.length} issues identified in production review ${reviewData.id}:

${fixList}${additionalFixes}

## Review Details
- **Review Type**: ${reviewData.type}
- **Original Score**: ${reviewData.score}/100
- **Findings**: ${reviewData.findings?.length || 0} issues

## Changes Made
Automated fixes applied by Claude Code based on review recommendations.

🤖 Generated with Claude Code via Mastra workflow`;

    // Create PR using gh CLI
    const prResult = execSync(
      `gh pr create --title "${prTitle}" --body "${prBody.replace(/"/g, '\\"')}" --head "${branchName}" --base "main"`,
      {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: workingDir
      }
    ).trim();

    // Extract PR URL from gh CLI output
    const prUrlRegex = /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;
    const prUrlMatch = prUrlRegex.exec(prResult);
    return prUrlMatch ? prUrlMatch[0] : null;

  } catch (error) {
    console.error(`GitHub CLI error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}


// Helper function to generate streamlined general prompt
function generateGeneralPrompt(
  findings: any[], 
  reviewData: any, 
  dryRun: boolean
): string {
  const baseContext = `Review: ${reviewData.id} (${reviewData.type}) - Score: ${reviewData.score}/100\n\n`;
  const findingsText = findings.map((f, i) => 
    `${i + 1}. [${f.severity?.toUpperCase() || 'MEDIUM'}] ${f.issue}\n   Fix: ${f.recommendation}`
  ).join('\n');

  const actionText = dryRun 
    ? "ANALYZE and provide recommendations only - do not modify files." 
    : "IMPLEMENT all fixes efficiently.";

  return `${baseContext}Issues to address:\n${findingsText}\n\nTASK: ${actionText} Work directly and concisely.`;
}