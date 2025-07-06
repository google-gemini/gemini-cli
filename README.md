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

1. **Check available models**
   ```bash
   trust model list
   ```

2. **Download a model** (start with the lightweight one)
   ```bash
   trust model download qwen2.5-1.5b-instruct
   ```

3. **Verify model integrity**
   ```bash
   trust model verify qwen2.5-1.5b-instruct
   ```

4. **Switch to the downloaded model**
   ```bash
   trust model switch qwen2.5-1.5b-instruct
   ```

## 📦 Model Management

Trust CLI provides comprehensive model management capabilities:

### List Available Models
```bash
trust model list
```
Shows all available models with their status, RAM requirements, and trust scores.

### Download Models
```bash
trust model download <model-name>
```
Downloads models from Hugging Face with real-time progress tracking:
- Progress percentage, speed, and ETA
- Automatic integrity verification
- Resume support for interrupted downloads

### Verify Model Integrity
```bash
trust model verify <model-name>
# or verify all models
trust model verify
```
Performs SHA256 hash verification to ensure model integrity and security.

### Switch Active Model
```bash
trust model switch <model-name>
```
Changes the active model for inference operations.

### Get Model Recommendations
```bash
trust model recommend <task-type>
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

Apache 2.0 - See [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Trust CLI is a fork of Google's Gemini CLI, transformed into a privacy-focused, local-first tool. We're grateful for the excellent foundation provided by the original project.

## 🛟 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/audit-brands/trust-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/audit-brands/trust-cli/discussions)

---

**Trust: An Open System for Modern Assurance**

Built with ❤️ for privacy, transparency, and local-first AI.