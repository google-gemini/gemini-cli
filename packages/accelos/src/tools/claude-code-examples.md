# Claude Code Tool Examples

The `claudeCodeTool` integrates Claude Code's powerful coding capabilities into Mastra agents. This tool allows agents to perform complex coding tasks, file operations, shell commands, web searches, and more.

## Prerequisites

Before using the Claude Code tool, ensure you have:

1. Set the `ANTHROPIC_API_KEY` environment variable:
   ```bash
   export ANTHROPIC_API_KEY="your-anthropic-api-key-here"
   ```

2. Installed the tool in your Mastra agent configuration.

## Basic Usage

### Simple Code Query

```typescript
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { claudeCodeTool } from "./tools/claude-code";

const agent = new Agent({
  name: "Development Assistant",
  instructions: "You are a helpful development assistant.",
  model: openai("gpt-4o-mini"),
  tools: {
    claudeCode: claudeCodeTool,
  },
});

// Basic usage
const response = await agent.generate("Use Claude Code to analyze the performance of a Python function that calculates fibonacci numbers.", {
  // Optional: pass additional context or parameters
});

console.log(response.text);
```

### Advanced Usage with Options

```typescript
const response = await agent.generate("Use Claude Code to refactor this JavaScript code for better performance", {
  // The agent will use the Claude Code tool with these options
});

// Or directly invoke the tool with specific options:
const result = await claudeCodeTool.execute({
  context: {
    prompt: "Create a Node.js Express server with CRUD operations for a user management system",
    options: {
      systemPrompt: "You are an expert backend developer. Focus on best practices, security, and performance.",
      maxTurns: 15,
      allowedTools: ["write", "read", "bash", "web_search"],
      permissionMode: "ask",
      outputFormat: "text",
      debug: true,
    }
  }
}, {});
```

## Common Use Cases

### 1. Code Analysis and Review

```typescript
const codeAnalysisResult = await claudeCodeTool.execute({
  context: {
    prompt: "Analyze the attached React component for performance issues, security vulnerabilities, and code quality improvements.",
    options: {
      systemPrompt: "You are a senior code reviewer. Provide detailed feedback on code quality, security, and performance.",
      allowedTools: ["read", "grep", "web_search"],
      maxTurns: 10,
    }
  }
}, {});

console.log("Analysis:", codeAnalysisResult.result);
console.log("Tools used:", codeAnalysisResult.metadata.toolsCalled);
```

### 2. Project Setup and Scaffolding

```typescript
const scaffoldingResult = await claudeCodeTool.execute({
  context: {
    prompt: "Create a new TypeScript project with Express, Jest testing setup, and Docker configuration for a REST API service.",
    options: {
      systemPrompt: "You are an expert in project architecture and DevOps. Create production-ready project structures.",
      allowedTools: ["write", "bash", "read"],
      permissionMode: "allow", // Allow all operations for scaffolding
      maxTurns: 20,
    }
  }
}, {});
```

### 3. Debugging and Troubleshooting

```typescript
const debugResult = await claudeCodeTool.execute({
  context: {
    prompt: "Help debug why my React application is showing a blank page. The console shows no errors but the components aren't rendering.",
    options: {
      systemPrompt: "You are a debugging expert. Systematically investigate issues and provide step-by-step solutions.",
      allowedTools: ["read", "grep", "bash", "web_search"],
      maxTurns: 12,
      debug: true, // Enable debug logging
    }
  }
}, {});
```

### 4. Documentation Generation

```typescript
const docResult = await claudeCodeTool.execute({
  context: {
    prompt: "Generate comprehensive API documentation for all the endpoints in this Express.js application, including examples and error responses.",
    options: {
      systemPrompt: "You are a technical writer specializing in API documentation. Create clear, comprehensive documentation.",
      allowedTools: ["read", "write", "grep"],
      maxTurns: 8,
    }
  }
}, {});
```

### 5. Performance Optimization

