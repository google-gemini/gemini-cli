# LM Studio CLI - AI Coding Agent 🤖🚀

[![License](https://img.shields.io/github/license/google-gemini/gemini-cli)](https://github.com/google-gemini/gemini-cli/blob/main/LICENSE)

```
 ██╗     ███╗   ███╗    ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
 ██║     ████╗ ████║    ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
 ██║     ██╔████╔██║    ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
 ██║     ██║╚██╔╝██║    ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
 ███████╗██║ ╚═╝ ██║    ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
 ╚══════╝╚═╝     ╚═╝    ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
                    🤖 AI Coding Agent 🚀
```

**LM Studio CLI** is a powerful AI coding agent that brings local LLM capabilities directly
into your terminal. Built on the excellent foundation of Gemini CLI, it's been adapted
to work seamlessly with LM Studio, giving you privacy-focused, local AI assistance with
full tool-use capabilities.

## 🚀 Why LM Studio CLI?

- **🏠 100% Local**: Run completely offline with LM Studio - your code never leaves your machine
- **🧠 Extended Reasoning**: Built-in support for thinking models like DeepSeek R1, QwQ, and more
- **🔧 Built-in tools**: File operations, shell commands, web fetching, and more
- **🔌 Extensible**: MCP (Model Context Protocol) support for custom integrations
- **💻 Terminal-first**: Designed for developers who live in the command line
- **🛡️ Open source**: Apache 2.0 licensed
- **⚡ Fast**: Direct connection to your local LM Studio instance
- **🎯 Tool-Use Ready**: Works with any tool-use capable model

## 📦 Installation & Setup

### Pre-requisites

1. **Node.js version 20 or higher**
2. **LM Studio** installed and running ([Download here](https://lmstudio.ai/))
3. **macOS, Linux, or Windows**

### Step 1: Install LM Studio CLI

#### From source (recommended)

```bash
# Clone this repository
git clone https://github.com/yourusername/LM-studio-CLI.git
cd LM-studio-CLI

# Install dependencies
npm install

# Build the project
npm run build

# Link globally
npm link
```

### Step 2: Set up LM Studio

1. **Download and start LM Studio**
2. **Load a model** with tool-use capabilities (recommended models):
   - Hermes 2 Pro (Mistral/Llama)
   - Qwen 2.5
   - DeepSeek R1 (for extended reasoning)
   - QwQ (for complex reasoning tasks)
   - Any other tool-use capable model

3. **Start the local server**:
   - In LM Studio, go to the "Local Server" tab
   - Click "Start Server"
   - Default: `http://localhost:1234`

### Step 3: Configure Environment (Optional)

Create a `.env` file in your project or set environment variables:

```bash
# Optional: Customize LM Studio connection
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"
export LM_STUDIO_MODEL="local-model"
export LM_STUDIO_API_KEY="lm-studio"  # Default, can be anything
```

### Step 4: Run!

```bash
# Start the CLI
gemini

# Or run directly
npm start
```

## 📋 Key Features

### 🤖 Code Understanding & Generation

- Query and edit large codebases with context-aware assistance
- Generate new functionality with natural language descriptions
- Debug issues and troubleshoot with AI-powered insights
- Refactor code with intelligent suggestions

### 🔧 Built-in Tool System

All tools work seamlessly with any tool-use capable model:

- **File Operations**: Read, write, edit files
- **Shell Commands**: Execute terminal commands safely
- **Web Fetching**: Retrieve web content for context
- **Code Search**: Find and analyze code patterns
- **Git Integration**: Manage version control

### 🧠 Extended Reasoning Support

Perfect for models that need to "think":

- **Up to 65K tokens** for reasoning (configurable)
- Optimized for models like **DeepSeek R1** and **QwQ**
- Automatic detection of reasoning-capable models
- Streaming support for long-running thoughts

### 🔌 MCP Protocol Support

- Connect custom MCP servers for extended capabilities
- Build your own integrations
- Use community MCP servers

### 💾 Session Management

- Save and resume conversations
- Checkpoint complex sessions
- Review conversation history

### 🎯 Privacy-First

- **100% local** - your code never leaves your machine
- No API keys required (beyond local auth)
- No telemetry by default
- Complete control over your data

## 🔐 Authentication Options

Choose the authentication method that best fits your needs:

### Option 1: Login with Google (OAuth login using your Google Account)

**✨ Best for:** Individual developers as well as anyone who has a Gemini Code
Assist License. (see
[quota limits and terms of service](https://cloud.google.com/gemini/docs/quotas)
for details)

**Benefits:**

- **Free tier**: 60 requests/min and 1,000 requests/day
- **Gemini 2.5 Pro** with 1M token context window
- **No API key management** - just sign in with your Google account
- **Automatic updates** to latest models

#### Start Gemini CLI, then choose _Login with Google_ and follow the browser authentication flow when prompted

```bash
gemini
```

#### If you are using a paid Code Assist License from your organization, remember to set the Google Cloud Project

```bash
# Set your Google Cloud Project
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
gemini
```

### Option 2: Gemini API Key

**✨ Best for:** Developers who need specific model control or paid tier access

**Benefits:**

- **Free tier**: 100 requests/day with Gemini 2.5 Pro
- **Model selection**: Choose specific Gemini models
- **Usage-based billing**: Upgrade for higher limits when needed

```bash
# Get your key from https://aistudio.google.com/apikey
export GEMINI_API_KEY="YOUR_API_KEY"
gemini
```

### Option 3: Vertex AI

**✨ Best for:** Enterprise teams and production workloads

**Benefits:**

- **Enterprise features**: Advanced security and compliance
- **Scalable**: Higher rate limits with billing account
- **Integration**: Works with existing Google Cloud infrastructure

```bash
# Get your key from Google Cloud Console
export GOOGLE_API_KEY="YOUR_API_KEY"
export GOOGLE_GENAI_USE_VERTEXAI=true
gemini
```

For Google Workspace accounts and other authentication methods, see the
[authentication guide](./docs/get-started/authentication.md).

## 🚀 Getting Started

### Basic Usage

#### Start in current directory

```bash
gemini
```

#### Include multiple directories

```bash
gemini --include-directories ../lib,../docs
```

#### Use specific model

```bash
gemini -m gemini-2.5-flash
```

#### Non-interactive mode for scripts

Get a simple text response:

```bash
gemini -p "Explain the architecture of this codebase"
```

For more advanced scripting, including how to parse JSON and handle errors, use
the `--output-format json` flag to get structured output:

```bash
gemini -p "Explain the architecture of this codebase" --output-format json
```

For real-time event streaming (useful for monitoring long-running operations),
use `--output-format stream-json` to get newline-delimited JSON events:

```bash
gemini -p "Run tests and deploy" --output-format stream-json
```

### Quick Examples

#### Start a new project

```bash
cd new-project/
gemini
> Write me a Discord bot that answers questions using a FAQ.md file I will provide
```

#### Analyze existing code

```bash
git clone https://github.com/google-gemini/gemini-cli
cd gemini-cli
gemini
> Give me a summary of all of the changes that went in yesterday
```

## 📚 Documentation

### Getting Started

- [**Quickstart Guide**](./docs/get-started/index.md) - Get up and running
  quickly.
- [**Authentication Setup**](./docs/get-started/authentication.md) - Detailed
  auth configuration.
- [**Configuration Guide**](./docs/get-started/configuration.md) - Settings and
  customization.
- [**Keyboard Shortcuts**](./docs/cli/keyboard-shortcuts.md) - Productivity
  tips.

### Core Features

- [**Commands Reference**](./docs/cli/commands.md) - All slash commands
  (`/help`, `/chat`, etc).
- [**Custom Commands**](./docs/cli/custom-commands.md) - Create your own
  reusable commands.
- [**Context Files (GEMINI.md)**](./docs/cli/gemini-md.md) - Provide persistent
  context to Gemini CLI.
- [**Checkpointing**](./docs/cli/checkpointing.md) - Save and resume
  conversations.
- [**Token Caching**](./docs/cli/token-caching.md) - Optimize token usage.

### Tools & Extensions

- [**Built-in Tools Overview**](./docs/tools/index.md)
  - [File System Operations](./docs/tools/file-system.md)
  - [Shell Commands](./docs/tools/shell.md)
  - [Web Fetch & Search](./docs/tools/web-fetch.md)
- [**MCP Server Integration**](./docs/tools/mcp-server.md) - Extend with custom
  tools.
- [**Custom Extensions**](./docs/extensions/index.md) - Build and share your own
  commands.

### Advanced Topics

- [**Headless Mode (Scripting)**](./docs/cli/headless.md) - Use Gemini CLI in
  automated workflows.
- [**Architecture Overview**](./docs/architecture.md) - How Gemini CLI works.
- [**IDE Integration**](./docs/ide-integration/index.md) - VS Code companion.
- [**Sandboxing & Security**](./docs/cli/sandbox.md) - Safe execution
  environments.
- [**Trusted Folders**](./docs/cli/trusted-folders.md) - Control execution
  policies by folder.
- [**Enterprise Guide**](./docs/cli/enterprise.md) - Deploy and manage in a
  corporate environment.
- [**Telemetry & Monitoring**](./docs/cli/telemetry.md) - Usage tracking.
- [**Tools API Development**](./docs/core/tools-api.md) - Create custom tools.
- [**Local development**](./docs/local-development.md) - Local development
  tooling.

### Troubleshooting & Support

- [**Troubleshooting Guide**](./docs/troubleshooting.md) - Common issues and
  solutions.
- [**FAQ**](./docs/faq.md) - Frequently asked questions.
- Use `/bug` command to report issues directly from the CLI.

### Using MCP Servers

Configure MCP servers in `~/.gemini/settings.json` to extend Gemini CLI with
custom tools:

```text
> @github List my open pull requests
> @slack Send a summary of today's commits to #dev channel
> @database Run a query to find inactive users
```

See the [MCP Server Integration guide](./docs/tools/mcp-server.md) for setup
instructions.

## 🤝 Contributing

We welcome contributions! Gemini CLI is fully open source (Apache 2.0), and we
encourage the community to:

- Report bugs and suggest features.
- Improve documentation.
- Submit code improvements.
- Share your MCP servers and extensions.

See our [Contributing Guide](./CONTRIBUTING.md) for development setup, coding
standards, and how to submit pull requests.

Check our [Official Roadmap](https://github.com/orgs/google-gemini/projects/11)
for planned features and priorities.

## 📖 Resources

- **[Official Roadmap](./ROADMAP.md)** - See what's coming next.
- **[Changelog](./docs/changelogs/index.md)** - See recent notable updates.
- **[NPM Package](https://www.npmjs.com/package/@google/gemini-cli)** - Package
  registry.
- **[GitHub Issues](https://github.com/google-gemini/gemini-cli/issues)** -
  Report bugs or request features.
- **[Security Advisories](https://github.com/google-gemini/gemini-cli/security/advisories)** -
  Security updates.

### Uninstall

See the [Uninstall Guide](docs/cli/uninstall.md) for removal instructions.

## 📄 Legal

- **License**: [Apache License 2.0](LICENSE)
- **Terms of Service**: [Terms & Privacy](./docs/tos-privacy.md)
- **Security**: [Security Policy](SECURITY.md)

---

<p align="center">
  Built with ❤️ by Google and the open source community
</p>
