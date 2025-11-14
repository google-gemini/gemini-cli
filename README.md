# LLM CLI

[![CI](https://github.com/Root1856/LLM-cli/workflows/CI/badge.svg)](https://github.com/Root1856/LLM-cli/actions)
[![Version](https://img.shields.io/npm/v/llm-cli.svg)](https://www.npmjs.com/package/llm-cli)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**LLM CLI** is a powerful, open-source AI assistant that brings large language models directly into your terminal. Originally built on Google's Gemini CLI foundation, it has been enhanced to be **local-first and provider-agnostic**, giving you the flexibility to use any LLM - whether running locally on your machine or in the cloud.

## 🚀 Why LLM CLI?

### 🏠 **Local-First Philosophy**
- **💰 Privacy**: Run models locally - your data never leaves your machine
- **🆓 Cost-Free**: No API costs when using local models
- **✈️ Offline**: Work without internet connectivity
- **🎛️ Full Control**: Use any model you want, including custom fine-tuned models

### 🔌 **Multi-Provider Support**
- **Local LLMs**: LM Studio, Ollama, LocalAI, llama.cpp
- **Cloud Providers**: Google Gemini, Vertex AI, OpenAI, Anthropic (coming soon)
- **OpenAI-Compatible APIs**: Any service implementing OpenAI's API format

### 💪 **Powerful Features**
- 🧠 **Advanced Code Understanding**: Query and edit large codebases
- 🛠️ **Built-in Tools**: File operations, shell commands, web search
- 🔧 **Extensible**: MCP (Model Context Protocol) support
- 💻 **Terminal-Native**: Designed for developers who live in the command line
- 🎯 **Context-Aware**: Custom context files (LLM.md) for project-specific behavior

## 📦 Quick Start

### Installation

```bash
# Install globally with npm
npm install -g llm-cli

# Or run directly with npx (no installation required)
npx llm-cli
```

### Using with Local LLMs ⭐ (Recommended)

#### Option 1: LM Studio (Easiest for Beginners)

1. **Install LM Studio** from https://lmstudio.ai/
2. **Download a model** (e.g., Llama 3.1 8B, Mistral 7B, Qwen 2.5)
3. **Start the local server** in LM Studio (typically http://localhost:1234/v1)
4. **Configure LLM CLI**:

```bash
export LOCAL_LLM_BASE_URL=http://localhost:1234/v1
export LOCAL_LLM_MODEL=llama-3.1-8b-instruct
llm
```

Or create `~/.llmcli/settings.json`:

```json
{
  "localLLM": {
    "baseURL": "http://localhost:1234/v1",
    "model": "llama-3.1-8b-instruct"
  }
}
```

#### Option 2: Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.1

# Configure LLM CLI
export LOCAL_LLM_BASE_URL=http://localhost:11434/v1
export LOCAL_LLM_MODEL=llama3.1
llm
```

**📚 See [LOCAL_LLM_SETUP.md](LOCAL_LLM_SETUP.md) for comprehensive local LLM setup guide**

### Using with Cloud Providers

#### Google Gemini (Free Tier Available)

```bash
# Get your key from https://aistudio.google.com/apikey
export GEMINI_API_KEY="your-api-key"
llm
```

**Free tier**: 60 requests/min, 1,000 requests/day with Gemini 2.5 Pro (1M context window)

## 🎯 Usage Examples

### Interactive Mode

```bash
# Start in current directory
llm

# Include specific directories
llm --include-directories ../lib,../docs

# Use specific model (cloud or local)
llm -m gemini-2.5-flash
```

### Non-Interactive Mode (for Scripts/Automation)

```bash
# Simple text response
llm -p "Explain the architecture of this codebase"

# JSON output for parsing in scripts
llm -p "List all functions in main.py" --output-format json

# Stream events for long-running tasks
llm -p "Run tests and deploy" --output-format stream-json
```

### Common Workflows

#### 🆕 Start a New Project
```bash
cd my-new-project/
llm
> Write me a REST API for a todo app using Express.js with SQLite
```

#### 🔍 Code Review
```bash
git clone https://github.com/your/repo
cd repo
llm
> Review the changes in the last commit and suggest improvements
```

#### 🐛 Debug Issues
```bash
llm
> The app crashes when I submit the form. Help me debug this.
```

#### 📝 Generate Documentation
```bash
llm -p "Generate comprehensive README.md for this project"
```

## 🔐 Supported Providers

### Local LLMs (No API Key Required) ⭐

| Provider | Default URL | Best For | Setup Difficulty |
|----------|------------|----------|------------------|
| **LM Studio** | `http://localhost:1234/v1` | Beginners, GUI lovers | ⭐ Easy |
| **Ollama** | `http://localhost:11434/v1` | Mac/Linux power users | ⭐⭐ Medium |
| **LocalAI** | `http://localhost:8080/v1` | Docker enthusiasts | ⭐⭐ Medium |
| **llama.cpp** | Custom | Advanced users | ⭐⭐⭐ Hard |

### Cloud Providers (API Key Required)

| Provider | Free Tier | Context Window | Cost |
|----------|-----------|----------------|------|
| **Google Gemini** | ✅ 60 req/min | 1M tokens | Free → $$ |
| **Vertex AI** | ❌ | 1M tokens | $$$ |
| **OpenAI** | ❌ | 128K tokens | $$ |

## ⚙️ Configuration

### Environment Variables

```bash
# === Local LLM (Recommended) ===
LOCAL_LLM_BASE_URL=http://localhost:1234/v1
LOCAL_LLM_MODEL=llama-3.1-8b-instruct
LOCAL_LLM_API_KEY=optional-key-if-needed

# === Cloud Providers ===
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key

# === Advanced Options ===
LLM_SANDBOX=docker              # Enable sandbox mode
LLM_DEBUG=true                  # Enable debug logging
```

### Settings File

Create or edit `~/.llmcli/settings.json`:

```json
{
  "localLLM": {
    "baseURL": "http://localhost:1234/v1",
    "model": "llama-3.1-8b-instruct"
  },
  "model": {
    "name": "auto",
    "maxSessionTurns": 100
  },
  "tools": {
    "autoAccept": false
  }
}
```

## 🌟 Key Features

### 💻 Code Understanding & Generation
- Query and edit large codebases with full context awareness
- Generate new applications from descriptions, PDFs, or images
- Debug complex issues with natural language
- Refactor code with AI-powered suggestions

### 🤖 Automation & Integration
- Automate operational tasks (PRs, code reviews, deployments)
- Use MCP servers for custom tool integrations
- Run non-interactively in CI/CD pipelines
- GitHub Actions integration available

### 🎯 Advanced Capabilities
- **Google Search Grounding**: Get real-time information
- **Checkpointing**: Save and resume complex sessions
- **Custom Context**: Project-specific behavior via LLM.md files
- **Tool Calling**: Execute functions and shell commands
- **Streaming Responses**: Real-time token-by-token generation

## 📚 Documentation

### Getting Started
- **[Local LLM Setup Guide](LOCAL_LLM_SETUP.md)** ⭐ **Start here for local models**
- [Quick Start Guide](docs/get-started/quickstart.md)
- [Authentication Options](docs/get-started/authentication.md)
- [Configuration Reference](docs/get-started/configuration.md)

### Features
- [Commands Reference](docs/features/commands.md)
- [Context Files (LLM.md)](docs/features/context-files.md)
- [Built-in Tools](docs/features/tools.md)
- [MCP Server Integration](docs/features/mcp.md)
- [Keyboard Shortcuts](docs/get-started/keyboard-shortcuts.md)

### Advanced
- [Custom Extensions](docs/advanced/extensions.md)
- [Headless Mode & Scripting](docs/advanced/headless.md)
- [IDE Integration](docs/advanced/ide-integration.md)
- [Sandboxing & Security](docs/advanced/sandboxing.md)
- [Architecture Overview](docs/advanced/architecture.md)

## 🔨 Development

```bash
# Clone the repository
git clone https://github.com/Root1856/LLM-cli.git
cd LLM-cli

# Install dependencies
npm install

# Build all packages
npm run build

# Run in development mode
npm start

# Run tests
npm test
```

## 🤝 Contributing

We welcome contributions! This is a community-driven project focused on making AI accessible to everyone.

Ways to contribute:
- 🐛 [Report bugs](https://github.com/Root1856/LLM-cli/issues)
- 💡 [Suggest features](https://github.com/Root1856/LLM-cli/issues/new)
- 📖 [Improve documentation](https://github.com/Root1856/LLM-cli/pulls)
- 🔧 [Submit code improvements](https://github.com/Root1856/LLM-cli/pulls)
- 🌐 Share your MCP servers and extensions

See our [Contributing Guide](CONTRIBUTING.md) for development setup and coding standards.

## 📋 Comparison

### LLM CLI vs. Original Gemini CLI

| Feature | LLM CLI | Gemini CLI |
|---------|---------|------------|
| **Local LLM Support** | ✅ Built-in (LM Studio, Ollama, etc.) | ❌ Not available |
| **Provider Flexibility** | ✅ Multiple providers | ❌ Google only |
| **Offline Capability** | ✅ Yes (with local LLM) | ❌ Requires internet |
| **Privacy** | ✅ Full control, data stays local | ⚠️ Cloud-dependent |
| **Free Usage** | ✅ Unlimited (with local models) | ⚠️ Rate limited (60 req/min) |
| **Cloud Options** | ✅ Gemini, OpenAI, Anthropic | ✅ Gemini only |
| **Tool Ecosystem** | ✅ Same (MCP, file ops, etc.) | ✅ Same |
| **Terminal UI** | ✅ Same excellent TUI | ✅ Excellent TUI |

## 🌈 Example Use Cases

### For Software Developers
- **Code Review**: "Review this PR and suggest security improvements"
- **Bug Fixing**: "Debug why this React component re-renders infinitely"
- **Refactoring**: "Refactor this class to use composition over inheritance"
- **Testing**: "Generate unit tests for all public methods"
- **Documentation**: "Create JSDoc comments with examples"

### For DevOps Engineers
- **Infrastructure**: "Write Terraform config for a load-balanced ECS cluster"
- **CI/CD**: "Create a GitHub Actions workflow with caching"
- **Monitoring**: "Analyze these application logs and identify the bottleneck"
- **Scripting**: "Write a bash script to automate database backups"

### For Data Scientists
- **Analysis**: "Perform exploratory data analysis on sales.csv"
- **ML Pipeline**: "Build a sklearn pipeline with feature engineering"
- **Visualization**: "Create interactive plots with plotly"
- **Optimization**: "Tune hyperparameters for this XGBoost model"

## 💡 Tips & Best Practices

### Getting the Most from Local LLMs

1. **Model Selection**: Start with 7B-8B models for speed, use 13B+ for quality
2. **Context Management**: Keep sessions focused on specific tasks
3. **GPU Acceleration**: Enable GPU in LM Studio/Ollama for 10x speed boost
4. **Quantization**: Use Q4 or Q5 quantized models for best speed/quality balance
5. **RAM Requirements**: 8GB RAM for 7B models, 16GB for 13B, 32GB+ for 70B

### General Tips

- Use `LLM.md` context files for project-specific instructions
- Enable sandbox mode (`LLM_SANDBOX=docker`) for untrusted operations
- Use checkpointing for long sessions: `/checkpoint save my-session`
- Leverage MCP servers for domain-specific tools
- Run with `--output-format json` for script integration

## 🎓 Learning Resources

- [Video Tutorials](docs/tutorials/README.md)
- [Example Workflows](docs/examples/README.md)
- [FAQ](docs/FAQ.md)
- [Troubleshooting Guide](docs/troubleshooting.md)
- [Best Practices](docs/best-practices.md)

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

This project is a fork of [Google's Gemini CLI](https://github.com/google-gemini/gemini-cli), enhanced to support local LLMs and multiple providers while maintaining full compatibility with the original feature set.

## 🙏 Acknowledgments

- **Based on**: [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) - Excellent foundation and architecture
- **Powered by**: [OpenAI API](https://platform.openai.com/docs/api-reference) standard for local LLM compatibility
- **Supports**: [MCP (Model Context Protocol)](https://modelcontextprotocol.io) for extensibility
- **Inspired by**: The local-first and privacy-focused philosophy

Special thanks to all the contributors who make this project possible!

## 🔗 Links

- [GitHub Repository](https://github.com/Root1856/LLM-cli)
- [Issue Tracker](https://github.com/Root1856/LLM-cli/issues)
- [NPM Package](https://www.npmjs.com/package/llm-cli)
- [Documentation Site](docs/README.md)
- [Local LLM Setup Guide](LOCAL_LLM_SETUP.md)
- [Contributing Guide](CONTRIBUTING.md)

## ⭐ Support the Project

If you find LLM CLI useful, please:
- ⭐ Star this repository
- 🐦 Share it on social media
- 📝 Write about your experience
- 🤝 Contribute code or documentation
- 💬 Help others in [Discussions](https://github.com/Root1856/LLM-cli/discussions)

---

**Made with ❤️ by the community**
**Privacy-focused • Local-first • Multi-provider • Open Source**

**Get started now**: `npm install -g llm-cli` or run `npx llm-cli`
