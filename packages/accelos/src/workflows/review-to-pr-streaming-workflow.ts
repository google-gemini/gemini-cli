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
      
      // Debug environment variables
      console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Environment check:`);
      console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Missing'}`);
      console.log(`   REPOSITORY_PATH: ${process.env.REPOSITORY_PATH || '❌ Not set (will use process.cwd())'}`);
      console.log(`   Current working dir: ${process.cwd()}`);
      console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Claude Code execution config:`);
      console.log(`   Mode: streaming`);
      console.log(`   Permission mode: ${dryRun ? "plan" : "acceptEdits"}`);
      console.log(`   Max turns: 200`);
      console.log(`   Working directory: ${process.env.REPOSITORY_PATH || process.cwd()}`);
      console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Generated prompt (first 200 chars):`);
      console.log(`   "${generalPrompt.substring(0, 200)}${generalPrompt.length > 200 ? '...' : ''}"`);
      
      try {
        console.log(`🚀 [${new Date().toLocaleTimeString()}] DEBUG: Starting Claude Code execution...`);
        
        // Use real Claude Code SDK tool
        const claudeResult = await claudeCodeTool.execute({
          context: {
            prompt: generalPrompt,
            options: {
              mode: "streaming",
              cwd: process.env.REPOSITORY_PATH,
              customSystemPrompt: `You are a seasoned staff engineer implementing production fixes. Your job is to:

1. SEARCH the codebase thoroughly using grep/read tools to understand the current implementation
2. IDENTIFY specific files that need changes for each issue  
3. MAKE ACTUAL FILE MODIFICATIONS using write/edit tools - do not just analyze or plan
4. IMPLEMENT concrete fixes that address the root cause of each issue
5. VERIFY your changes by reading the modified files

Work efficiently and make real changes. Do not provide lengthy explanations - focus on finding files and modifying them to fix the issues. Every issue should result in actual file changes unless the fix is purely operational (like monitoring).`,
              maxTurns: 200,
              permissionMode: dryRun ? "plan" : "acceptEdits",
              allowedTools: ["read", "write", "edit", "multiedit", "grep", "glob", "ls", "bash"],
              debug: true, // Enable debug logging
            },
          },
          runtimeContext,
        });

        console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Claude Code raw result:`, JSON.stringify(claudeResult, null, 2));
        
        combinedAnalysisResult = claudeResult?.result || "No result from Claude Code";
        
        // Extract fixes from findings
        allFixesProposed = findings.map((f: any) => f.recommendation);
        
        console.log(`✅ [${new Date().toLocaleTimeString()}] Completed analysis (${claudeResult?.metadata?.turnsUsed || 0} turns)`);
        console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Final analysis result: "${combinedAnalysisResult}"`);
        
      } catch (error) {
        console.error(`❌ [${new Date().toLocaleTimeString()}] Analysis failed:`, error);
        console.error(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
        combinedAnalysisResult = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else {
      console.log(`⚠️ [${new Date().toLocaleTimeString()}] DEBUG: No findings to process - skipping Claude Code execution`);
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
      
      console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Git operations starting:`);
      console.log(`   Working directory: ${workingDir}`);
      console.log(`   Branch name: ${branchName}`);
      console.log(`   Fixes proposed: ${fixesProposed.length}`);
      
      try {
        // Check current git status before making changes
        console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Checking current git status...`);
        const initialStatus = execSync('git status --porcelain', { 
          encoding: 'utf8',
          stdio: 'pipe',
          cwd: workingDir 
        }).trim();
        console.log(`   Initial git status: ${initialStatus || '(clean)'}`);
        
        // Check current branch
        const currentBranch = execSync('git branch --show-current', { 
          encoding: 'utf8',
          stdio: 'pipe',
          cwd: workingDir 
        }).trim();
        console.log(`   Current branch: ${currentBranch}`);
        
        // Create git branch locally in the same directory where Claude Code ran
        console.log(`🌱 [${new Date().toLocaleTimeString()}] DEBUG: Creating git branch...`);
        const branchResult = execSync(`git checkout -b ${branchName}`, { 
          encoding: 'utf8',
          stdio: 'pipe',
          cwd: workingDir 
        });
        console.log(`   Git checkout result: ${branchResult.trim()}`);
        console.log(`✅ [${new Date().toLocaleTimeString()}] Git branch created successfully`);
        
        if (autoCommit) {
          // Check if there are any changes to commit
          console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Checking for changes to commit...`);
          const statusResult = execSync('git status --porcelain', { 
            encoding: 'utf8',
            stdio: 'pipe',
            cwd: workingDir 
          }).trim();
          console.log(`   Changes detected: ${statusResult ? 'YES' : 'NO'}`);
          if (statusResult) {
            console.log(`   Changed files:\n${statusResult.split('\n').map(line => `     ${line}`).join('\n')}`);
          }

          if (!statusResult) {
            console.warn(`⚠️ [${new Date().toLocaleTimeString()}] No changes detected - Claude Code may not have made any modifications`);
            errors.push('No changes to commit - Claude Code did not make any file modifications');
          } else {
            console.log(`📝 [${new Date().toLocaleTimeString()}] Changes detected, staging files...`);
            
            // Stage only modified/new files (ignoring .gitignore entries)
            try {
              console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Staging tracked files (git add -u)...`);
              const addUResult = execSync('git add -u', { 
                encoding: 'utf8',
                stdio: 'pipe',
                cwd: workingDir 
              });
              console.log(`   git add -u result: ${addUResult.trim() || '(no output)'}`);
              
              console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Staging new files (git add . --ignore-errors)...`);
              const addAllResult = execSync('git add . --ignore-errors', { 
                encoding: 'utf8',
                stdio: 'pipe',
                cwd: workingDir 
              });
              console.log(`   git add . result: ${addAllResult.trim() || '(no output)'}`);
            } catch (addError) {
              console.warn(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Staging attempt failed, trying alternative approach:`);
              console.warn(`   Error: ${addError instanceof Error ? addError.message : String(addError)}`);
              
              try {
                // If that fails, try a more conservative approach - just add modified tracked files
                const fallbackResult = execSync('git add -u', { 
                  encoding: 'utf8',
                  stdio: 'pipe',
                  cwd: workingDir 
                });
                console.log(`   Fallback git add -u result: ${fallbackResult.trim() || '(no output)'}`);
              } catch (fallbackError) {
                console.error(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Fallback staging also failed:`);
                console.error(`   Error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
                throw fallbackError;
              }
            }
            
            // Check staged changes before committing
            console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Checking staged changes...`);
            const stagedStatus = execSync('git diff --cached --name-status', { 
              encoding: 'utf8',
              stdio: 'pipe',
              cwd: workingDir 
            }).trim();
            console.log(`   Staged files: ${stagedStatus ? 'YES' : 'NO'}`);
            if (stagedStatus) {
              console.log(`   Staged changes:\n${stagedStatus.split('\n').map(line => `     ${line}`).join('\n')}`);
            }
            
            const fixList = fixesProposed.slice(0, 5).map(fix => `- ${fix}`).join('\n');
            const additionalFixes = fixesProposed.length > 5 ? `\n... and ${fixesProposed.length - 5} more fixes` : '';
            const commitMessage = `Fix issues from production review ${reviewData.id}

Addresses:
${fixList}${additionalFixes}`;
            
            console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Committing changes...`);
            console.log(`   Commit message: ${commitMessage.split('\n')[0]}...`);
            const commitResult = execSync(`git commit -m "${commitMessage}"`, { 
              encoding: 'utf8',
              stdio: 'pipe',
              cwd: workingDir 
            });
            console.log(`   Commit result: ${commitResult.trim()}`);
            
            // Push branch to remote
            console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Pushing branch to remote...`);
            console.log(`   Command: git push -u origin ${branchName}`);
            const pushResult = execSync(`git push -u origin ${branchName}`, { 
              encoding: 'utf8',
              stdio: 'pipe',
              cwd: workingDir 
            });
            console.log(`   Push result: ${pushResult.trim()}`);
            console.log(`💾 [${new Date().toLocaleTimeString()}] Changes committed and pushed`);
            
            if (createPR) {
              try {
                // Add small delay to ensure branch is available on GitHub API
                console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Waiting for branch to be available on GitHub...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
                
                // Verify branch exists on remote
                console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Verifying branch exists on remote...`);
                try {
                  const branchCheck = execSync(`gh api repos/:owner/:repo/branches/${branchName}`, {
                    encoding: 'utf8',
                    stdio: 'pipe',
                    cwd: workingDir
                  });
                  console.log(`   ✅ Branch verification successful`);
                } catch (branchError) {
                  console.warn(`⚠️ [${new Date().toLocaleTimeString()}] DEBUG: Branch verification failed (but continuing):`);
                  console.warn(`   Error: ${branchError instanceof Error ? branchError.message : String(branchError)}`);
                }
                
                // Try GitHub CLI first as it's more reliable
                console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: PR creation starting...`);
                console.log(`   Branch name: ${branchName}`);
                console.log(`   Working directory: ${workingDir}`);
                console.log(`   Fixes count: ${fixesProposed.length}`);
                console.log(`🔄 [${new Date().toLocaleTimeString()}] Creating pull request using GitHub CLI...`);
                
                prUrl = (await createPRWithGitHubCLI(branchName!, reviewData, fixesProposed, workingDir)) || undefined;
                
                console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: PR creation result: ${prUrl ? 'SUCCESS' : 'FAILED'}`);
                if (prUrl) {
                  console.log(`✅ [${new Date().toLocaleTimeString()}] Pull request created: ${prUrl}`);
                } else {
                  console.error(`❌ [${new Date().toLocaleTimeString()}] DEBUG: No PR URL returned from createPRWithGitHubCLI`);
                  errors.push('Failed to create PR with GitHub CLI - no URL returned');
                }
              } catch (prError) {
                const errorMsg = `Failed to create PR: ${prError instanceof Error ? prError.message : String(prError)}`;
                console.error(`❌ [${new Date().toLocaleTimeString()}] DEBUG: PR creation exception: ${errorMsg}`);
                if (prError instanceof Error && prError.stack) {
                  console.error(`   Stack trace: ${prError.stack}`);
                }
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
    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: createPRWithGitHubCLI starting...`);
    console.log(`   Branch: ${branchName}`);
    console.log(`   Working dir: ${workingDir}`);
    console.log(`   Review ID: ${reviewData.id}`);
    console.log(`   Fixes count: ${fixesProposed.length}`);
    
    // Check if GitHub CLI is available
    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Checking GitHub CLI availability...`);
    try {
      const ghVersion = execSync('gh --version', {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: workingDir
      });
      console.log(`   GitHub CLI version: ${ghVersion.split('\n')[0]}`);
    } catch (ghCheckError) {
      console.error(`❌ [${new Date().toLocaleTimeString()}] DEBUG: GitHub CLI not available:`);
      console.error(`   Error: ${ghCheckError instanceof Error ? ghCheckError.message : String(ghCheckError)}`);
      return null;
    }
    
    // Check GitHub authentication
    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Checking GitHub authentication...`);
    try {
      const authStatus = execSync('gh auth status', {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: workingDir
      });
      console.log(`   Auth status: OK`);
      console.log(`   Auth details: ${authStatus.trim().split('\n')[0]}`);
    } catch (authError) {
      console.error(`❌ [${new Date().toLocaleTimeString()}] DEBUG: GitHub authentication failed:`);
      console.error(`   Error: ${authError instanceof Error ? authError.message : String(authError)}`);
      return null;
    }
    
    // Verify repository context
    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Verifying repository context...`);
    let repoInfo;
    try {
      repoInfo = execSync('gh repo view --json name,owner,defaultBranchRef', {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: workingDir
      });
      const repo = JSON.parse(repoInfo);
      console.log(`   Repository: ${repo.owner.login}/${repo.name}`);
      console.log(`   Default branch: ${repo.defaultBranchRef.name}`);
    } catch (repoError) {
      console.error(`❌ [${new Date().toLocaleTimeString()}] DEBUG: Repository context detection failed:`);
      console.error(`   Error: ${repoError instanceof Error ? repoError.message : String(repoError)}`);
      console.error(`   This might cause PR creation to fail - trying to continue anyway`);
    }
    
    // Detect the correct base branch dynamically
    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Detecting base branch...`);
    let baseBranch = 'main'; // default fallback
    try {
      if (repoInfo) {
        const repo = JSON.parse(repoInfo);
        baseBranch = repo.defaultBranchRef.name;
        console.log(`   Using repository default branch: ${baseBranch}`);
      } else {
        // Fallback: try to detect from git
        try {
          const gitDefault = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
            encoding: 'utf8',
            stdio: 'pipe',
            cwd: workingDir
          }).trim().replace('refs/remotes/origin/', '');
          baseBranch = gitDefault;
          console.log(`   Using git detected default branch: ${baseBranch}`);
        } catch (gitError) {
          console.log(`   Using fallback branch: ${baseBranch}`);
        }
      }
    } catch (branchError) {
      console.warn(`⚠️ [${new Date().toLocaleTimeString()}] DEBUG: Base branch detection failed, using fallback: ${baseBranch}`);
    }
    
    const prTitle = `Fix issues from production review ${reviewData.id}`;
    const fixList = fixesProposed.slice(0, 5).map(fix => `- ${fix}`).join('\\n');
    const additionalFixes = fixesProposed.length > 5 ? `\\n... and ${fixesProposed.length - 5} more fixes` : '';
    
    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Preparing PR content...`);
    console.log(`   Title: ${prTitle}`);
    
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

    console.log(`   Body preview: ${prBody.substring(0, 200)}...`);

    // Create PR using gh CLI
    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Executing GitHub CLI PR creation...`);
    const ghCommand = `gh pr create --title "${prTitle}" --body "${prBody.replace(/"/g, '\\"')}" --head "${branchName}" --base "${baseBranch}"`;
    console.log(`   Command: ${ghCommand.substring(0, 150)}...`);
    console.log(`   Using base branch: ${baseBranch}`);
    
    // Add retry logic for transient failures
    let prResult;
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: PR creation attempt ${attempt}/${maxRetries}`);
        
        prResult = execSync(ghCommand, {
            encoding: 'utf8',
            stdio: 'pipe',
            cwd: workingDir
          }
        ).trim();
        
        console.log(`✅ [${new Date().toLocaleTimeString()}] DEBUG: PR creation successful on attempt ${attempt}`);
        break; // Success, exit retry loop
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ [${new Date().toLocaleTimeString()}] DEBUG: PR creation attempt ${attempt} failed:`);
        console.warn(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`   Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    if (!prResult) {
      // All retries failed, throw the last error
      throw lastError;
    }

    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: GitHub CLI execution completed`);
    console.log(`   Raw result: ${prResult}`);

    // Extract PR URL from gh CLI output
    console.log(`🔧 [${new Date().toLocaleTimeString()}] DEBUG: Extracting PR URL from result...`);
    const prUrlRegex = /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;
    const prUrlMatch = prUrlRegex.exec(prResult);
    
    if (prUrlMatch) {
      console.log(`   PR URL found: ${prUrlMatch[0]}`);
      return prUrlMatch[0];
    } else {
      console.error(`❌ [${new Date().toLocaleTimeString()}] DEBUG: No PR URL found in GitHub CLI output`);
      console.error(`   Full output: ${prResult}`);
      console.error(`   Regex pattern: ${prUrlRegex.source}`);
      return null;
    }

  } catch (error) {
    console.error(`❌ [${new Date().toLocaleTimeString()}] DEBUG: GitHub CLI error:`);
    console.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
    console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`   Stack trace: ${error.stack}`);
    }
    
    // Try to extract additional context from exec errors
    if (error && typeof error === 'object' && 'stderr' in error) {
      console.error(`   Stderr: ${(error as any).stderr}`);
    }
    if (error && typeof error === 'object' && 'stdout' in error) {
      console.error(`   Stdout: ${(error as any).stdout}`);
    }
    
    return null;
  }
}


