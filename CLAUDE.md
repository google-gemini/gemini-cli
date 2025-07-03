# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working on the Sensei-AI project.

## Project Overview

This is the development repository for Sensei-AI, an adaptive learning assistant built on the Gemini CLI codebase. Sensei-AI provides personalized learning experiences that adapt to each user's understanding level and learning pace.

## Current Status

The project is currently in Phase 1 (MVP) development:
- ✅ Basic system prompt conversion to educational mode
- ✅ Environment setup for custom system prompts
- 🔄 Storage abstraction layer implementation
- 🔄 Educational tools development
- 🔄 Learning flow implementation

## Sensei-AI Development Commands

### Core Development Commands
- `npm run build` - Build the entire project
- `npm run build:packages` - Build only the core and CLI packages
- `npm run build:sandbox` - Build the sandbox environment
- `npm run clean` - Clean build artifacts

### Testing Commands
- `npm test` - Run all tests across workspaces
- `npm run test:ci` - Run CI tests with stricter settings
- `npm run test:e2e` - Run end-to-end integration tests
- `npm run test:integration:all` - Run all integration tests (none, docker, podman)
- `npm run test:integration:sandbox:none` - Run integration tests without sandbox

### Code Quality Commands
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run lint:ci` - Run ESLint with zero warnings for CI
- `npm run typecheck` - Run TypeScript type checking across workspaces
- `npm run format` - Format code with Prettier
- `npm run preflight` - Complete pre-release check (clean, install, format, lint, build, typecheck, test)

### Development Workflow
- `npm start` - Start Sensei-AI in development mode (requires `source .env` first)
- `npm run debug` - Start with Node.js debugger attached
- `npm run bundle` - Generate bundle for distribution

### Sensei-AI Specific Commands
- `source .env` - Load environment variables (including GEMINI_SYSTEM_MD)
- `node packages/cli/dist/index.js` - Direct start after sourcing .env
- `npm run build && source .env && node packages/cli/dist/index.js` - Full build and start

## Sensei-AI Architecture

Sensei-AI extends the Gemini CLI monorepo structure with educational-specific components:

### Educational Extensions
- **Custom System Prompt** - Located in `.gemini/sensei-ai-system-prompt.md`
- **Learning Context** - Educational context and learning guidance
- **Adaptive Learning Tools** - Tools designed for educational interactions
- **Progress Tracking** - Learning progress and understanding evaluation
- **Multi-Topic Management** - Support for parallel learning topics

### Base Architecture (Inherited from Gemini CLI)

This is a monorepo with a workspace structure containing two main packages:

### Core Package (`packages/core/`) - Educational Extensions
The foundational layer enhanced for educational use:
- **Gemini API Client** - Core communication with Gemini models (`core/client.ts`, `core/geminiChat.ts`)
- **Educational System Prompts** - Located in `core/prompts.ts` with override support
- **Tool System** - Extensible tool registry and execution framework (`tools/`)
  - File operations: read, write, edit, glob, grep
  - Shell command execution
  - MCP (Model Context Protocol) client for external tool servers
  - Web search and fetch capabilities
  - Memory management tools
  - **[PLANNED] Educational Tools**: Quiz generation, comprehension analysis, learning path creation
- **Content Generation** - Request processing and response handling (`core/contentGenerator.ts`)
- **Services** - File discovery, Git integration, telemetry (`services/`)
- **Authentication** - OAuth2 and API key management (`code_assist/`)
- **[PLANNED] Learning Storage** - User profiles, learning paths, progress tracking

### CLI Package (`packages/cli/`) - Educational Interface
The user-facing React-based terminal interface adapted for learning:
- **React Terminal UI** - Built with Ink for rich CLI experience (`src/ui/`)
- **Interactive Components** - Input handling, message display, authentication dialogs
- **Theme System** - Multiple color themes for different preferences (`ui/themes/`)
- **Command Processing** - Slash commands, shell integration, at-commands (`ui/hooks/`)
- **Session Management** - History, context, and state management
- **[PLANNED] Educational UI Components**: 
  - Checkpoint evaluation interface
  - Progress visualization
  - Topic switching commands
  - Understanding level indicators

### Key Integration Points
- **Tool Scheduling** - Coordinates between UI and core tool execution
- **Streaming** - Real-time response handling from Gemini API
- **Memory System** - Persistent context and conversation history
- **Sandbox Integration** - Docker/Podman support for isolated execution
- **MCP Support** - External tool server integration via Model Context Protocol
- **[PLANNED] Educational Integration**:
  - Learning progress persistence
  - Multi-topic context management
  - Adaptive content generation based on understanding levels
  - Checkpoint system for learning verification

### Configuration
- **Authentication** - Supports Google OAuth2, API keys, and workspace accounts
- **Settings** - JSON-based configuration with environment variable overrides
- **Sandbox** - Configurable execution environments (none/docker/podman)
- **Educational Configuration**:
  - `GEMINI_SYSTEM_MD` - Custom system prompt path (currently: `.gemini/sensei-ai-system-prompt.md`)
  - Learning data storage location (planned)
  - Adaptive learning settings (planned)

## Development Approach

The system follows a clean separation where the core package handles all AI and tool logic, while the CLI package focuses on user interface and interaction patterns. For Sensei-AI development:

1. **Maintain backward compatibility** with original Gemini CLI
2. **Extend, don't replace** - Add educational features alongside existing functionality
3. **Focus on educational UX** - Prioritize learning experience over technical features
4. **Implement incrementally** - Start with core educational features, expand gradually

## Implementation Priority

### Phase 1: Foundation (Current)
- [x] System prompt conversion
- [x] Environment setup
- [ ] Storage abstraction layer
- [ ] Basic educational tools
- [ ] Simple learning flow

### Phase 2: Core Features
- [ ] Checkpoint system
- [ ] Progress tracking
- [ ] Multi-topic management
- [ ] Adaptive content generation

### Phase 3: Advanced Features
- [ ] Learning analytics
- [ ] Recommendation system
- [ ] Collaborative learning
- [ ] External resource integration

## Important Notes for Development

- **System Prompt**: The educational system prompt is loaded from `.gemini/sensei-ai-system-prompt.md` via the `GEMINI_SYSTEM_MD` environment variable
- **Memory Files**: Consider using `LEARNING.md` instead of `GEMINI.md` for educational context
- **Tool Development**: New educational tools should be added to `packages/core/src/tools/educational/`
- **UI Components**: Educational UI components should be added to `packages/cli/src/ui/educational/`
- **Testing**: Educational features should have dedicated test suites

## Key Files for Sensei-AI Development

- `.gemini/sensei-ai-system-prompt.md` - Main educational system prompt
- `packages/core/src/core/prompts.ts` - System prompt loading logic
- `packages/core/src/tools/` - Tool implementation directory
- `packages/cli/src/ui/` - UI component directory
- `docs/ja/sensei-ai/` - Japanese documentation for Sensei-AI specifications