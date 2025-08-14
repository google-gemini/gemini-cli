# Mastra Workflows

This directory contains Mastra workflows that orchestrate complex AI-powered operations using the Claude Code tool and other integrated services.

## Available Workflows

### Code Review Workflow (`code-review-workflow.ts`)

A comprehensive automated code review system that leverages Claude Code's advanced development capabilities.

**Features:**
- 🔍 **Code Quality Analysis** - Structure, maintainability, and best practices
- 🛡️ **Security Auditing** - Vulnerability detection and security assessment  
- ⚡ **Performance Review** - Bottleneck identification and optimization suggestions
- 💡 **Enhancement Recommendations** - Prioritized improvement suggestions
- 📖 **Documentation Generation** - Automatic API docs and usage examples

**Quick Start:**
```typescript
import { mastra } from '../mastra/index.js';

const workflow = mastra.getWorkflow('code-review-workflow');
const run = await workflow.createRunAsync();

const result = await run.start({
  inputData: {
    codeContent: 'your source code here',
    reviewType: 'full',
    includeDocumentation: true
  }
});

console.log('Overall Score:', result.result.summary.overallScore);
```

## Workflow Architecture

All workflows in this project follow these architectural patterns:

### 1. Step-Based Design
- **Modular Steps**: Each workflow consists of discrete, testable steps
- **Typed Interfaces**: Full TypeScript support with Zod schema validation
- **Error Handling**: Graceful error handling and recovery mechanisms

### 2. Claude Code Integration
- **Tool Execution**: Steps leverage the Claude Code tool for AI-powered analysis
- **Streaming Support**: Real-time progress updates and result streaming
- **Context Management**: Proper context passing between workflow steps

### 3. Parallel Processing
- **Concurrent Steps**: Independent steps run in parallel for efficiency
- **Resource Optimization**: Intelligent resource utilization and rate limiting
- **Scalable Design**: Can handle multiple concurrent workflow executions

## Usage Patterns

### Basic Workflow Execution
```typescript
const workflow = mastra.getWorkflow('workflow-name');
const run = await workflow.createRunAsync();
const result = await run.start({ inputData: { /* params */ } });
```

### Streaming Workflow
```typescript
const streamResult = await run.stream({ inputData: { /* params */ } });
for await (const chunk of streamResult.stream) {
  console.log(chunk.type, chunk.stepId);
}
```

### Error Handling
```typescript
const result = await run.start({ inputData });
switch (result.status) {
  case 'success': /* handle success */; break;
  case 'failed': /* handle failure */; break;
  case 'suspended': /* handle suspension */; break;
}
```

## Development Guidelines

### Creating New Workflows

1. **Define Input/Output Schemas**
   ```typescript
   const inputSchema = z.object({
     // Define required inputs
   });
   
   const outputSchema = z.object({
     // Define expected outputs
   });
   ```

2. **Create Workflow Steps**
   ```typescript
   const myStep = createStep({
     id: 'my-step',
     inputSchema,
     outputSchema,
     execute: async ({ context }) => {
       // Step logic here
       return { /* results */ };
     }
   });
   ```

3. **Compose Workflow**
   ```typescript
   export const myWorkflow = createWorkflow({
     id: 'my-workflow',
     inputSchema,
     outputSchema
   })
   .then(step1)
   .parallel([step2, step3])
   .then(step4)
   .commit();
   ```

### Testing Workflows

- **Unit Tests**: Test individual steps in isolation
- **Integration Tests**: Test complete workflow execution
- **Mock Dependencies**: Mock Claude Code tool and external services
- **Edge Cases**: Test error conditions and edge cases

Example test structure:
```typescript
describe('My Workflow', () => {
  it('should execute successfully', async () => {
    const run = await myWorkflow.createRunAsync();
    const result = await run.start({ inputData });
    expect(result.status).toBe('success');
  });
});
```

### Performance Best Practices

1. **Parallel Execution**: Use `.parallel()` for independent steps
2. **Resource Management**: Monitor Claude Code API usage and rate limits
3. **Caching**: Cache results when appropriate to reduce API calls
4. **Streaming**: Use streaming for long-running workflows
5. **Error Recovery**: Implement proper error handling and retry logic

## Configuration

### Environment Variables
```bash
# Required for Claude Code integration
ANTHROPIC_API_KEY=your-anthropic-api-key

# Optional Claude Code settings
CLAUDE_CODE_MODEL=claude-3-sonnet-20240229
CLAUDE_CODE_MAX_TURNS=20
CLAUDE_CODE_PERMISSION_MODE=default
```

### Workflow Registration
Add new workflows to the Mastra instance:
```typescript
// In src/mastra/index.ts
export const mastra = new Mastra({
  workflows: {
    'code-review-workflow': codeReviewWorkflow,
    'my-new-workflow': myNewWorkflow,
  },
  // ... other config
});
```

## Examples and Documentation

- **Examples**: See `src/examples/` for usage examples
- **Tests**: See `*.test.ts` files for test patterns
- **Documentation**: See `docs/` for detailed documentation

## Contributing

When adding new workflows:

1. Follow the existing patterns and conventions
2. Include comprehensive tests
3. Add documentation and examples
4. Update this README with new workflow information
5. Ensure proper error handling and validation

## Support

For questions about workflows:
- Check the documentation in `docs/`
- Review existing examples and tests
- Consult the Mastra documentation for workflow patterns
- Review Claude Code tool documentation for integration details