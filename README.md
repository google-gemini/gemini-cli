# Trust CLI

**Trust: An Open System for Modern Assurance**

A privacy-focused, local-first AI command-line interface that puts you in control of your AI workflows. Trust CLI enables powerful AI interactions entirely on your own hardware - no cloud dependencies, no data leaving your machine.

## 🛡️ Key Features

- **100% Local Execution** - All AI inference runs on your hardware
- **Privacy First** - Your data never leaves your machine
- **Model Management** - Download, verify, and manage GGUF models locally
- **Performance Monitoring** - Real-time system metrics and optimization
- **Hardware-Aware** - Automatic optimization based on your system specs
- **Transparent** - Open source with cryptographic model verification

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
- `coding` - Best models for programming tasks
- `quick` - Fast models for simple queries  
- `complex` - High-quality models for detailed work
- `default` - Balanced general-purpose models

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

| Model | Parameters | RAM | Description | Trust Score |
|-------|------------|-----|-------------|-------------|
| **qwen2.5-1.5b-instruct** | 1.5B | 2GB | Lightweight model for quick responses | 8.8/10 |
| **llama-3.2-3b-instruct** | 3B | 8GB | Balanced performance for general use | 9.2/10 |
| **phi-3.5-mini-instruct** | 3.8B | 4GB | Optimized for coding and technical tasks | 9.5/10 |
| **llama-3.1-8b-instruct** | 8B | 16GB | High-quality responses for complex tasks | 9.7/10 |

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

## 🛟 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/audit-brands/trust-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/audit-brands/trust-cli/discussions)

---

**Trust: An Open System for Modern Assurance**

Built with ❤️ for privacy, transparency, and local-first AI.