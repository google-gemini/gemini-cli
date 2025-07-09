# Trust CLI Multi-Model Setup Guide

## 🎯 Overview

Trust CLI supports three different AI backends with intelligent fallback, giving you complete choice over your AI inference approach while maintaining privacy-first principles.

## 🚀 Quick Start Guide

### Option 1: Ollama (Recommended)
**Best for**: Fast setup, excellent performance, easy model management

```bash
# 1. Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Start Ollama service
ollama serve

# 3. Pull a model
ollama pull qwen2.5:1.5b

# 4. Trust CLI automatically detects and uses Ollama
trust
```

### Option 2: Trust Local Models
**Best for**: Complete offline operation, fine-grained control

```bash
# 1. Download models directly
trust model download qwen2.5-1.5b-instruct

# 2. Switch to downloaded model
trust model switch qwen2.5-1.5b-instruct

# 3. Trust CLI uses Trust Local automatically
trust
```

### Option 3: Cloud Models (Fallback)
**Best for**: Maximum performance, latest capabilities

```bash
# 1. Enable cloud fallback
trust config set ai.cloud.enabled true

# 2. Configure authentication
trust auth login --provider google

# 3. Trust CLI uses cloud when local models unavailable
trust
```

## 🔧 Architecture Details

### Backend Selection Order
Trust CLI tries backends in this order:
1. **Ollama** (if running on localhost:11434)
2. **Trust Local** (if GGUF models downloaded)
3. **Cloud** (if configured and enabled)

### Intelligent Fallback
- **Automatic Detection**: Trust CLI checks each backend's availability
- **Graceful Degradation**: Falls back to next available backend
- **User Control**: Can disable fallback or force specific backend

## ⚙️ Configuration Management

### View Current Configuration
```bash
# Check current backend status
trust config show

# See which backend is active
trust status

# View AI configuration
trust config get ai
```

### Backend Preferences
```bash
# Set preferred backend
trust config set ai.preferredBackend ollama

# Change fallback order
trust config set ai.fallbackOrder "ollama,trust-local,cloud"

# Disable fallback (use only preferred backend)
trust config set ai.enableFallback false
```

### Ollama Configuration
```bash
# Set default model
trust config set ai.ollama.defaultModel qwen2.5:7b

# Adjust timeout for slower hardware
trust config set ai.ollama.timeout 180000  # 3 minutes

# Set custom Ollama URL
trust config set ai.ollama.baseUrl http://your-server:11434

# Set maximum tool calls
trust config set ai.ollama.maxToolCalls 5
```

### Trust Local Configuration
```bash
# Enable/disable Trust Local fallback
trust config set ai.trustLocal.enabled true

# Enable GBNF grammar-based function calling
trust config set ai.trustLocal.gbnfFunctions true
```

### Cloud Configuration
```bash
# Enable/disable cloud fallback
trust config set ai.cloud.enabled false

# Set cloud provider
trust config set ai.cloud.provider google  # or 'openai', 'anthropic'
```

## 📊 Backend Comparison

| Feature | Ollama | Trust Local | Cloud |
|---------|---------|-------------|-------|
| **Setup** | Simple | Moderate | Simple |
| **Performance** | Fast | Medium | Fastest |
| **Privacy** | Private | Private | Shared |
| **Offline** | Yes | Yes | No |
| **Model Selection** | Extensive | Curated | Latest |
| **Tool Calling** | Native | GBNF | Native |
| **Resource Usage** | Low | Medium | None |
| **Model Management** | Built-in | Manual | None |

## 🎯 Recommended Setups

### Privacy-First Developer
```bash
# Complete local operation, no cloud fallback
trust config set ai.enableFallback false
trust config set ai.preferredBackend trust-local
trust config set ai.cloud.enabled false
trust model download phi-3.5-mini-instruct
```

### Performance-Optimized Developer
```bash
# Ollama primary, cloud fallback for heavy tasks
ollama pull qwen2.5:7b
trust config set ai.fallbackOrder "ollama,cloud,trust-local"
trust config set ai.cloud.enabled true
```

