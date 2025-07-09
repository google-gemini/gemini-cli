# Trust CLI

**Trust: An Open System for Modern Assurance**

A privacy-focused, local-first AI command-line interface that puts you in control of your AI workflows. Trust CLI enables powerful AI interactions entirely on your own hardware - no cloud dependencies, no data leaving your machine.

## 🛡️ Key Features

- **100% Local Execution** - All AI inference runs on your hardware
- **Privacy First** - Your data never leaves your machine
- **Multi-Format Support** - 10 models across 6 formats (Llama, Phi, Qwen, Mistral, Gemma, DeepSeek)
- **Smart Recommendations** - Task-specific model suggestions with RAM-aware filtering
- **Model Management** - Download, verify, and manage GGUF models locally
- **Performance Monitoring** - Real-time system metrics and optimization
- **Hardware-Aware** - Automatic optimization based on your system specs
- **Cryptographic Security** - SHA-256 verification for all models
- **Transparent** - Open source with full audit trail

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/audit-brands/trust-cli.git
cd trust-cli

# Install dependencies
npm install

# Build the project
npm run build

# Bundle for production use
npm run bundle

# Run Trust CLI
node bundle/trust.js
```

### First Steps

**IMPORTANT**: All trust commands are run from your **regular terminal** (not from within the trust CLI interface).

Navigate to your trust-cli directory and run commands using the following format:

1. **Check available models**
   ```bash
   # From your regular terminal in the trust-cli directory:
   node bundle/trust.js model list
   ```

2. **Download a model** (start with the lightweight one)
   ```bash
   node bundle/trust.js model download qwen2.5-1.5b-instruct
   ```

3. **Verify model integrity**
   ```bash
   node bundle/trust.js model verify qwen2.5-1.5b-instruct
   ```

4. **Switch to the downloaded model**
   ```bash
   node bundle/trust.js model switch qwen2.5-1.5b-instruct
   ```

5. **Start interactive mode** (optional)
   ```bash
   node bundle/trust.js
   ```

### 💡 Create an Alias for Easier Use

To avoid typing `node bundle/trust.js` every time, create an alias:

```bash
# Option 1: Using full path (recommended for permanent setup)
# Add this to your ~/.zshrc (macOS) or ~/.bashrc (Linux):
alias trust="node /full/path/to/your/trust-cli/bundle/trust.js"

# Option 2: Using current directory (works from trust-cli folder)
# Add this to your ~/.zshrc file:
alias trust="node $(pwd)/bundle/trust.js"

# Reload your shell configuration:
source ~/.zshrc  # or source ~/.bashrc

