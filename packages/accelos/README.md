# Accelos AI Agent

A powerful AI agent built using the Mastra framework for TypeScript. Accelos provides intelligent assistance with file analysis, code review, web search, and general AI tasks.

## Features

- **File Analysis**: Analyze files for content, structure, security issues, and insights
- **Code Analysis**: Review code quality, complexity, and provide improvement suggestions  
- **Web Search**: Search the web and get summarized results
- **Multi-LLM Support**: Works with Google Gemini, OpenAI, and Anthropic models
- **TypeScript**: Full type safety and excellent developer experience

## Installation

```bash
npm install @google/gemini-cli-accelos
```

## Quick Start

```typescript
import { AccelosAgent, defaultConfig } from '@google/gemini-cli-accelos';

// Initialize the agent
const agent = new AccelosAgent({
  ...defaultConfig,
  apiKey: process.env.GOOGLE_API_KEY,
  llmProvider: 'google',
  model: 'gemini-2.0-flash-exp'
});

// Chat with the agent
const response = await agent.chat('Help me analyze this codebase');
console.log(response);

// Analyze a file
const analysis = await agent.analyzeFile('./src/index.ts', 'all');
console.log(analysis);

// Search the web
const searchResults = await agent.searchWeb('Mastra AI framework', 5);
console.log(searchResults);

// Analyze code
const codeAnalysis = await agent.analyzeCode(codeString, 'typescript');
console.log(codeAnalysis);
```

## Configuration

The agent supports the following configuration options:

```typescript
interface AccelosConfig {
  llmProvider: 'openai' | 'google' | 'anthropic';
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  dataDirectoryPath: string;
}
```

### Environment Variables

Set your API key and configuration using environment variables:

- `GOOGLE_API_KEY` - For Google Gemini models
- `OPENAI_API_KEY` - For OpenAI models  
- `ANTHROPIC_API_KEY` - For Anthropic Claude models
- `ACCELOS_GUARDRAIL_FILE_PATH` - Path to the guardrails JSON file
- `RCA_DIRECTORY_PATH` - Path to the RCA documents directory

### Guardrails and RCA Configuration

The agent supports configurable paths for guardrails and RCA documents:

- `dataDirectoryPath` - Path to the data directory containing RCA docs and guardrails (default: `./data`)

You can customize these paths in several ways:

**Via Environment Variables:**
```bash
export ACCELOS_GUARDRAIL_FILE_PATH="./custom/path/to/guardrails.json"
export RCA_DIRECTORY_PATH="./custom/path/to/rcas"
```

**Via Configuration:**
```typescript
const agent = new AccelosAgent({
  ...defaultConfig,
  dataDirectoryPath: './custom/data/path'
});
```

**Via .env File:**
```env
ACCELOS_GUARDRAIL_FILE_PATH=./custom/path/to/guardrails.json
RCA_DIRECTORY_PATH=./custom/path/to/rcas
```

## Available Tools

### File Analyzer Tool
Analyzes files and provides insights about content, structure, and security:

```typescript
await agent.analyzeFile('/path/to/file.js', 'all');
```

### Web Search Tool
Searches the web and returns relevant results:

```typescript
await agent.searchWeb('TypeScript best practices', 5);
```

### Code Analysis Tool
Reviews code quality, complexity, and provides suggestions:

```typescript
await agent.analyzeCode(codeString, 'typescript');
```

## Example Usage

Run the example script to see all features in action:

```bash
npm run build
node dist/example.js
```

## Built with Mastra

This agent is built using the [Mastra framework](https://mastra.ai/), a TypeScript framework for building AI applications with agents, tools, and workflows.

## License

MIT