### Enterprise/Security Team
```bash
# Local-only deployment with security policies
trust config set ai.enableFallback false
trust config set ai.preferredBackend trust-local
trust config set ai.cloud.enabled false
trust config set ai.trustLocal.gbnfFunctions true
```

### Hybrid Workflow Developer
```bash
# Ollama for general use, Trust Local for sensitive work
ollama pull qwen2.5:7b
trust model download deepseek-r1-distill-7b
trust config set ai.fallbackOrder "ollama,trust-local,cloud"
```

## 🔧 Advanced Configuration

### Configuration File Location
All settings are stored in `~/.trustcli/config.json`:

```json
{
  "ai": {
    "preferredBackend": "ollama",
    "fallbackOrder": ["ollama", "trust-local", "cloud"],
    "enableFallback": true,
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "defaultModel": "qwen2.5:1.5b",
      "timeout": 120000,
      "maxToolCalls": 3
    },
    "trustLocal": {
      "enabled": true,
      "gbnfFunctions": true
    },
    "cloud": {
      "enabled": false,
      "provider": "google"
    }
  }
}
```

### Environment Variables
```bash
# Override backend selection
export TRUST_BACKEND=ollama

# Override Ollama model
export TRUST_OLLAMA_MODEL=qwen2.5:7b

# Override configuration directory
export TRUST_CONFIG_DIR=~/.custom-trust
```

## 🛠️ Troubleshooting

### Ollama Not Detected
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama service
ollama serve

# Check Ollama logs
journalctl -f -u ollama  # Linux systemd
```

### Trust Local Models Not Loading
```bash
# Check downloaded models
trust model list

# Verify model integrity
trust model verify

# Download if missing
trust model download qwen2.5-1.5b-instruct
```

### Cloud Authentication Issues
```bash
# Check authentication status
trust auth status

# Re-authenticate
trust auth login --provider google

# Clear auth cache
trust auth logout
```

### Configuration Issues
```bash
# Reset to defaults
trust config reset

# Backup current config
cp ~/.trustcli/config.json ~/.trustcli/config.json.backup

# View current settings
trust config show
```

## 🚀 Performance Tips

### Ollama Optimization
```bash
# Use appropriate model size for your hardware
ollama pull qwen2.5:1.5b  # 2GB RAM
ollama pull qwen2.5:7b    # 8GB RAM
ollama pull llama3.1:8b   # 16GB RAM

# Increase timeout for slower hardware
trust config set ai.ollama.timeout 300000  # 5 minutes
```

### Trust Local Optimization
```bash
# Enable GBNF for better function calling
trust config set ai.trustLocal.gbnfFunctions true

# Use appropriate quantization
trust model download phi-3.5-mini-instruct  # Q4_K_M (balanced)
```

### Memory Management
```bash
# Check system resources
trust perf status

# Get optimization suggestions
trust perf optimize

# Monitor during usage
trust perf watch
```

## 🔒 Security Considerations

### Local-Only Operation
```bash
# Disable all external connections
trust config set ai.cloud.enabled false
trust config set ai.fallbackOrder "ollama,trust-local"

# Verify no external calls
trust config show | grep -E "(cloud|external)"
```

### Model Verification
```bash
# Verify all models
trust model verify

# Check model integrity
trust model status

# Review model sources
trust model info qwen2.5-1.5b-instruct
```

### Privacy Audit
```bash
# Review current configuration
trust config show

# Check active backend
trust status

# Audit logs (if enabled)
trust logs show
```

## 📚 Additional Resources

- [Trust CLI Vision Document](../TRUST_CLI_VISION.md)
- [Model Management Guide](../README.md#-model-management)
- [Performance Monitoring](../README.md#-performance-monitoring)
- [Privacy & Security](../README.md#-privacy--security-management)

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Status**: Complete - reflects current implementation