/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTool } from '@mastra/core';
import { z } from 'zod';
import { reviewToPRStreamingWorkflow } from '../workflows/review-to-pr-streaming-workflow.js';

/**
 * PR Creation Workflow Tool
 * 
 * This tool wraps the review-to-pr-streaming-workflow to make it available
 * as a tool for the production-reviewent, enabling users to request
 * PR creation through natural language.
 */
export const prCreationWorkflowTool = createTool({
  id: 'create-pr-from-review',
  description: 'Automatically implement code fixes and create pull request for production review findings. This tool uses Claude Code to analyze the codebase, make actual file changes to address review issues, create a git branch, commit changes, and create a GitHub PR. Use this tool whenever review findings require code modifications, security fixes, performance improvements, or configuration changes.',
  inputSchema: z.object({
    reviewAssessmentId: z.string().describe('ID of the review assessment to process (e.g., "REVIEW-2025-01-13-sample")'),
    dryRun: z.boolean().default(false).describe('Whether to run in dry-run mode (analysis only, no file changes or PR creation)'),
    autoCommit: z.boolean().default(true).describe('Whether to automatically commit changes to a new branch'),
    createPR: z.boolean().default(true).describe('Whether to create a GitHub pull request'),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
      .describe('Minimum severity level to process (if not specified, processes all severities)'),
  }),
  outputSchema: z.object({
    success: z.boolean().describe('Whether the workflow completed successfully'),
    reviewAssessmentId: z.string().describe('ID of the processed review assessment'),
    summary: z.object({
      phase: z.string().describe('Final phase reached (e.g., "complete", "failed")'),
      claudeCodeExecutions: z.number().describe('Number of Claude Code analysis executions'),
      totalExecutionTime: z.number().describe('Total execution time in milliseconds'),
      fixesProposed: z.number().describe('Number of fixes proposed'),
      branchCreated: z.string().optional().describe('Name of the branch created'),
      prUrl: z.string().optional().describe('URL of the created pull request'),
    }),
    analysisResults: z.string().optional().describe('Detailed analysis results from Claude Code'),
    errors: z.array(z.string()).optional().describe('Any errors that occurred during execution'),
    message: z.string().describe('Human-readable summary of the operation'),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { 
      reviewAssessmentId, 
      dryRun, 
      autoCommit, 
      createPR, 
      severity 
    } = context;

    console.log(`🚀 Starting PR creation workflow for review: ${reviewAssessmentId}`);
    console.log(`   Settings: dryRun=${dryRun}, autoCommit=${autoCommit}, createPR=${createPR}`);
    
    if (severity) {
      console.log(`   Minimum severity: ${severity}`);
    }

    const startTime = Date.now();

    try {
      // Create and execute the workflow
      const workflowRun = await reviewToPRStreamingWorkflow.createRunAsync();
      
      const result = await workflowRun.start({
        inputData: {
          reviewAssessmentId,
          dryRun,
          autoCommit,
          createPR,
        }
      });

      const executionTime = Date.now() - startTime;

      // Check if workflow completed successfully
      if (result.status === 'success' && result.result) {
        const workflowResult = result.result;
        
        // Extract summary information
        const summary = {
          phase: workflowResult.summary?.phase || 'completed',
          claudeCodeExecutions: workflowResult.summary?.claudeCodeExecutions || 1,
          totalExecutionTime: workflowResult.summary?.totalExecutionTime || executionTime,
          fixesProposed: 0, // Will be populated from analysis results
          branchCreated: undefined as string | undefined,
          prUrl: undefined as string | undefined,
        };

        // Generate human-readable message
        let message = `PR creation workflow completed for review ${reviewAssessmentId}`;
        
        if (dryRun) {
          message = `Dry run analysis completed for review ${reviewAssessmentId}`;
        } else if (workflowResult.summary?.phase === 'complete') {
          message = `Successfully created PR for review ${reviewAssessmentId}`;
          if (summary.prUrl) {
            message += ` - PR available at ${summary.prUrl}`;
          }
        }

        return {
          success: true,
          reviewAssessmentId,
          summary,
          analysisResults: undefined, // Could extract from workflow result if needed
          message,
        };
      } else {
        // Workflow failed or was suspended
        const errorMessage = result.status === 'failed' 
          ? 'Workflow execution failed'
          : `Workflow ended with status: ${result.status}`;

        return {
          success: false,
          reviewAssessmentId,
          summary: {
            phase: 'failed',
            claudeCodeExecutions: 0,
            totalExecutionTime: executionTime,
            fixesProposed: 0,
          },
          errors: [errorMessage],
          message: `PR creation failed for review ${reviewAssessmentId}: ${errorMessage}`,
        };
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`❌ PR creation workflow failed:`, error);

      return {
        success: false,
        reviewAssessmentId,
        summary: {
          phase: 'error',
          claudeCodeExecutions: 0,
          totalExecutionTime: executionTime,
          fixesProposed: 0,
        },
        errors: [errorMessage],
        message: `PR creation failed for review ${reviewAssessmentId}: ${errorMessage}`,
      };
    }
  },
});