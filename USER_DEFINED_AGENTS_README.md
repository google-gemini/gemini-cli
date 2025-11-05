# User-Defined Agents for Gemini CLI

This fork adds a complete system for creating, loading, and using custom
specialized agents in Gemini CLI.

## 🎯 What This Adds

A flexible agent system that lets users create specialized AI assistants for
specific tasks, with:

- **TOML-based agent definitions** stored in `~/.gemini/agents/`
- **Automatic agent discovery** at CLI startup
- **Visual distinction** with icons and metadata
- **LLM awareness** - the system prompt dynamically lists available agents
- **AI-assisted creation** via `/new-agent` command

## 🚀 Key Features

### 1. Create Agents via `/new-agent`

Two modes for creating agents:

**Quick Mode** - AI expands your brief description:

```bash
/new-agent "a unit test generator for JavaScript"
```

**Interactive Mode** - Step-by-step guidance:

```bash
/new-agent
```

The AI will:

- Generate a complete agent definition with smart defaults
- Create a properly formatted TOML file
- Validate the configuration
- Save to `~/.gemini/agents/<agent_name>.toml`

### 2. View All Agents with `/agents`

Lists all loaded agents with detailed information:

- Icon and display name
- Description
- Source (built-in vs user-defined)
- Model configuration
- Available tools
- Input parameters
- File location

### 3. Automatic LLM Integration

The system prompt dynamically includes:

```markdown
## Specialized Agents

You have access to specialized agents for specific tasks:

- **🧪 Test Writer** (`test_writer`): Generates comprehensive unit tests
- **👋 Greeter** (`greeter`): Provides friendly greetings
- **📝 Doc Generator** (`doc_generator`): Creates API documentation

When a task matches an agent's domain, prefer using that agent.
```

### 4. Agent Definition Format

Agents are defined in TOML with full type safety:

```toml
name = "test_writer"
displayName = "🧪 Test Writer"
description = "Generates comprehensive unit tests for code"
icon = "🧪"

# Model config
model = "gemini-2.5-pro"
temperature = 0.1
maxTimeMinutes = 5
maxTurns = 15

# Tools available to the agent
tools = ["read", "grep", "glob"]

# Agent's system instructions
systemPrompt = """
You are a test writing expert...
"""

# Initial query template
query = "Generate tests for ${target_file}"

# Input parameters
[inputs.target_file]
type = "string"
description = "Path to file to generate tests for"
required = true

[inputs.test_framework]
type = "string"
description = "Testing framework to use"
required = false
```

## 📋 Implementation Details

### Architecture

**Core Components:**

- `AgentFileLoader` - Parses TOML files from `~/.gemini/agents/`
- `AgentRegistry` - Manages agent registration and discovery
- `SubagentToolWrapper` - Exposes agents as callable tools
- System prompt integration - Dynamic agent listing

**User Interface:**

- `/agents` command with formatted display
- Agent icons in thought streams and completions
- Extension system for agent creation

**Security:**

- Read-only tool allowlist for user agents
- Workspace directory validation
- TOML parsing with error handling

### Files Changed

**New Files:**

- `packages/core/src/agents/file-loader.ts` (287 lines)
- `packages/cli/src/ui/commands/agentsCommand.ts`
- `packages/cli/src/ui/components/views/AgentsList.tsx`
- `~/.gemini/extensions/agent-creator/` (complete extension)

**Modified Files:**

- `packages/core/src/agents/registry.ts` - User agent loading
- `packages/core/src/config/storage.ts` - Agent directory path
- `packages/core/src/core/prompts.ts` - Dynamic agent listing
- `packages/cli/src/config/config.ts` - Workspace + tool registration
- `packages/core/src/agents/invocation.ts` - Icon display
- Multiple UI type definitions

## 🎮 Usage Examples

### Creating a Documentation Agent

```bash
/new-agent "generates API documentation from TypeScript code"
```

The AI creates:

```toml
name = "api_doc_generator"
displayName = "📚 API Doc Generator"
description = "Generates comprehensive API documentation from TypeScript"
icon = "📚"
tools = ["read", "read_many_files", "glob"]
# ... full configuration
```

### Using an Agent

After restart, simply ask:

```
> Can you document the API endpoints in src/api/?
```

The LLM recognizes this matches your `api_doc_generator` agent and uses it
automatically!

### Viewing Loaded Agents

```bash
/agents
```

Shows all agents with full details including icons, descriptions, and
configurations.

## 🔧 Technical Highlights

1. **Type-Safe Parsing**: Uses Zod schemas for runtime validation
2. **Tool Allowlist**: Security-first with read-only tools only
3. **Metadata Support**: Icons, colors, source tracking
4. **Dynamic System Prompt**: Agents appear automatically in LLM context
5. **Graceful Error Handling**: Malformed agents logged but don't break startup
6. **Example Agents**: Includes reference implementations

## 🎯 Use Cases

- **Test Generation**: Agents specialized for Jest, Vitest, Pytest, etc.
- **Documentation**: API docs, README generation, code comments
- **Code Review**: Security audits, style checks, architecture reviews
- **Refactoring**: Legacy code migration, dependency updates
- **Domain Experts**: Database queries, UI/UX patterns, DevOps tasks

## 🔗 Links

- **Fork**: https://github.com/jduncan-rva/gemini-cli
- **Branch**: `feature/user-defined-agents`
- **Upstream**: https://github.com/google-gemini/gemini-cli

## 📝 Status

- ✅ Core implementation complete
- ✅ UI components working
- ✅ System prompt integration
- ✅ Extension for agent creation
- ✅ Example agents included
- ✅ All tests passing
- ✅ Linting clean

## 🤝 Contributing

This is a fork demonstrating the user-defined agents feature. If you're
interested in this functionality for the main Gemini CLI:

1. Try it out:
   `git clone https://github.com/jduncan-rva/gemini-cli.git -b feature/user-defined-agents`
2. Test the feature
3. Provide feedback on the approach

## 🙏 Credits

Implementation by Claude Code working with @jduncan-rva

Based on the excellent Gemini CLI by the Google Gemini team.
