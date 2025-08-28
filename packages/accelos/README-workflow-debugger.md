# GitHub Workflow Debugger Agent

A specialized Mastra agent for analyzing GitHub Actions workflow failures and providing debugging insights and fix suggestions.

## Overview

The GitHub Workflow Debugger Agent is available through Mastra and leverages GitHub MCP (Model Context Protocol) tools to analyze failed GitHub Actions workflows and provide actionable debugging recommendations.

## Features

- **Workflow Analysis**: Analyze specific workflow runs by URL or repository details
- **Root Cause Analysis**: Identify why workflows failed with detailed explanations
- **Fix Suggestions**: Get specific, actionable recommendations to resolve issues
- **Multiple LLM Providers**: Support for OpenAI, Anthropic, and Google models
- **GitHub Integration**: Uses GitHub MCP tools for real-time workflow data
- **EKG Integration**: Access Engineering Knowledge Graph for system context and service relationships

## Usage

The GitHub Workflow Debugger Agent is available only through Mastra. There are two ways to use it:

### Method 1: Mastra Playground (Recommended)

1. **Start Mastra Server**:
   ```bash
   cd packages/accelos
   npm run dev
   ```

2. **Open Playground**:
   ```
   http://localhost:4111
   ```

3. **Select Agent**: Choose "github-workflow-debugger" from the agent list

4. **Try Example Prompts**:
   ```
   "Analyze this workflow failure: https://github.com/owner/repo/actions/runs/123456"
   
   "Debug a workflow that's failing with npm ERR! code ERESOLVE"
   
   "Help me understand why the Setup Node.js step failed"
   ```

### Method 2: Programmatic Usage

```typescript
import { mastra } from '@accelos/workflow-debugger';

// Get the GitHub Workflow Debugger agent
const workflowDebuggerAgent = mastra.getAgent('github-workflow-debugger');

if (workflowDebuggerAgent) {
  const prompt = `
    Analyze this GitHub Actions workflow failure:
    
    Repository: owner/repo
    Workflow Run ID: 123456
    URL: https://github.com/owner/repo/actions/runs/123456
    
    Please investigate what went wrong and provide debugging recommendations.
  `;
  
  const result = await workflowDebuggerAgent.generate(prompt);
  console.log(result.text);
}
```

## Configuration

### Environment Variables

Set up the required environment variables:

```bash
# For GitHub API access
export GITHUB_TOKEN=your_github_token
export GITHUB_MCP_SERVER_URL=http://localhost:3001/mcp

# For LLM providers (choose one)
export ANTHROPIC_API_KEY=your_anthropic_key
export OPENAI_API_KEY=your_openai_key  
export GOOGLE_API_KEY=your_google_key

# For EKG (Engineering Knowledge Graph) access
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=your_neo4j_password
export NEO4J_DATABASE=neo4j
```

### Mastra Configuration

The agent is pre-configured in Mastra with:
- **Model**: Anthropic Claude-3.5-Sonnet-20241022
- **Tools**: GitHub MCP tools (workflow-specific), EKG tool, Claude Code tool
- **Memory**: Persistent conversation memory
- **Max Steps**: 100 reasoning steps

No additional configuration is required - the agent is ready to use through Mastra.


## Examples

See the [examples directory](./src/examples/) for comprehensive usage examples:

- `workflow-debugger-example.ts` - Complete usage examples
- Common error scenarios and their fixes
- Interactive debugging sessions

## GitHub MCP Integration

The agent uses **filtered GitHub MCP tools** (workflow-specific only) for security and focus:

### Allowed GitHub Tools
- **Workflow Analysis**: `get_workflow_run`, `list_workflow_runs`, `get_workflow_jobs`, `list_workflows`
- **Log Investigation**: `get_workflow_run_logs`, `get_job_logs`
- **Repository Context**: `get_repository`, `get_commit`, `list_commits`, `get_contents`, `get_tree`
- **PR/Branch Context**: `get_pull_request`, `list_pull_requests`, `get_branch`, `list_branches`
- **Actions Context**: `get_actions_run`, `list_actions_runs`, `get_actions_job`, `list_actions_jobs`

### Security Restrictions
The agent **cannot** access:
- Repository modification tools (`create_*`, `update_*`, `delete_*`)
- Issue/PR creation or editing tools
- Organization or team management tools
- Repository settings or secrets
- Webhook management

This ensures the agent has **read-only access** to workflow-related data only.

### Fallback Behavior

If GitHub MCP tools are unavailable, the agent provides fallback mock data for development and testing purposes.

## EKG (Engineering Knowledge Graph) Integration

The agent can access Neo4j-based Engineering Knowledge Graph containing:

### Entities
- **Services**: Frontend/backend applications
- **Resources**: Databases, compute, storage
- **Tools**: Monitoring, testing, security tools
- **Pipelines**: CI/CD workflow configurations
- **Environments**: Development, staging, production
- **Teams**: Service ownership and contacts

### Relationships
- Service dependencies (`DEPENDS_ON`)
- Resource usage (`USES`)
- Tool configurations (`USES_TOOL`)
- Service ownership (`OWNED_BY`)
- Environment deployments (`DEPLOYED_TO`)

### EKG-Enhanced Debugging Examples

```typescript
// Find services affected by a workflow failure
const prompt = `
  This payment service workflow is failing. Use EKG to:
  1. Find what services depend on payment-service
  2. Identify infrastructure resources it uses
  3. Get service owner contacts for coordination
  
  Workflow: https://github.com/company/payment-service/actions/runs/123456
`;

const analysis = await agent.debugWorkflowRun('company', 'payment-service', 123456);
```

The agent automatically uses EKG queries like:
- `MATCH (s:Service {name: "payment-service"})<-[:DEPENDS_ON]-(dep) RETURN dep`
- `MATCH (s:Service {name: "payment-service"})-[:USES]->(r:Resource) RETURN r`
- `MATCH (s:Service {name: "payment-service"})-[:OWNED_BY]->(team) RETURN team`

## Error Handling

The agent handles various error scenarios:

- **Network Issues**: Graceful fallback when GitHub API is unavailable
- **Authentication Errors**: Clear error messages for token issues
- **Invalid Input**: Validation of URLs and parameters
- **LLM Provider Issues**: Fallback error messages when generation fails

## Testing

Run the test suite:

```bash
npm test
```

The test suite covers:
- Agent initialization with different providers
- Workflow debugging scenarios
- Error handling and edge cases
- URL parsing and validation
- Configuration management

## Limitations (PoC)

This is a proof-of-concept implementation with the following limitations:

- **No Persistent State**: Each analysis is independent
- **Basic Pattern Recognition**: Limited error pattern matching
- **Mock Data Fallback**: Uses simplified mock data when MCP tools unavailable
- **Single Run Analysis**: No cross-run pattern analysis
- **Limited Context**: Basic workflow context understanding

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

[License details here]

## Support

For issues and questions:
- Check the [examples](./src/examples/) for usage patterns
- Review test files for expected behavior
- Open an issue for bugs or feature requests

## Roadmap

Future enhancements could include:
- Persistent analysis history
- Advanced pattern recognition
- Multi-run correlation analysis
- Integration with more CI/CD platforms
- Real-time workflow monitoring
- Automated fix application