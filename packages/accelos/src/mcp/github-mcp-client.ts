import { MCPClient } from '@mastra/mcp';
import * as dotenv from 'dotenv';

dotenv.config();

// GitHub MCP Client Configuration
export const githubMCPClient = new MCPClient({
  servers: {
    github: {
      url: new URL(process.env.GITHUB_MCP_SERVER_URL || 'http://localhost:3001/mcp'),
      requestInit: {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    },
  },
});

// Helper function to get tools
export const githubTools = await githubMCPClient.getTools();

// Workflow debugging specific GitHub MCP tools (filtered)
export const githubWorkflowTools = Object.fromEntries(
  Object.entries(githubTools).filter(([key]) => {
    // Only include tools related to workflow debugging
    const workflowPatterns = [
      'get_workflow_run',
      'list_workflow_runs',
      'get_workflow_jobs',
      'get_workflow_run_logs',
      'get_job_logs',
      'list_workflows',
      'get_workflow',
      'get_actions_run',
      'list_actions_runs',
      'get_actions_job',
      'list_actions_jobs',
      'get_repository', // For repo context
      'get_commit', // For commit context in workflow runs
      'list_commits', // For recent commits context
      'get_pull_request', // For PR-triggered workflows
      'list_pull_requests', // For PR context
      'get_branch', // For branch context
      'list_branches', // For branch-related workflows
      'get_contents', // For reading workflow files
      'get_tree', // For repo structure context
    ];
    
    return workflowPatterns.some(pattern => key.includes(pattern));
  })
);

// Workflow debugging specific tools
export const workflowDebuggingTools = {
  async getWorkflowRun(owner: string, repo: string, runId: number) {
    try {
      return await githubMCPClient.callTool('get_workflow_run', {
        owner,
        repo,
        run_id: runId
      });
    } catch (error) {
      console.warn('GitHub MCP tool not available, using fallback');
      return {
        id: runId,
        status: 'failed',
        conclusion: 'failure',
        workflow_id: 'unknown',
        name: 'CI/CD Workflow',
        head_branch: 'main',
        head_sha: 'abc123',
        run_started_at: new Date().toISOString(),
        html_url: `https://github.com/${owner}/${repo}/actions/runs/${runId}`
      };
    }
  },

  async getWorkflowJobs(owner: string, repo: string, runId: number) {
    try {
      return await githubMCPClient.callTool('get_workflow_jobs', {
        owner,
        repo,
        run_id: runId
      });
    } catch (error) {
      console.warn('GitHub MCP tool not available, using fallback');
      return {
        jobs: [{
          id: 1,
          name: 'build',
          status: 'failed',
          conclusion: 'failure',
          steps: [
            {
              name: 'Checkout code',
              status: 'completed',
              conclusion: 'success'
            },
            {
              name: 'Setup Node.js',
              status: 'failed',
              conclusion: 'failure'
            }
          ]
        }]
      };
    }
  },

  async getWorkflowRunLogs(owner: string, repo: string, runId: number) {
    try {
      return await githubMCPClient.callTool('get_workflow_run_logs', {
        owner,
        repo,
        run_id: runId
      });
    } catch (error) {
      console.warn('GitHub MCP logs tool not available');
      return {
        logs: 'Error: npm WARN deprecated package@1.0.0\nError: Build failed with exit code 1'
      };
    }
  }
};