# Now you can run commands simply as:
trust model list
trust model download qwen2.5-1.5b-instruct
trust model recommend coding
```

## 📦 Model Management

Trust CLI provides comprehensive model management capabilities:

### List Available Models
```bash
node bundle/trust.js model list
# or with alias: trust model list
```
Shows all available models with their status, RAM requirements, and trust scores.

### Download Models
```bash
node bundle/trust.js model download <model-name>
# or with alias: trust model download <model-name>
```
Downloads models from Hugging Face with real-time progress tracking:
- Progress percentage, speed, and ETA
- Automatic integrity verification
- Resume support for interrupted downloads

### Verify Model Integrity
```bash
node bundle/trust.js model verify <model-name>
# or verify all models:
node bundle/trust.js model verify
# or with alias: trust model verify
```
Performs SHA256 hash verification to ensure model integrity and security.

### Switch Active Model
```bash
node bundle/trust.js model switch <model-name>
# or with alias: trust model switch <model-name>
```
Changes the active model for inference operations.

### Get Model Recommendations
```bash
node bundle/trust.js model recommend <task-type>
# or with alias: trust model recommend <task-type>
```
Get intelligent model recommendations based on your task and hardware:
- `coding` - Phi models optimized for programming tasks
- `multilingual` - Mistral models for international/translation work
- `reasoning` - DeepSeek models for complex analysis
- `quick` - Qwen models for fast responses
- `context` - Large context models for document processing
- `quality` - Highest trust score models within RAM limits

### Delete Models
```bash
trust model delete <model-name>
```
Remove downloaded models to free up disk space.

## 📊 Performance Monitoring

Trust CLI includes comprehensive performance monitoring tools:

### Quick Status
```bash
trust perf status
```
Shows current system status including CPU, memory, and heap usage.

### Detailed Report
```bash
trust perf report
```
Comprehensive system performance report with:
- System resources (CPU, RAM, load averages)
- Node.js memory details
- Inference performance history
- Hardware specifications

### Real-time Monitoring
```bash
trust perf watch
```
Live performance monitoring with updates every second. Press Ctrl+C to stop.

### Optimization Suggestions
```bash
trust perf optimize
```
Get personalized recommendations for optimal model settings based on your hardware:
- Recommended RAM allocation
- Optimal context sizes
- Best quantization methods
- Model suggestions for your system

## 🛡️ Privacy & Security Management

Trust CLI offers three privacy modes for different security requirements:

### Privacy Modes
```bash
trust privacy list          # View all available privacy modes
trust privacy status        # Show current privacy configuration
trust privacy switch strict # Switch to strict privacy mode
trust privacy info moderate # Get detailed info about moderate mode
```

**Available Modes:**
- **Strict**: Maximum privacy - no external connections, mandatory verification
- **Moderate**: Balanced privacy and functionality - recommended for most users
- **Open**: Full functionality for development and testing

## 💬 Advanced Chat & Context Management

### Streaming Conversations
```bash
trust chat                  # Start interactive chat with streaming
trust chat --model phi-3.5-mini-instruct  # Use specific model
```

### Codebase Analysis
```bash
trust analyze ./src         # Analyze entire codebase
trust context --files "*.ts" --importance high  # Add specific files
```

### Git Integration
```bash
trust git status           # Analyze repository status
trust git review           # AI-powered code review
trust git suggest-commit   # Generate commit messages
```

## 🎯 Benchmarking & Testing

### Performance Benchmarks
```bash
trust benchmark run        # Run comprehensive benchmark suite
trust benchmark quick      # Quick performance test
trust benchmark compare    # Compare multiple models
```

### Model Testing
```bash
trust test model <name>    # Test specific model performance
trust test inference       # Test inference pipeline
trust test streaming       # Test streaming capabilities
```

## 📚 Offline Help System

### Comprehensive Documentation
```bash
trust help                 # Main help menu
trust help models          # Model management help
trust help performance     # Performance monitoring help
trust help privacy         # Privacy and security help
trust help search <query>  # Search help topics
```

### Interactive UI
```bash
trust ui                   # Launch advanced terminal UI
trust ui models            # Interactive model manager
trust ui benchmark         # Live benchmarking interface
```

## 🤖 Available Models

Trust CLI now supports **10 models** across **6 different model formats** with intelligent task-specific recommendations:

### **Lightweight Models (2-4GB RAM)**
| Model | Format | Parameters | RAM | Context | Description | Trust Score |
|-------|--------|------------|-----|---------|-------------|-------------|
| **qwen2.5-1.5b-instruct** | Qwen | 1.5B | 2GB | 4K | Ultra-fast for quick responses | 8.8/10 |
| **gemma-2-2b-instruct** | Gemma | 2.6B | 3GB | 8K | Compact Google model with larger context | 8.9/10 |
| **phi-3.5-mini-instruct** | Phi | 3.8B | 3GB | 4K | Optimized for coding and technical tasks | 9.5/10 |
| **phi-3.5-mini-uncensored** | Phi | 3.8B | 3GB | 4K | Uncensored for risk analysis & auditing | 9.3/10 |
| **llama-3.2-3b-instruct** | Llama | 3B | 4GB | 4K | Balanced performance for general use | 9.2/10 |

### **Mid-Range Models (6-8GB RAM)**
| Model | Format | Parameters | RAM | Context | Description | Trust Score |
|-------|--------|------------|-----|---------|-------------|-------------|
| **mistral-7b-instruct** | Mistral | 7B | 6GB | 8K | Efficient multilingual model | 9.1/10 |
| **deepseek-r1-distill-7b** | DeepSeek | 7.6B | 6GB | 4K | Advanced reasoning for complex analysis | 9.6/10 |
| **llama-3.1-8b-instruct** | Llama | 8B | 8GB | 4K | High-quality responses for complex tasks | 9.7/10 |
| **gemma-2-9b-instruct** | Gemma | 9B | 8GB | 8K | Advanced Google model with strong performance | 9.3/10 |

### **Large Context Models (10GB+ RAM)**
| Model | Format | Parameters | RAM | Context | Description | Trust Score |
|-------|--------|------------|-----|---------|-------------|-------------|
| **mistral-nemo-12b-instruct** | Mistral | 12B | 10GB | 128K | Massive context for document analysis | 9.4/10 |

### 📥 Downloading Models

**All models** can be downloaded directly without authentication:

**Lightweight Models (Great for getting started):**
```bash
trust model download qwen2.5-1.5b-instruct     # 1.8GB - Ultra-fast responses
trust model download gemma-2-2b-instruct       # 1.6GB - Google's compact model
trust model download phi-3.5-mini-instruct     # 2.4GB - Excellent for coding
trust model download llama-3.2-3b-instruct     # 1.9GB - Balanced general use
```

**Mid-Range Models (Best performance/resource balance):**
```bash
trust model download mistral-7b-instruct       # 4.4GB - Great for multilingual
trust model download deepseek-r1-distill-7b    # 4.5GB - Advanced reasoning & analysis
trust model download llama-3.1-8b-instruct     # 4.9GB - Highest quality responses
trust model download gemma-2-9b-instruct       # 5.4GB - Advanced Google model
```

**Large Context Models (For document processing):**
```bash
trust model download mistral-nemo-12b-instruct # 6.9GB - 128K context window
```

**Specialized Models:**
```bash
trust model download phi-3.5-mini-uncensored   # 2.4GB - Risk analysis & auditing
```

### 🎯 **Smart Model Recommendations**

Use Trust CLI's intelligent recommendation system to get the perfect model for your task:

```bash
trust model recommend coding        # → Recommends Phi models
trust model recommend multilingual  # → Recommends Mistral models  
trust model recommend reasoning     # → Recommends DeepSeek models
trust model recommend quick         # → Recommends Qwen models
trust model recommend context       # → Recommends Mistral Nemo (128K context)
trust model recommend --ram 16      # → Shows models that fit in 16GB RAM
```

### **Model Selection Guide by Use Case:**

**🚀 Getting Started (2-4GB RAM):**
- **`qwen2.5-1.5b-instruct`**: Start here - fastest responses, minimal resources
- **`gemma-2-2b-instruct`**: More capable, 8K context window
- **`phi-3.5-mini-instruct`**: Best for coding and technical work

**💼 Professional Work (6-8GB RAM):**
- **`mistral-7b-instruct`**: Multilingual projects, efficient performance
- **`deepseek-r1-distill-7b`**: Complex analysis, step-by-step reasoning
- **`llama-3.1-8b-instruct`**: Highest quality general responses

**📚 Document & Research Work (10GB+ RAM):**
- **`mistral-nemo-12b-instruct`**: 128K context for processing entire documents

**🔍 Security & Risk Analysis:**
- **`phi-3.5-mini-uncensored`**: For auditors who need unfiltered model responses

All models use community GGUF conversions that are publicly accessible.

#### HF Authentication (Future Use)

Trust-cli supports Hugging Face authentication for future gated models:

```bash
# Set up authentication (for gated models in the future)
trust auth login --hf-token YOUR_TOKEN

