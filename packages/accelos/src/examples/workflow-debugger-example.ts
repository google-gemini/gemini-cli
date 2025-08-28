/**
 * GitHub Workflow Debugger Agent Usage Examples
 * 
 * This file demonstrates how to use the GitHub Workflow Debugger Agent
 * through Mastra to analyze workflow failures and get debugging recommendations.
 */

import { mastra } from '../mastra/index.js';

// GitHub Workflow Debugger Agent is available through Mastra
// You can access it at: http://localhost:4111 (Mastra Playground)
// Or programmatically through the Mastra API

/**
 * Example 1: Using Mastra Playground (Recommended)
 */
function debugWorkflowByPlayground() {
  console.log('🔍 Example 1: Using Mastra Playground');
  
  console.log('1. Start the Mastra server:');
  console.log('   npm run dev');
  console.log('');
  console.log('2. Open the Mastra Playground:');
  console.log('   http://localhost:4111');
  console.log('');
  console.log('3. Select the "github-workflow-debugger" agent');
  console.log('');
  console.log('4. Try prompts like:');
  console.log('   "Analyze this workflow failure: https://github.com/owner/repo/actions/runs/123456"');
  console.log('   "Debug a workflow that\'s failing with npm ERR! code ERESOLVE"');
  console.log('   "Help me understand why the Setup Node.js step failed"');
}

/**
 * Example 2: Programmatic Usage via Mastra API
 */
