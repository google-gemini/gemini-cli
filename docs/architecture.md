# Gemini CLI Architecture Overview

This document provides a high-level overview of the Gemini CLI's architecture.

## Core components

The Gemini CLI is primarily composed of two main packages, along with a suite of tools that can be used by the system in the course of handling command-line input:

1.  **CLI package (`packages/cli`):**
    - **Purpose:** This contains the user-facing portion of the Gemini CLI, such as handling the initial user input, presenting the final output, and managing the overall user experience.
    - **Key functions contained in the package:**
      - [Input processing](./cli/commands.md)
      - History management
      - Display rendering
      - [Theme and UI customization](./cli/themes.md)
      - [CLI configuration settings](./cli/configuration.md)

2.  **Core package (`packages/core`):**
    - **Purpose:** This acts as the backend for the Gemini CLI. It receives requests sent from `packages/cli`, orchestrates interactions with the Gemini API, and manages the execution of available tools.
    - **Key functions contained in the package:**
      - API client for communicating with the Google Gemini API
      - Prompt construction and management
      - Tool registration and execution logic
      - State management for conversations or sessions
      - Server-side configuration

3.  **Tools (`packages/core/src/tools/`):**
    - **Purpose:** These are individual modules that extend the capabilities of the Gemini model, allowing it to interact with the local environment (e.g., file system, shell commands, web fetching).
    - **Interaction:** `packages/core` invokes these tools based on requests from the Gemini model.

## Interaction Flow

A typical interaction with the Gemini CLI follows this flow:

1.  **User input:** The user types a prompt or command into the terminal, which is managed by `packages/cli`.
2.  **Request to core:** `packages/cli` sends the user's input to `packages/core`.
3.  **Request processed:** The core package:
    - Constructs an appropriate prompt for the Gemini API, possibly including conversation history and available tool definitions.
    - Sends the prompt to the Gemini API.
4.  **Gemini API response:** The Gemini API processes the prompt and returns a response. This response might be a direct answer or a request to use one of the available tools.
5.  **Tool execution (if applicable):**
    - When the Gemini API requests a tool, the core package prepares to execute it.
    - If the requested tool can modify the file system or execute shell commands, the user is first given details of the tool and its arguments, and the user must approve the execution.
    - Read-only operations, such as reading files, might not require explicit user confirmation to proceed.
    - Once confirmed, or if confirmation is not required, the core package executes the relevant action within the relevant tool, and the result is sent back to the Gemini API by the core package.
    - The Gemini API processes the tool result and generates a final response.
6.  **Response to CLI:** The core package sends the final response back to the CLI package.
7.  **Display to user:** The CLI package formats and displays the response to the user in the terminal.

## Dynamic System Prompt Adaptation

The Gemini CLI features an intelligent dynamic prompt system that adapts the AI model's behavior based on the detected work context. This system enhances the model's effectiveness by providing context-specific guidance and best practices.

### Work Context Detection

The dynamic prompt system automatically analyzes the current working directory to understand:

1. **Project Type Detection**
   - Analyzes project structure and configuration files
   - Identifies patterns like `package.json` (Node.js), `Cargo.toml` (Rust), `requirements.txt` (Python)
   - Supports web applications, libraries, CLI tools, and various language ecosystems
   - Assigns confidence scores based on indicator strength

2. **Language Analysis**
   - Examines file extensions to determine dominant programming languages
   - Calculates language percentages across the codebase
   - Prioritizes the most commonly used languages for targeted guidance

3. **Framework Detection**
   - Scans dependency files (`package.json`, `Cargo.toml`, `go.mod`, etc.)
   - Identifies frameworks like React, Vue, Express, Django, Next.js
   - Detects framework-specific file patterns and configurations
   - Provides version information when available

4. **Git Repository State**
   - Determines if the directory is a Git repository
   - Analyzes current branch, dirty state, and commit status
   - Adapts workflow recommendations based on branch type (main, feature, bugfix, etc.)

5. **Tool Usage Patterns**
   - Analyzes recent tool calls to understand user workflow
   - Categories include file operations, development tasks, search/analysis, and testing
   - Adapts recommendations based on usage patterns

### Prompt Generation with Dynamic Sections

The system integrates dynamic sections into the base system prompt:

```typescript
// Core function signature
getCoreSystemPrompt(userMemory?: string, options?: DynamicPromptOptions): string

// Async helper for automatic context detection
getCoreSystemPromptWithContext(
  userMemory?: string, 
  config?: Config, 
  recentToolCalls?: CompletedToolCall[]
): Promise<string>
```

Dynamic sections are generated when:
- Dynamic prompts are enabled in configuration (`config.getDynamicPrompt() === true`)
- Work context is successfully detected
- Confidence thresholds are met for specific adaptations

### Configuration Options

Dynamic prompts are controlled through the `Config` class:

```typescript
interface ConfigParameters {
  dynamicPrompt?: boolean; // Default: false
  // ... other parameters
}

// Access method
config.getDynamicPrompt(): boolean
```

**Environment Variables:**
- No specific environment variables control dynamic prompts directly
- Inherits configuration from the main config system