# Check authentication status
trust auth status

# Remove authentication
trust auth logout
```

Currently, all included models are publicly accessible without authentication.

## 🔧 Configuration

Trust CLI stores its configuration and models in `~/.trustcli/`:
- `models/` - Downloaded model files
- `models.json` - Model configurations and metadata
- `config.json` - CLI settings

### Environment Variables

- `TRUST_MODEL` - Override default model selection
- `TRUST_MODELS_DIR` - Custom models directory location

## 💡 Examples

### Interactive Mode
Start Trust CLI and have a conversation:
```bash
trust
> How can I optimize this Python function for better performance?
```

### Direct Prompts
Run one-off queries:
```bash
trust -p "Explain the concept of quantum computing in simple terms"
```

### File Analysis
Analyze code or documents:
```bash
trust -p "Review this code for security vulnerabilities" < app.js
```

## 📁 Working with Files

Trust CLI provides powerful file operations for creating, reading, and modifying files. Understanding how to prompt for file operations is key to effective usage.

### 🎯 Creating Files: Prompt Strategies

The key to getting Trust CLI to create files is being **explicit about filesystem operations**:

#### ✅ **Successful File Creation Prompts:**

**Interactive Mode (Recommended):**
```bash
trust
> Generate Python code to analyze data.csv with pandas
[Model shows code]
> Save that code to a file named analyze.py
[Model creates the file]
```

**Command Line - Explicit Filesystem Language:**
```bash
trust -p "Save to disk a Python script named analyze.py that reads data.csv using pandas"
trust -p "Create a new file called config.json containing these settings: {...}"
trust -p "Write to the filesystem: a shell script named deploy.sh that builds and deploys the app"
```

**Advanced File Creation Commands:**
```bash
# Method 1: Direct tool reference (most explicit)
trust -p "Use the Write tool to create analyze.py with pandas code for BankChurners.csv"