async function debugWorkflowProgrammatically() {
  console.log('\n🔍 Example 2: Programmatic usage via Mastra API');
  
  try {
    console.log('Using Mastra agent programmatically:');
    
    // Get the GitHub Workflow Debugger agent from Mastra
    const workflowDebuggerAgent = mastra.getAgent('github-workflow-debugger');
    
    if (workflowDebuggerAgent) {
      const prompt = `
        Analyze this GitHub Actions workflow failure:
        
        Repository: owner/repo
        Workflow Run ID: 123456
        URL: https://github.com/owner/repo/actions/runs/123456
        
        Please investigate what went wrong and provide debugging recommendations.
      `;
      
      console.log('Sending prompt to agent...');
      const result = await workflowDebuggerAgent.generate(prompt);
      
      console.log('📊 Agent Response:');
      console.log(result.text || 'No response received');
    } else {
      console.error('❌ GitHub Workflow Debugger agent not found in Mastra');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/**
 * Example 3: Common Error Debugging Prompts
 */
function getCommonErrorPrompts() {
  console.log('\n🔧 Example 3: Common error debugging prompts for Mastra');
  
  const commonErrorPrompts = [
    {
      category: 'Node.js Setup Failure',
      prompt: `
        I have a GitHub workflow failing with this error:
        
        Error: The process '/opt/hostedrunners/node/18.17.0/x64/bin/npm' failed with exit code 1
        npm ERR! code ERESOLVE
        npm ERR! ERESOLVE could not resolve
        npm ERR! peer dep @types/node@"^20.0.0" from package-a@1.0.0
        
        Context:
        - OS: ubuntu-latest
        - Node version: 18.x
        - Failed action: Setup Node.js
        
        Please help me fix this dependency resolution issue.
      `
    },
    {
      category: 'Build Timeout',
      prompt: `
        My GitHub workflow is timing out during the build step:
        
        Error: The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.
        
        The build usually takes about 10 minutes but it's timing out after 6 hours.
        Please help me identify what might be causing this infinite loop or hanging process.
      `
    },
    {
      category: 'Authentication Error',
      prompt: `
        GitHub workflow failing with authentication error:
        
        Error: remote: Support for password authentication was removed on August 13, 2021.
        
        This is happening during our deployment step. Can you help me understand what authentication method I should be using instead?
      `
    }
  ];
  
  commonErrorPrompts.forEach((example, index) => {
    console.log(`\n${index + 1}. ${example.category}:`);
    console.log('   Copy this prompt to Mastra Playground:');
    console.log('   ' + '='.repeat(50));
    console.log(example.prompt);
    console.log('   ' + '='.repeat(50));
  });
}

/**
 * Example 4: EKG-Enhanced Workflow Debugging Prompts
 */
function getEkgEnhancedPrompts() {
  console.log('\n🕸️  Example 4: EKG-Enhanced workflow debugging prompts');
  
  const ekgPrompts = [
    {
      category: 'Service Impact Analysis',
      prompt: `
        Our payment service workflow is failing during deployment:
        https://github.com/company/payment-service/actions/runs/456789
        
        Please use EKG to help me understand:
        1. What services depend on the payment service?
        2. What infrastructure resources does it use?
        3. Who are the service owners I should notify?
        4. What's the blast radius of this failure?
      `
    },
    {
      category: 'Infrastructure Context',
      prompt: `
        Database migration workflow failing:
        https://github.com/company/user-service/actions/runs/789123
        
        Use EKG to analyze:
        1. What database resources are involved?
        2. Which other services use the same database?
        3. What environments are affected?
        4. Are there any tool configurations I should check?
      `
    },
    {
      category: 'Cross-Service Dependencies',
      prompt: `
        API gateway deployment is failing. Use EKG to map:
        1. All services routing through this gateway
        2. Downstream service dependencies
        3. Monitoring tools configured for this service
        4. Environment-specific configurations
        
        Workflow: https://github.com/company/api-gateway/actions/runs/987654
      `
    }
  ];
  
  console.log('These prompts leverage the EKG tool for system-aware debugging:');
  
  ekgPrompts.forEach((example, index) => {
    console.log(`\n${index + 1}. ${example.category}:`);
    console.log('   Copy this to Mastra Playground:');
    console.log('   ' + '='.repeat(50));
    console.log(example.prompt);
    console.log('   ' + '='.repeat(50));
  });
}

/**
 * Example 5: EKG Tool Usage Examples
 */
async function ekgToolUsageExamples() {
  console.log('\n📊 Example 5: EKG tool usage patterns for Mastra');
  
  console.log('These are examples of how the agent can use EKG tool internally:');
  
  const ekgQueries = [
    {
      name: 'Find Service Dependencies',
      description: 'Query services that depend on a failed service',
      example: {
        operation: 'read_cypher',
        query: 'MATCH (s:Service {name: $serviceName})<-[:DEPENDS_ON]-(dependent) RETURN dependent.name, dependent.type',
        params: { serviceName: 'payment-service' }
      }
    },
    {
      name: 'Infrastructure Resources',
      description: 'Find infrastructure resources used by a service',
      example: {
        operation: 'read_cypher',
        query: 'MATCH (s:Service {name: $serviceName})-[:USES]->(r:Resource) RETURN r.type, r.name, r.environment',
        params: { serviceName: 'user-service' }
      }
    },
    {
      name: 'CI/CD Pipeline Tools',
      description: 'Find tools configured for a specific service pipeline',
      example: {
        operation: 'read_cypher',
        query: 'MATCH (s:Service {name: $serviceName})-[:HAS_PIPELINE]->(p:Pipeline)-[:USES_TOOL]->(t:Tool) RETURN t.name, t.type, t.configuration',
        params: { serviceName: 'api-gateway' }
      }
    },
    {
      name: 'Service Ownership',
      description: 'Find owners and responsible teams for a service',
      example: {
        operation: 'read_cypher',
        query: 'MATCH (s:Service {name: $serviceName})-[:OWNED_BY]->(team:Team) RETURN team.name, team.contacts',
        params: { serviceName: 'notification-service' }
      }
    },
    {
      name: 'Environment Mapping',
      description: 'Map service deployments across environments',
      example: {
        operation: 'read_cypher',
        query: 'MATCH (s:Service {name: $serviceName})-[:DEPLOYED_TO]->(e:Environment) RETURN e.name, e.type, e.region',
        params: { serviceName: 'frontend-app' }
      }
    }
  ];
  
  ekgQueries.forEach((query, index) => {
    console.log(`\n${index + 1}. ${query.name}`);
    console.log(`   Description: ${query.description}`);
    console.log(`   Query: ${JSON.stringify(query.example, null, 2)}`);
  });
  
  console.log('\n💡 The agent can use these queries to provide rich context for workflow debugging!');
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 GitHub Workflow Debugger Agent - Mastra Usage Examples\n');
  console.log('The GitHub Workflow Debugger is now available through Mastra only.\n');
  
  try {
    debugWorkflowByPlayground();
    await debugWorkflowProgrammatically();
    getCommonErrorPrompts();
    getEkgEnhancedPrompts();
    ekgToolUsageExamples();
    demonstrateConfiguration();
    
    console.log('\n✅ All examples completed successfully!');
    console.log('\n🎯 Next Steps:');
    console.log('1. Start Mastra server: npm run dev');
    console.log('2. Open playground: http://localhost:4111');
    console.log('3. Select "github-workflow-debugger" agent');
    console.log('4. Try the example prompts above!');
  } catch (error) {
    console.error('\n❌ Example execution failed:', error);
  }
}

/**
 * Utility function to demonstrate agent configuration
 */
function demonstrateConfiguration() {
  console.log('\n⚙️  Agent Configuration Options:');
  
  const configs = [
    {
      name: 'OpenAI Configuration',
      config: {
        llmProvider: 'openai',
        model: 'gpt-4',
        apiKey: 'your-openai-api-key',
        systemPrompt: 'You are a GitHub Actions debugging expert.'
      }
    },
    {
      name: 'Google Configuration', 
      config: {
        llmProvider: 'google',
        model: 'gemini-pro',
        apiKey: 'your-google-api-key',
        systemPrompt: 'You specialize in CI/CD workflow troubleshooting.'
      }
    },
    {
      name: 'Anthropic Configuration',
      config: {
        llmProvider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        apiKey: 'your-anthropic-api-key',
        systemPrompt: 'You are an expert at analyzing GitHub Actions failures.'
      }
    }
  ];
  
  configs.forEach(({ name, config }) => {
    console.log(`\n📝 ${name}:`);
    console.log(JSON.stringify(config, null, 2));
  });
}

// Export functions for external use
export {
  debugWorkflowByPlayground,
  debugWorkflowProgrammatically,
  getCommonErrorPrompts,
  getEkgEnhancedPrompts,
  ekgToolUsageExamples,
  demonstrateConfiguration
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}