### Performance Considerations and Caching

The system implements several optimizations:

1. **Session-based Caching**
   - Work context is cached per working directory during a session
   - Cache key format: `${projectPath}:${sessionKey}`
   - Prevents repeated analysis of the same project

2. **File Discovery Limits**
   - Maximum 500 files analyzed for language detection
   - Directory traversal depth limited to 10 levels
   - Respects `.gitignore` patterns automatically

3. **Graceful Degradation**
   - Silent failure when context detection encounters errors
   - Falls back to base prompt without dynamic sections
   - Non-blocking operation ensures CLI remains responsive

4. **Cache Management**
   ```typescript
   clearWorkContextCache(): void // Available for testing/reset
   ```

## Prompt System Architecture

### Integration Points

The dynamic prompt system integrates with several core components:

1. **Content Generator** (`packages/core/src/core/contentGenerator.ts`)
   - Calls `getCoreSystemPromptWithContext()` when generating model prompts
   - Passes current configuration and recent tool calls for context

2. **Work Context Detector** (`packages/core/src/utils/workContextDetector.ts`)
   - Implements all context detection logic
   - Provides structured `WorkContextInfo` interface
   - Handles cross-platform file system analysis

3. **Configuration System** (`packages/core/src/config/config.ts`)
   - Stores dynamic prompt enablement setting
   - Provides working directory and tool call history
   - Manages session-scoped preferences

### Dynamic Section Templates

The system includes pre-defined templates for common scenarios:

**Project-Specific Guidelines:**
- Web applications: UI/UX focus, state management, performance considerations
- Node libraries: API design, backward compatibility, testing requirements
- CLI tools: User experience, configuration, error handling
- Python packages: PEP 8 compliance, type hints, documentation standards

**Language-Specific Best Practices:**
- TypeScript: Type safety, interfaces, utility types
- Python: Code style, virtual environments, error handling
- Rust: Ownership system, error handling, memory safety
- JavaScript: Modern syntax, performance optimization

**Framework-Specific Instructions:**
- React: Functional components, hooks, performance optimization
- Django: Model design, views, templates, testing
- Express: Middleware, error handling, security
- Next.js: Routing strategies, rendering methods, optimization

**Git Workflow Adaptations:**
- Main branch: Stability focus, thorough review, CI/CD compliance
- Feature branches: Incremental development, testing, documentation
- Bugfix branches: Root cause analysis, regression tests, minimal impact

### Component Interaction Flow

```
User Request → CLI → Core → Content Generator
                              ↓
                         Config.getDynamicPrompt()
                              ↓
                    getCoreSystemPromptWithContext()
                              ↓
                         detectWorkContext()
                              ↓
                    [Cache Check] → [Analysis] → [Cache Store]
                              ↓
                    generateDynamicPromptSections()
                              ↓
                    Base Prompt + Dynamic Sections + User Memory
                              ↓
                         Model API Request
```

For detailed flow diagrams including work context detection, prompt generation, and integration points, see [Dynamic Prompt Flow Diagrams](./diagrams/dynamic-prompt-flow.md).

### Troubleshooting Dynamic Prompts

**Common Issues:**

1. **Dynamic Sections Not Appearing**
   - Verify `dynamicPrompt: true` in configuration
   - Check console for context detection warnings
   - Ensure project has recognizable indicators (package.json, etc.)

2. **Incorrect Project Type Detection**
   - Confidence threshold may be too low (< 0.5 for project type)
   - Mixed project types may cause ambiguous detection
   - Check `PROJECT_TYPE_INDICATORS` mapping for supported patterns

3. **Performance Issues**
   - Large codebases may slow initial detection
   - File discovery respects `.gitignore` and has built-in limits
   - Consider excluding large dependency directories

4. **Framework Detection Failures**
   - Framework confidence threshold: 0.6
   - Ensure dependencies are properly declared in manifest files
   - Check `FRAMEWORK_INDICATORS` for supported frameworks

**Debug Information:**
- Set debug mode in configuration for detailed logging
- Context detection errors are logged as warnings (non-blocking)
- Cache state can be inspected via `clearWorkContextCache()`

## Key Design Principles

- **Modularity:** Separating the CLI (frontend) from the Core (backend) allows for independent development and potential future extensions (e.g., different frontends for the same backend).
- **Extensibility:** The tool system is designed to be extensible, allowing new capabilities to be added.
- **User experience:** The CLI focuses on providing a rich and interactive terminal experience.
- **Context Awareness:** The dynamic prompt system provides intelligent adaptation based on project context while maintaining performance and reliability.

## Related Documentation

- [Dynamic Prompt Flow Diagrams](./diagrams/dynamic-prompt-flow.md) - Visual representations of the dynamic prompt system workflows
- [Core Package Documentation](./core/index.md) - Detailed information about the core package components
- [Tools API Documentation](./core/tools-api.md) - Information about the tool system that integrates with dynamic prompts
- [Configuration Guide](./cli/configuration.md) - How to configure the CLI including dynamic prompt settings