# Method 2: Filesystem-specific verbs (clear intent)  
trust -p "Save the following to disk as analyze.py: Python code that reads CSV files"

# Method 3: Explicit file path (absolute clarity)
trust -p "Create /home/user/analyze.py file containing Python pandas code"
```

**When to use each method:**
- **Method 1** (Tool reference): When you need guaranteed file creation and the model isn't responding to other prompts
- **Method 2** (Filesystem verbs): Best balance of clarity and natural language - recommended for most use cases
- **Method 3** (Explicit paths): When working with specific directories or when relative paths might be ambiguous

**Two-Step Instructions:**
```bash
trust -p "I need you to: 1) Generate Python code for CSV analysis, and 2) Save it to analyze.py"
```

#### ❌ **Common Prompts That Only Show Code:**

```bash
trust -p "Create a Python script for data analysis"     # Too ambiguous
trust -p "Write Python code to read CSV files"          # Sounds like composition
trust -p "Generate a data analysis program"             # No file operation implied
```

### 📖 **Reading and Analyzing Files**

Trust CLI can read and analyze existing files in your directory:

```bash
# Interactive mode
trust
> Read the file data.csv and show me the first few rows
> Analyze the structure of config.json and suggest improvements
> Compare the data in sales_q1.csv and sales_q2.csv

# Command line
trust -p "Read requirements.txt and explain what each dependency is for"
trust -p "Analyze app.py for potential security vulnerabilities"
trust -p "Find all TODO comments in the files in this directory"
```

### 🔧 **Modifying Existing Files**

```bash
# Interactive mode
trust
> Read analyze.py and add error handling to the CSV reading function
> Update the config.json file to include the new database settings