```typescript
const optimizationResult = await claudeCodeTool.execute({
  context: {
    prompt: "Optimize this database query performance and suggest indexing strategies for a PostgreSQL database with 1M+ records.",
    options: {
      systemPrompt: "You are a database performance expert. Focus on query optimization and scalability.",
      allowedTools: ["read", "write", "web_search", "bash"],
      maxTurns: 10,
    }
  }
}, {});
```

## Integration with Mastra Agents

### Specialized Development Agent

```typescript
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { claudeCodeTool } from "./tools/claude-code";

const developerAgent = new Agent({
  name: "Senior Developer",
  instructions: `
    You are a senior software developer with expertise in full-stack development.
    When asked about coding tasks, always use the Claude Code tool to:
    - Analyze code for best practices and potential issues
    - Create well-structured, production-ready code
    - Provide comprehensive solutions with proper error handling
    - Include tests and documentation when appropriate
    
    Use Claude Code for any task that involves:
    - Writing, reading, or modifying code
    - Running shell commands or scripts
    - Setting up development environments
    - Debugging applications
    - Performance analysis
  `,
  model: openai("gpt-4o"),
  tools: {
    claudeCode: claudeCodeTool,
  },
});

// Example usage
const response = await developerAgent.generate(
  "I need to build a secure authentication system for a Next.js application using JWT tokens."
);
```

### Code Review Agent

```typescript
const codeReviewAgent = new Agent({
  name: "Code Reviewer",
  instructions: `
    You are an expert code reviewer. Use Claude Code to:
    - Thoroughly analyze code for security vulnerabilities
    - Check for performance bottlenecks
    - Ensure code follows best practices and coding standards
    - Suggest improvements and refactoring opportunities
    - Validate test coverage and quality
  `,
  model: openai("gpt-4o"),
  tools: {
    claudeCode: claudeCodeTool,
  },
});
```

## Error Handling

The Claude Code tool includes comprehensive error handling:

```typescript
try {
  const result = await claudeCodeTool.execute({
    context: {
      prompt: "Your coding task here",
      options: {
        maxTurns: 5,
        permissionMode: "ask",
      }
    }
  }, {});
  
  if (result.metadata.hasErrors) {
    console.warn("Execution completed with errors");
    console.log("Tools called:", result.metadata.toolsCalled);
    console.log("Turns used:", result.metadata.turnsUsed);
  }
  
  console.log("Result:", result.result);
} catch (error) {
  console.error("Claude Code tool failed:", error.message);
}
```

## Best Practices

1. **Authentication**: Always ensure `ANTHROPIC_API_KEY` is set in your environment.

2. **Permission Modes**: 
   - Use `"ask"` for interactive environments where user confirmation is possible
   - Use `"allow"` for automated scripts where you trust the operations
   - Use `"deny"` to disable tool execution (Claude Code will work in analysis-only mode)

3. **Tool Restrictions**: Use `allowedTools` to limit which tools Claude Code can access for security.

4. **Turn Limits**: Set appropriate `maxTurns` based on task complexity to control costs and execution time.

5. **Error Handling**: Always check `metadata.hasErrors` and handle potential failures gracefully.

6. **Debugging**: Enable `debug: true` during development to see detailed execution logs.

## Security Considerations

- **API Key Management**: Store your Anthropic API key securely and never commit it to version control
- **Tool Permissions**: Be cautious with `permissionMode: "allow"` in production environments
- **Allowed Tools**: Restrict tool access using `allowedTools` when processing untrusted input
- **Rate Limiting**: Monitor API usage to avoid exceeding rate limits and unexpected costs

## Troubleshooting

### Common Issues

1. **Authentication Error**: Ensure `ANTHROPIC_API_KEY` environment variable is set correctly.

2. **Rate Limit Exceeded**: Implement retry logic with exponential backoff or reduce request frequency.

3. **Tool Execution Blocked**: Check permission modes and allowed tools configuration.

4. **Empty Results**: Verify the prompt is clear and specific enough for Claude Code to understand.

5. **Timeout Issues**: Increase `maxTurns` for complex tasks that require multiple iterations.

For more examples and advanced usage patterns, refer to the Claude Code SDK documentation at [https://docs.anthropic.com/en/docs/claude-code/sdk](https://docs.anthropic.com/en/docs/claude-code/sdk).