// Helper function to generate actionable prompts for Claude Code
function generateGeneralPrompt(
  findings: any[], 
  reviewData: any, 
  dryRun: boolean
): string {
  const baseContext = `Review: ${reviewData.id} (${reviewData.type}) - Score: ${reviewData.score}/100\n\n`;
  
  // Generate detailed, actionable instructions for each finding
  const findingsText = findings.map((f, i) => {
    const searchKeywords = generateSearchKeywords(f);
    const actionSteps = generateActionSteps(f, dryRun);
    
    return `${i + 1}. [${f.severity?.toUpperCase() || 'MEDIUM'}] ${f.issue}

SEARCH PHASE:
- Use grep to search for: ${searchKeywords.join(', ')}
- Look in config files, authentication modules, API endpoints
- Read relevant files to understand current implementation

IMPLEMENTATION PHASE:
${actionSteps.join('\n')}

VERIFICATION:
- Read modified files to confirm changes
- Check for syntax errors or obvious issues
`;
  }).join('\n');

  const taskInstruction = dryRun 
    ? "ANALYZE codebase and provide detailed recommendations - do not modify files." 
    : "IMPLEMENT each fix by making actual file changes. Search first, then modify files.";

  return `${baseContext}PRODUCTION ISSUES TO FIX:
${findingsText}

OVERALL TASK: ${taskInstruction}

WORKFLOW:
1. For each issue above: Search → Identify files → Make changes → Verify
2. Focus on making concrete file modifications that address root causes
3. Ensure all changes are syntactically correct and maintain existing functionality`;
}