# Command line  
trust -p "Add logging statements to the main function in app.py"
trust -p "Update requirements.txt to include pandas version 2.0"
```

### 💡 **Best Practices for File Operations**

1. **Be Explicit About Intent:**
   - ✅ "Save to disk" / "Write to filesystem" / "Create a file"
   - ❌ "Create" / "Write" / "Generate" (ambiguous)

2. **Use Two-Step Instructions:**
   - First: Generate/create the content
   - Second: Save/write it to a specific file

3. **Specify File Paths Clearly:**
   ```bash
   trust -p "Create ./scripts/backup.sh with a bash script that backs up the database"
   ```

4. **Interactive Mode for Complex Operations:**
   - Better context preservation
   - Natural conversation flow
   - Easier to iterate and refine

### 🗂️ **File System Navigation**

Trust CLI understands your current directory and can work with relative paths:

```bash
trust -p "List all Python files in this directory and summarize their purpose"
trust -p "Find all CSV files and create a data processing script for each one"
trust -p "Read the README.md and create a summary document"
```

### 📝 **Common File Creation Patterns**

**Configuration Files:**
```bash
trust -p "Save a package.json file for a Node.js project with these dependencies: express, axios"
```

**Scripts and Automation:**
```bash
trust -p "Create deploy.sh that builds the project and uploads to the server"
```

**Data Analysis:**
```bash
trust -p "Generate analyze_sales.py that reads sales.csv and creates monthly revenue charts"
```

**Documentation:**
```bash
trust -p "Create API_DOCS.md documenting the REST endpoints in server.js"
```

The key insight: Trust CLI models interpret "create/write code" as showing you code, but "save/write to disk/create a file" as filesystem operations!

## 🛠️ Available Tools Reference

Trust CLI provides a comprehensive set of tools that models can use to interact with your system. Understanding these tools helps you craft better prompts and understand what's possible.

### 📁 **File Operations**

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| **`read_file`** | Read file contents with optional line ranges | "Read the config.json file" |
| **`write_file`** | Create new files or overwrite existing ones | "Save this code to app.py" |
| **`edit`** | Make targeted edits to existing files | "Add error handling to line 50 in server.js" |
| **`ls`** | List directory contents | "Show me all files in the src directory" |

### 🔍 **Search & Discovery**

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| **`grep`** | Search file contents using regex patterns | "Find all TODO comments in Python files" |
| **`glob`** | Find files by name patterns | "List all .env files in the project" |
| **`read_many_files`** | Read multiple files efficiently | "Read all configuration files" |

### 🌐 **Web & Network**

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| **`web_fetch`** | Fetch and analyze web pages | "Get the latest documentation from this URL" |
| **`web_search`** | Search the web for information | "Search for Node.js best practices" |

### 💻 **System Operations**

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| **`shell`** | Execute shell commands | "Run npm install and show the output" |

### 🧠 **Memory & Context**

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| **`memory_tool`** | Manage conversation memory and context | Automatically used for context management |

### 🔌 **Extensibility**

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| **`mcp_tool`** | Interface with Model Context Protocol servers | Custom integrations and extensions |

### 🎯 **How to Use Tools Effectively**

**Explicit Tool References:**
```bash
# Direct tool usage (most reliable)
trust -p "Use the read_file tool to show me the contents of package.json"
trust -p "Use the write_file tool to create a new script called deploy.sh"
```

**Natural Language (Trust CLI interprets intent):**
```bash
# Models understand these and select appropriate tools
trust -p "Read the README file and summarize the installation steps"
trust -p "Search for all functions named 'authenticate' in the codebase"
trust -p "Create a backup script for the database"
```

**Interactive Mode Tool Usage:**
```bash
trust
> Read the main configuration file
> Now edit it to add the new database settings
> Save the changes and show me a diff
```

### 📋 **Tool Capabilities & Limitations**

**File Operations:**
- ✅ Read files of any size (with chunking for large files)
- ✅ Create new files with any content
- ✅ Edit existing files with precise line-by-line changes
- ✅ Handle binary files (images, etc.) appropriately
- ⚠️ Some operations may require confirmation in interactive mode

**Search Operations:**
- ✅ Fast regex search across multiple files
- ✅ Glob pattern matching for file discovery
- ✅ Context-aware search results
- ⚠️ Large repositories may have performance implications

**Shell Operations:**
- ✅ Full bash command execution
- ✅ Environment variable access
- ✅ Background process support
- ⚠️ Commands require confirmation for security
- ⚠️ Destructive operations may be blocked

**Web Operations:**
- ✅ Fetch and analyze web content
- ✅ Search engines integration
- ✅ Markdown conversion of HTML content
- ⚠️ Respects robots.txt and rate limits

### 💡 **Tool Usage Tips**

1. **Be Specific About File Paths:**
   ```bash
   trust -p "Read ./src/config/database.js"  # Clear path
   ```

2. **Combine Multiple Operations:**
   ```bash
   trust -p "Find all .js files, read the main ones, and create a project overview"
   ```

3. **Use Interactive Mode for Complex Workflows:**
   ```bash
   trust
   > Search for authentication functions
   > Read the main auth file
   > Add rate limiting to the login function
   > Test the changes
   ```

4. **Leverage Tool Combinations:**
   ```bash
   trust -p "Use grep to find API endpoints, then read those files and document the API"
   ```

These tools make Trust CLI powerful for development workflows, code analysis, documentation, and automation tasks!

## 🎯 Solving Local AI Challenges

Trust CLI directly addresses the core challenges of local AI deployment:

### **Performance Gap Solution**
- **Smart Model Recommendations:** Automatic task-optimized model selection
- **Hardware-Aware Optimization:** Real-time performance tuning based on your system
- **Performance Monitoring:** Live metrics and optimization suggestions
```bash
trust model recommend coding  # Get optimal model for coding tasks
trust perf optimize          # Get personalized performance tips
```

### **Memory Management Solution**
- **Intelligent Model Swapping:** RAM-aware model switching with validation
- **Quantization Optimization:** Automatic selection of optimal compression levels
- **Resource Monitoring:** Real-time memory usage tracking and warnings
```bash
System RAM: 16GB | Available: 8GB | Recommended: phi-3.5-mini-instruct (4GB)
```

### **Model Compatibility Solution**
- **Universal Interface:** Unified API across all model types (Llama, Phi, Qwen, etc.)
- **Auto-Detection System:** Automatic model type and format recognition
- **Standardized Configuration:** Consistent model handling and optimization

### **Trust & Verification Innovation**
- **Cryptographic Integrity:** SHA256 hash verification for all models
- **Community Trust Scoring:** Transparent model quality ratings
- **Provenance Tracking:** Complete model download and verification history

## 🏗️ Architecture

Trust CLI is built on modern, secure foundations:

- **node-llama-cpp** - High-performance C++ inference engine
- **GGUF Format** - Efficient quantized model format
- **SHA256 Verification** - Cryptographic integrity checking
- **TypeScript** - Type-safe, maintainable codebase
- **React + Ink** - Beautiful terminal UI components

## 🔒 Privacy & Security

Trust CLI is designed with privacy as the top priority:

1. **No Network Calls** - Except for initial model downloads from Hugging Face
2. **Local Storage Only** - All data stays on your machine
3. **Cryptographic Verification** - All models are SHA256 verified
4. **Open Source** - Fully auditable codebase
5. **No Telemetry** - We don't track anything

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Run tests
npm test

# Run end-to-end tests
node test-end-to-end.js
```

