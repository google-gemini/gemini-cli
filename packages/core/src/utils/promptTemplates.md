# Prompt Templates Module

This module provides dynamic prompt templates for different work contexts, enabling context-aware AI assistance based on project type, programming language, frameworks, git state, and tool usage patterns.

## Overview

The `promptTemplates.ts` module contains functions that generate contextual guidance prompts for various development scenarios. It works in conjunction with the `workContextDetector.ts` module to provide tailored assistance.

## Core Functions

### `getProjectTypePrompt(projectType: string): string`
Returns project-specific guidance based on detected project type.

**Supported project types:**
- `web-application` - Modern web development practices
- `node-library` - Node.js library development
- `cli-tool` - Command-line tool development
- `python-package` - Python package development
- `python-application` - Python application development
- `rust-application` / `rust-library` - Rust development
- `go-application` / `go-library` - Go development
- `java-application` - Java application development
- `documentation` - Documentation projects
- `configuration` - Infrastructure and configuration

### `getLanguagePrompt(language: string): string`
Returns language-specific best practices and guidelines.

**Supported languages:**
- TypeScript, JavaScript, Python, Rust, Go, Java, C++, C#, PHP, Ruby

### `getFrameworkPrompt(framework: string): string`
Returns framework-specific development guidance.

**Supported frameworks:**
- Frontend: React, Vue, Angular, Svelte, Next.js, Nuxt
- Backend: Express, FastAPI, Django, Flask, Spring
- And more...

### `getGitWorkflowPrompt(gitState: GitState): string`
Returns Git workflow guidance based on repository state.

**Considers:**
- Repository status (dirty, ahead/behind counts)
- Current branch
- Whether it's a Git repository

### `getToolUsagePrompt(toolPatterns: ToolUsagePattern[]): string`
Returns guidance based on recent tool usage patterns.

**Tool categories:**
- `file-operations` - File manipulation activities
- `development` - Active coding and development
- `search-analysis` - Code analysis and exploration
- `testing-building` - Testing and build activities

## Comprehensive Context Function

### `createContextualPrompt(...): string`
Combines multiple context types into a comprehensive prompt.

```typescript
const prompt = createContextualPrompt(
  projectType,    // ProjectTypeInfo
  languages,      // LanguageInfo[]
  frameworks,     // FrameworkInfo[]
  gitState,       // GitState
  toolPatterns    // ToolUsagePattern[]
);
```

## Specialized Templates

The module also provides specialized templates for common scenarios:

- `getReactTypeScriptTemplate()` - React + TypeScript web apps
- `getNodeExpressTemplate()` - Node.js + Express APIs
- `getPythonDataScienceTemplate()` - Python data science projects
- `getCLIToolTemplate()` - CLI tool development
- `getLibraryPackageTemplate()` - Library/package development
- `getFallbackTemplate()` - General development guidance

## Usage Examples

### Basic Usage

```typescript
import { getProjectTypePrompt, getLanguagePrompt } from './promptTemplates.js';

// Get project-specific guidance
const webAppGuidance = getProjectTypePrompt('web-application');

// Get language-specific guidance
const tsGuidance = getLanguagePrompt('TypeScript');
```

### Comprehensive Context

```typescript
import { createContextualPrompt } from './promptTemplates.js';
import { detectWorkContext } from './workContextDetector.js';

// Detect current work context
const context = await detectWorkContext('/path/to/project');

// Generate comprehensive guidance
const prompt = createContextualPrompt(
  context.projectType,
  context.dominantLanguages,
  context.frameworks,
  context.gitState,
  context.toolUsagePatterns
);
```

### Specialized Templates

```typescript
import { getReactTypeScriptTemplate } from './promptTemplates.js';

// Get specialized React + TypeScript guidance
const reactGuidance = getReactTypeScriptTemplate();
```

## Integration with Work Context Detector

This module is designed to work seamlessly with the `workContextDetector.ts` module:

1. Use `detectWorkContext()` to analyze the current project
2. Pass the detected context to `createContextualPrompt()` for comprehensive guidance
3. Or use individual template functions for specific aspects

## Template Structure

Each template includes guidance on:

- **Best Practices** - Language/framework-specific conventions
- **Testing Approaches** - Appropriate testing strategies
- **Performance Considerations** - Optimization techniques
- **Security Aspects** - Security best practices
- **Build and Deployment** - Build configuration and deployment strategies
- **Documentation** - Documentation standards and practices

## Customization

The templates are designed to be:

- **Modular** - Individual functions for specific contexts
- **Composable** - Multiple templates can be combined
- **Extensible** - Easy to add new project types, languages, or frameworks
- **Configurable** - Templates filter based on confidence levels and percentages

## Error Handling

- Unknown project types, languages, or frameworks fall back to generic guidance
- Low-confidence detections are filtered out to avoid noise
- Empty or invalid inputs return appropriate fallback content

## Testing

The module includes comprehensive tests covering:
- All supported project types and languages
- Framework-specific templates
- Git workflow scenarios
- Tool usage patterns
- Contextual prompt generation
- Specialized templates

Run tests with:
```bash
npm test -- promptTemplates.test.ts
```