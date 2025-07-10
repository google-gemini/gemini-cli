# Trust CLI Configuration Commands

## Overview

The Trust CLI now includes comprehensive configuration management commands that allow you to view, modify, and manage all aspects of your Trust CLI configuration.

## Usage

```bash
trust config <action> [options]
```

## Available Commands

### 1. Show Configuration

Display current configuration settings:

```bash
# Show basic configuration
trust config show

# Show detailed configuration with all settings
trust config show --verbose
```

### 2. Get Configuration Value

Retrieve a specific configuration value:

```bash
# Get preferred AI backend
trust config get ai.preferredBackend

# Get Ollama timeout setting
trust config get ai.ollama.timeout

# Get nested object (returns JSON)
trust config get ai.ollama
```

### 3. Set Configuration Value

Modify configuration values:

```bash
# Set preferred backend
trust config set ai.preferredBackend ollama

# Set Ollama timeout (in milliseconds)
trust config set ai.ollama.timeout 30000

# Set boolean values
trust config set ai.enableFallback true

# Set privacy mode
trust config set privacy.privacyMode relaxed
```

### 4. Backend Management

Quickly set the preferred AI backend:

```bash
# Set to Ollama (local AI)
trust config backend ollama

# Set to Trust Local (GGUF models)
trust config backend trust-local

# Set to Cloud AI
trust config backend cloud
```

### 5. Fallback Order Management

Configure AI backend fallback order:

```bash
# Set fallback order: Ollama → Trust Local → Cloud
trust config fallback ollama trust-local cloud

# Set fallback order: Trust Local → Ollama
trust config fallback trust-local ollama
```

### 6. Export Configuration

Export your configuration to a file:

```bash
# Export to JSON file
trust config export ~/my-trust-config.json

# Export for sharing or backup
trust config export ./team-config.json
```

### 7. Import Configuration

Import configuration from a file:

```bash
# Import from JSON file
trust config import ~/my-trust-config.json

# Import team configuration
trust config import ./team-config.json
```

### 8. Reset Configuration

Reset configuration to defaults (interactive):

```bash
trust config reset
```

*Note: Interactive prompts are not yet implemented. Currently shows what would be reset.*

## Configuration Structure

### AI Backend Settings

```bash
# Ollama Configuration
trust config get ai.ollama.baseUrl          # http://localhost:11434
trust config get ai.ollama.defaultModel     # qwen2.5:1.5b
trust config get ai.ollama.timeout          # 60000 (1 minute)
trust config get ai.ollama.keepAlive        # 5m
trust config get ai.ollama.concurrency      # 2
trust config get ai.ollama.temperature      # 0.1
trust config get ai.ollama.maxToolCalls     # 3

# Trust Local Configuration
trust config get ai.trustLocal.enabled      # true
trust config get ai.trustLocal.gbnfFunctions # true

# Cloud Configuration
trust config get ai.cloud.enabled           # false
trust config get ai.cloud.provider          # google
```

### Model Settings

```bash
trust config get models.default              # phi-3.5-mini-instruct
trust config get models.directory            # ~/.trustcli/models
trust config get models.autoVerify           # true
```

### Privacy Settings

```bash
trust config get privacy.privacyMode         # strict
trust config get privacy.auditLogging        # false
trust config get privacy.modelVerification   # true
```

### Inference Settings

```bash
trust config get inference.temperature       # 0.7
trust config get inference.topP              # 0.9
trust config get inference.maxTokens         # 2048
trust config get inference.stream            # true
```

## Examples

### Quick Setup for Different Use Cases

**Local-First Setup (Ollama)**:
```bash
trust config backend ollama
trust config set ai.ollama.defaultModel llama3.2:3b
trust config set ai.enableFallback true
trust config fallback ollama trust-local
```

**Performance Optimization**:
```bash
trust config set ai.ollama.timeout 30000
trust config set ai.ollama.concurrency 4
trust config set ai.ollama.temperature 0.1
trust config set inference.maxTokens 1000
```

**Privacy-Focused Setup**:
```bash
trust config set privacy.privacyMode strict
trust config set privacy.auditLogging false
trust config set transparency.logPrompts false
trust config set transparency.logResponses false
trust config backend trust-local
```

### Backup and Restore

**Backup Current Configuration**:
```bash
trust config export ~/.trustcli-backup-$(date +%Y%m%d).json
```

**Team Configuration Sharing**:
```bash
# Export team settings
trust config export ./team-trust-config.json

# Team members import
trust config import ./team-trust-config.json
```

## Available Configuration Keys

### AI Settings
- `ai.preferredBackend`
- `ai.enableFallback`
- `ai.fallbackOrder`
- `ai.ollama.baseUrl`
- `ai.ollama.defaultModel`
- `ai.ollama.timeout`
- `ai.ollama.keepAlive`
- `ai.ollama.maxToolCalls`
- `ai.ollama.concurrency`
- `ai.ollama.temperature`
- `ai.ollama.numPredict`
- `ai.trustLocal.enabled`
- `ai.trustLocal.gbnfFunctions`
- `ai.cloud.enabled`
- `ai.cloud.provider`

### Model Settings
- `models.default`
- `models.directory`
- `models.autoVerify`

### Privacy Settings
- `privacy.privacyMode`
- `privacy.auditLogging`
- `privacy.modelVerification`

### Inference Settings
- `inference.temperature`
- `inference.topP`
- `inference.maxTokens`
- `inference.stream`

### Transparency Settings
- `transparency.logPrompts`
- `transparency.logResponses`
- `transparency.showModelInfo`
- `transparency.showPerformanceMetrics`

## Error Handling

The configuration commands include comprehensive error handling:

- **Invalid keys**: Shows available keys when unknown key is used
- **Invalid backends**: Lists valid backend options
- **File errors**: Clear error messages for import/export failures
- **Type validation**: Automatic type conversion for strings, numbers, booleans

## Integration Notes

- Configuration changes require Trust CLI restart to take effect
- Export/import preserves the complete configuration structure
- Backend status is checked when setting fallback orders
- File paths are validated before export/import operations

## Future Enhancements

- Interactive configuration wizard
- Configuration validation and recommendations
- Performance impact analysis for configuration changes
- Auto-completion for configuration keys