## 📝 License

This project is licensed under the Apache License 2.0 - See [LICENSE](LICENSE) file for details.

## 🙏 Attribution & Acknowledgments

Trust CLI is based on [Google's Gemini CLI](https://github.com/google-gemini/gemini-cli), modified to use local GGUF models instead of cloud APIs for complete privacy and local-first AI workflows.

**Original Work:**
- **Source**: [Google Gemini CLI](https://github.com/google-gemini/gemini-cli)
- **Copyright**: 2025 Google LLC
- **License**: Apache License 2.0
- **Attribution**: Original Gemini CLI code is Copyright Google LLC

**Derivative Work:**
- **Trust CLI**: Copyright 2025 Audit Risk Media LLC
- **Modifications**: Complete replacement of cloud APIs with local model inference, addition of privacy features, model management, performance monitoring, and comprehensive test suite
- **License**: Apache License 2.0 (same as original)

For detailed attribution and list of modifications, see [NOTICE](NOTICE) file.

We're grateful for the excellent foundation provided by Google's original Gemini CLI project.

## 🛠️ Troubleshooting

### "OAuth/Google authentication required" Error

If you're getting OAuth authentication errors when expecting local model inference, you may have legacy settings from an earlier version. Fix this by updating your authentication mode:

```bash
# Quick fix - update settings to use local models
echo '{
  "selectedAuthType": "trust-local",
  "theme": "GitHub"
}' > ~/.gemini/settings.json
```

**Alternative manual fix:**
```bash
# Edit your settings file
nano ~/.gemini/settings.json

# Change "oauth-personal" to "trust-local"
# Change: "selectedAuthType": "oauth-personal"
# To: "selectedAuthType": "trust-local"
```

After updating, restart trust-cli and it should use local models instead of trying to authenticate with Google.

### "No model loaded" Error

This usually means you need to download a model first:

```bash
# Download the lightweight model
node bundle/trust.js model download qwen2.5-1.5b-instruct

# Switch to the downloaded model
node bundle/trust.js model switch qwen2.5-1.5b-instruct

# Verify the model is loaded
node bundle/trust.js model list
```

### Models Not Showing After Git Pull/Rebuild

If you're only seeing 4 models instead of 6 after pulling updates, this is usually a caching issue:

**Step 1: Clear Trust CLI Cache**
```bash
# Clear all trust-cli cached data
rm -rf ~/.trustcli

# Also clear legacy cache if it exists
rm -rf ~/.gemini
```

**Step 2: Force Clean Rebuild (if cache clearing doesn't work)**
```bash
# Force clean everything
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf packages/*/dist
rm -rf bundle
rm -f package-lock.json
rm -f packages/*/package-lock.json

# Fresh install and build
npm install
npm run build
npm run bundle
```

**Step 3: Update Your Alias**
```bash
# Test with direct path first
node bundle/trust.js model list

# Update your alias to current directory
alias trust="node $(pwd)/bundle/trust.js"

# Make permanent by adding to ~/.zshrc or ~/.bashrc
echo 'alias trust="node /full/path/to/your/trust-cli/bundle/trust.js"' >> ~/.zshrc
source ~/.zshrc
```

**Step 4: Verify All 10 Models Appear**
You should see all models across 6 different formats:
- **Qwen**: qwen2.5-1.5b-instruct (1.5B, 2GB)
- **Gemma**: gemma-2-2b-instruct (2.6B, 3GB), gemma-2-9b-instruct (9B, 8GB)
- **Phi**: phi-3.5-mini-instruct (3.8B, 3GB), phi-3.5-mini-uncensored (3.8B, 3GB)
- **Llama**: llama-3.2-3b-instruct (3B, 4GB), llama-3.1-8b-instruct (8B, 8GB)
- **Mistral**: mistral-7b-instruct (7B, 6GB), mistral-nemo-12b-instruct (12B, 10GB)
- **DeepSeek**: deepseek-r1-distill-7b (7.6B, 6GB)

### TypeScript Build Errors on Node.js v24+

If you encounter TypeScript build errors on newer Node.js versions:

```bash
# Pull the latest fixes
git pull origin main

# Rebuild
npm run build
npm run bundle
```

## 🛟 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/audit-brands/trust-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/audit-brands/trust-cli/discussions)

---

**Trust: An Open System for Modern Assurance**

Built with ❤️ for privacy, transparency, and local-first AI.