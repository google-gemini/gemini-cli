/**
 * GitHub Tools Comparison - Workflow-Specific vs All Tools
 * 
 * This file demonstrates the difference between using all GitHub MCP tools
 * vs the restricted workflow-specific tools for better security and focus.
 */

import { githubTools, githubWorkflowTools } from '../mcp/github-mcp-client.js';

/**
 * Compare available tools and show the filtering
 */
export function compareGitHubTools() {
  console.log('🔧 GitHub Tools Comparison\n');
  
  try {
    const allToolsKeys = Object.keys(githubTools || {});
    const workflowToolsKeys = Object.keys(githubWorkflowTools || {});
    
    console.log(`📊 Total GitHub MCP Tools: ${allToolsKeys.length}`);
    console.log(`🎯 Workflow-Specific Tools: ${workflowToolsKeys.length}`);
    console.log(`🚫 Filtered Out: ${allToolsKeys.length - workflowToolsKeys.length}`);
    
    console.log('\n✅ Workflow Tools (INCLUDED):');
    workflowToolsKeys.sort().forEach(tool => {
      console.log(`  - ${tool}`);
    });
    
    console.log('\n❌ Filtered Tools (EXCLUDED):');
    const excludedTools = allToolsKeys.filter(tool => !workflowToolsKeys.includes(tool));
    excludedTools.sort().forEach(tool => {
      console.log(`  - ${tool}`);
    });
    
    console.log('\n🛡️  Security Benefits:');
    console.log('  - No access to repository modification tools');
    console.log('  - No access to issue/PR creation or editing');
    console.log('  - No access to organization or team management');
    console.log('  - No access to repository settings or secrets');
    console.log('  - Only read access to workflow-related data');
    
    console.log('\n🎯 Workflow Focus:');
    console.log('  - Workflow run analysis and debugging');
    console.log('  - Job and step status information');
    console.log('  - Log access for error investigation');
    console.log('  - Repository context for workflow understanding');
    console.log('  - PR context for triggered workflows');
    
  } catch (error) {
    console.error('❌ Error comparing tools:', error);
    console.log('💡 This may happen if the GitHub MCP server is not running');
  }
}

/**
 * Show workflow-specific tool categories
 */
export function showWorkflowToolCategories() {
  console.log('\n📂 Workflow Tool Categories:\n');
  
  const categories = {
    'Workflow Analysis': [
      'get_workflow_run',
      'list_workflow_runs', 
      'get_workflow_jobs',
      'get_workflow',
      'list_workflows'
    ],
    'Log Investigation': [
      'get_workflow_run_logs',
      'get_job_logs'
    ],
    'Repository Context': [
      'get_repository',
      'get_commit',
      'list_commits',
      'get_contents',
      'get_tree'
    ],
    'PR/Branch Context': [
      'get_pull_request',
      'list_pull_requests',
      'get_branch',
      'list_branches'
    ],
    'Actions Context': [
      'get_actions_run',
      'list_actions_runs',
      'get_actions_job',
      'list_actions_jobs'
    ]
  };
  
  Object.entries(categories).forEach(([category, tools]) => {
    console.log(`${category}:`);
    tools.forEach(tool => {
      console.log(`  - ${tool}`);
    });
    console.log('');
  });
}

/**
 * Demonstrate security filtering patterns
 */
export function showSecurityFiltering() {
  console.log('\n🛡️  Security Filtering Patterns:\n');
  
  const securityPatterns = {
    '✅ ALLOWED - Workflow Patterns': [
      'get_workflow_*',
      'list_workflow_*', 
      'get_actions_*',
      'list_actions_*',
      'get_job_*'
    ],
    '✅ ALLOWED - Context Patterns': [
      'get_repository',
      'get_commit*',
      'get_pull_request*', 
      'get_branch*',
      'get_contents',
      'get_tree'
    ],
    '❌ BLOCKED - Write Operations': [
      'create_*',
      'update_*',
      'delete_*',
      'merge_*',
      'close_*'
    ],
    '❌ BLOCKED - Administrative': [
      '*_team_*',
      '*_organization_*',
      '*_settings_*',
      '*_secrets_*',
      '*_webhook_*'
    ],
    '❌ BLOCKED - Issue/PR Management': [
      'create_issue',
      'update_issue',
      'create_pull_request',
      'update_pull_request',
      '*_comment*'
    ]
  };
  
  Object.entries(securityPatterns).forEach(([category, patterns]) => {
    console.log(`${category}:`);
    patterns.forEach(pattern => {
      console.log(`  - ${pattern}`);
    });
    console.log('');
  });
}

/**
 * Main demonstration function
 */
export function demonstrateGitHubToolFiltering() {
  console.log('🎯 GitHub Workflow Debugger - Tool Filtering Demonstration\n');
  console.log('=' .repeat(60));
  
  compareGitHubTools();
  showWorkflowToolCategories();
  showSecurityFiltering();
  
  console.log('=' .repeat(60));
  console.log('✅ Tool filtering ensures the GitHub Workflow Debugger Agent');
  console.log('   has access only to workflow-related GitHub operations,');
  console.log('   improving security and maintaining focus on debugging tasks.');
}

// Run demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateGitHubToolFiltering();
}