// Helper function to generate search keywords based on finding content
function generateSearchKeywords(finding: any): string[] {
  const keywords = [];
  const issue = finding.issue.toLowerCase();
  const category = finding.category?.toLowerCase();
  
  // Category-based keywords
  if (category === 'security') {
    keywords.push('auth', 'login', 'token', 'session', 'password', 'security');
  } else if (category === 'performance') {
    keywords.push('query', 'cache', 'optimize', 'slow', 'performance');
  } else if (category === 'configuration') {
    keywords.push('config', 'env', 'settings', 'properties');
  }
  
  // Issue-specific keywords
  if (issue.includes('sql')) keywords.push('sql', 'query', 'database');
  if (issue.includes('saml')) keywords.push('saml', 'sso', 'authentication');
  if (issue.includes('api')) keywords.push('api', 'endpoint', 'route');
  if (issue.includes('memory')) keywords.push('memory', 'leak', 'gc');
  if (issue.includes('test')) keywords.push('test', 'spec', 'coverage');
  if (issue.includes('csrf')) keywords.push('csrf', 'token', 'security');
  if (issue.includes('validation')) keywords.push('validate', 'input', 'sanitize');
  
  return [...new Set(keywords)]; // Remove duplicates
}

// Helper function to generate specific action steps
function generateActionSteps(finding: any, dryRun: boolean): string[] {
  const steps = [];
  const issue = finding.issue.toLowerCase();
  
  if (dryRun) {
    steps.push('- Analyze current implementation and identify needed changes');
    steps.push('- Document specific files and modifications required');
    return steps;
  }
  
  // Security fixes
  if (finding.category === 'security') {
    if (issue.includes('sql injection')) {
      steps.push('- Replace string concatenation with parameterized queries');
      steps.push('- Add input validation and sanitization');
      steps.push('- Update database access methods');
    } else if (issue.includes('csrf')) {
      steps.push('- Add CSRF token generation to forms/APIs');
      steps.push('- Implement CSRF validation middleware');
      steps.push('- Update frontend to include CSRF tokens');
    } else if (issue.includes('saml') || issue.includes('authentication')) {
      steps.push('- Locate SAML configuration files');
      steps.push('- Update authentication settings as recommended');
      steps.push('- Add proper error handling and logging');
    } else {
      steps.push('- Implement security controls as recommended');
      steps.push('- Add input validation and sanitization');
    }
  }
  
  // Performance fixes  
  else if (finding.category === 'performance') {
    if (issue.includes('database') || issue.includes('query')) {
      steps.push('- Add database indexes for slow queries');
      steps.push('- Optimize query structure and joins');
      steps.push('- Add query result caching where appropriate');
    } else if (issue.includes('memory')) {
      steps.push('- Fix memory leaks by proper cleanup');
      steps.push('- Add proper event listener removal');
      steps.push('- Implement garbage collection best practices');
    } else {
      steps.push('- Implement performance optimizations as recommended');
      steps.push('- Add caching or optimization where possible');
    }
  }
  
  // Testing fixes
  else if (finding.category === 'testing') {
    steps.push('- Add missing unit tests for identified components');
    steps.push('- Implement integration tests for critical flows');
    steps.push('- Update test configuration if needed');
  }
  
  // Configuration fixes
  else if (finding.category === 'configuration') {
    steps.push('- Update configuration files with recommended settings');
    steps.push('- Add environment variable handling');
    steps.push('- Update documentation for configuration changes');
  }
  
  // Generic fixes
  else {
    steps.push('- Implement the recommended fix by modifying relevant files');
    steps.push('- Ensure changes follow project coding standards');
  }
  
  return steps;
}