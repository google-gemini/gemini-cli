# Trust CLI Multi-Model Troubleshooting Guide

## 🔍 Common Issues & Solutions

### 1. "No AI backend available" Error

**Symptoms**: Trust CLI can't find any working AI backend

**Diagnosis**:
```bash
# Check backend status
trust status

# View configuration
trust config show

# Check available models
trust model list  # Trust Local
ollama list       # Ollama
```

**Solutions**:
```bash
# Option 1: Quick Ollama setup
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve &
ollama pull qwen2.5:1.5b

# Option 2: Download Trust Local model
trust model download qwen2.5-1.5b-instruct

# Option 3: Enable cloud fallback
trust config set ai.cloud.enabled true
trust auth login --provider google
```

### 2. Ollama Not Detected

**Symptoms**: Trust CLI doesn't detect running Ollama instance

**Diagnosis**:
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check Ollama service status
systemctl status ollama  # Linux
brew services list | grep ollama  # macOS
```

**Solutions**:
```bash
# Start Ollama service
ollama serve

# Check Ollama configuration
trust config get ai.ollama

# Verify Ollama URL
trust config set ai.ollama.baseUrl http://localhost:11434

# Test connection manually
curl -X POST http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:1.5b",
  "prompt": "Hello"
}'
```

### 3. Trust Local Models Not Loading

**Symptoms**: Downloaded models not appearing or loading

**Diagnosis**:
```bash
# Check downloaded models
trust model list

# Verify model files exist
ls ~/.trustcli/models/

# Check model integrity
trust model verify
```

**Solutions**:
```bash
# Re-download model
trust model download qwen2.5-1.5b-instruct

# Clear model cache
rm -rf ~/.trustcli/models/
trust model download qwen2.5-1.5b-instruct

# Switch to available model
trust model switch qwen2.5-1.5b-instruct

# Check Trust Local configuration
trust config set ai.trustLocal.enabled true
```

### 4. Fallback Chain Not Working

**Symptoms**: Trust CLI not falling back to next available backend

**Diagnosis**:
```bash
# Check fallback configuration
trust config get ai.enableFallback
trust config get ai.fallbackOrder

# Test each backend individually
trust config set ai.enableFallback false
trust config set ai.preferredBackend ollama
trust  # Test Ollama
```

**Solutions**:
```bash
# Enable fallback
trust config set ai.enableFallback true

# Fix fallback order
trust config set ai.fallbackOrder "ollama,trust-local,cloud"

# Enable backends
trust config set ai.trustLocal.enabled true
trust config set ai.cloud.enabled true
```

### 5. Timeout Issues

**Symptoms**: "Request timed out" errors, especially with Ollama

**Diagnosis**:
```bash
# Check current timeout settings
trust config get ai.ollama.timeout

# Monitor system resources
trust perf watch
```

**Solutions**:
```bash
# Increase timeout for slower hardware
trust config set ai.ollama.timeout 300000  # 5 minutes

# Use smaller model
ollama pull qwen2.5:1.5b  # Instead of 7b

# Check system resources
trust perf optimize
```

### 6. Configuration Issues

**Symptoms**: Configuration not being saved or applied

**Diagnosis**:
```bash
# Check configuration file
cat ~/.trustcli/config.json

# Verify permissions
ls -la ~/.trustcli/
```

**Solutions**:
```bash
# Reset configuration
trust config reset

# Recreate config directory
rm -rf ~/.trustcli/
mkdir -p ~/.trustcli/

# Fix permissions
chmod 755 ~/.trustcli/
chmod 644 ~/.trustcli/config.json
```

### 7. Model Management Issues

**Symptoms**: Models not downloading or switching properly

**Diagnosis**:
```bash
# Check model status
trust model status

# Verify Hugging Face connectivity
curl -I https://huggingface.co/

# Check disk space
df -h ~/.trustcli/models/
```

**Solutions**:
```bash
# Clear download cache
rm -rf ~/.trustcli/models/.tmp/

# Re-download with verbose output
trust model download qwen2.5-1.5b-instruct --verbose

# Check model integrity
trust model verify qwen2.5-1.5b-instruct
```

### 8. Performance Issues

**Symptoms**: Slow responses, high CPU/memory usage

**Diagnosis**:
```bash
# Check system performance
trust perf status

# Monitor resource usage
trust perf watch

# Check active backend
trust status
```

**Solutions**:
```bash
# Switch to smaller model
ollama pull qwen2.5:1.5b  # Instead of 7b
trust model download qwen2.5-1.5b-instruct  # Instead of 7b

# Optimize configuration
trust perf optimize

# Reduce tool calls
trust config set ai.ollama.maxToolCalls 2
```

## 🚨 Emergency Recovery

### Complete Reset
```bash
# Stop all Trust CLI processes
pkill -f trust

# Backup current config
cp ~/.trustcli/config.json ~/.trustcli/config.json.backup

# Reset to defaults
rm -rf ~/.trustcli/
trust config reset

# Start fresh
trust  # Will create new config with defaults
```

### Diagnostic Information
```bash
# Gather system information
trust --version
node --version
npm --version
uname -a

# Check Trust CLI status
trust status
trust config show
trust model list

# Check system resources
trust perf status
df -h ~/.trustcli/
```

## 🔧 Advanced Troubleshooting

### Debug Mode
```bash
# Enable debug logging
export DEBUG=trust-cli:*
trust

# Check logs
tail -f ~/.trustcli/logs/trust-cli.log
```

### Network Issues
```bash
# Test Ollama connectivity
curl -v http://localhost:11434/api/tags

# Test Hugging Face connectivity
curl -v https://huggingface.co/microsoft/phi-3.5-mini-instruct

# Check proxy settings
echo $HTTP_PROXY
echo $HTTPS_PROXY
```

### File System Issues
```bash
# Check permissions
ls -la ~/.trustcli/
ls -la ~/.trustcli/models/

# Check disk space
df -h ~/.trustcli/

# Check file system integrity
fsck ~/.trustcli/  # Linux
```

## 📞 Getting Help

### Before Reporting Issues
1. Try the emergency recovery steps
2. Gather diagnostic information
3. Check known issues in README.md
4. Search existing GitHub issues

### Reporting Issues
Include this information:
- Trust CLI version: `trust --version`
- Node.js version: `node --version`
- Operating system: `uname -a`
- Configuration: `trust config show`
- Error messages: Full stack trace
- Steps to reproduce: Minimal example

### Community Support
- GitHub Issues: Report bugs and feature requests
- GitHub Discussions: Ask questions and share tips
- Documentation: Check docs/ directory

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Status**: Complete - covers all common multi-model issues