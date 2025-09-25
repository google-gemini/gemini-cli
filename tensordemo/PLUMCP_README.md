# PLUMCP (Plugable MCP) - The Plugin Model Control Program

## Overview

**PLUMCP** (Plugable MCP) - also known as the **Plugin Model Control Program** - is a revolutionary approach to the Model Context Protocol (MCP) that inverts the traditional architecture. Instead of a monolithic MCP server with built-in capabilities, PLUMCP provides a **minimal core that requires plugins to function at all**.

### The Plumber Metaphor 🔧
Just as a real plumber manages pipes, connections, and prevents leaks, PLUMCP's **Plugin Model evaluator** (the "Plumber") is responsible for:
- **Managing Connections**: Ensuring plugins interact correctly and safely
- **Preventing Leaks**: Validating plugins to stop security vulnerabilities before they compromise the system
- **Flow Control**: Regulating plugin capabilities and resource usage

### Where the Context Provider Lives 🏠
The **Model Context Provider** (the actual MCP context management) is safely placed as a **specialized plugin** under the Plumber's control:

```
PLUMCP Architecture:
├── PLUM (Plugin Model) = The Plumber (evaluator/controller)
├── CP (Control Program) = The Feature-Rich Control System
│
└── 🧠 CONTEXT ECOSYSTEM (Multiple Specialized Providers)
    ├── 🔒 ContextProviderPlugin (Secure base storage & retrieval)
    │   ├── Evaluated by the Plumber before activation
    │   ├── Sandboxed and resource-limited
    │   ├── Cryptographic integrity checking
    │   └── Hot-swappable for security updates
    │
    ├── 🧠 IntelligentContextPlugin (ML-powered analysis & prediction)
    │   ├── Pattern recognition and usage analytics
    │   ├── Predictive context prefetching
    │   ├── Intelligent context merging
    │   └── Performance optimization recommendations
    │
    ├── 💻 CodeContextPlugin (Syntax-aware code context)
    │   ├── Language-specific parsing and storage
    │   ├── Dependency extraction and tracking
    │   ├── Complexity analysis and metadata
    │   └── Code pattern recognition
    │
    └── 🤖 ContextAwareAIPlugin (Multi-context AI intelligence)
        ├── Leverages all context providers simultaneously
        ├── Personalized responses based on user history
        ├── Context-aware analysis and recommendations
        └── Adaptive learning from interaction patterns
```

**Why multiple context providers?** Different use cases require different context capabilities. The Plumber ensures each specialized provider is secure, while the ecosystem creates **bidirectional intelligence flow** between models and plugins. Context providers become both **consumers and producers** of contextual intelligence.

### Key Principle
> **PLUMCP has ZERO built-in functionality** - every capability (tools, resources, prompts) is provided by plugins

## Architecture

### Core Components

```
PLUMCP Core (Minimal)
├── MCP Protocol Handler (Bare)
├── Plugin Manager (Orchestrator)
├── Plugin Registry (Discovery)
└── Plugin Context (Communication)

Plugins (Functionality Providers)
├── Core Tools Plugin (echo, sysinfo, etc.)
├── File System Plugin (file operations)
├── AI Assistance Plugin (code analysis)
├── Web Scraping Plugin (HTTP access)
├── Database Plugin (data persistence)
├── Monitoring Plugin (system metrics)
└── Custom Plugins (User-defined)
```

### Plugin System

#### Plugin Interface
```typescript
interface PLUMCPPlugin {
  id: string;
  name: string;
  version: string;
  capabilities: PluginCapability[];
  dependencies: PluginDependency[];

  activate(context: PluginContext): Promise<void>;
  deactivate(): Promise<void>;
}
```

#### Plugin Capabilities
- **`tools`** - Executable functions (commands, operations)
- **`resources`** - Readable data sources (files, APIs, databases)
- **`prompts`** - Reusable prompt templates
- **`sampling`** - Custom sampling strategies
- **`logging`** - Custom logging implementations

#### Plugin Dependencies
Plugins can declare dependencies on other plugins:
```typescript
dependencies: [
  { pluginId: 'plumcp-filesystem', version: '1.0.0', required: true }
]
```

## Installation & Setup

### Basic Setup
```bash
npm install @plumcp/core
```

### Starting with Essential Plugins
```typescript
import { PLUMCPServer } from '@plumcp/core';
import { CoreToolsPlugin, FileSystemPlugin } from '@plumcp/plugins';

const server = new PLUMCPServer();

// Load essential plugins (provides basic functionality)
await server.loadPlugin(new CoreToolsPlugin());
await server.loadPlugin(new FileSystemPlugin());

// Start server
await server.start();
```

### Advanced Setup with Specialized Plugins
```typescript
import {
  AIAssistancePlugin,
  WebScrapingPlugin,
  DatabasePlugin,
  MonitoringPlugin
} from '@plumcp/plugins';

// Add specialized capabilities
await server.loadPlugin(new AIAssistancePlugin());
await server.loadPlugin(new WebScrapingPlugin());
await server.loadPlugin(new DatabasePlugin());
await server.loadPlugin(new MonitoringPlugin());
```

## Plugin Development

### Creating a Custom Plugin
```typescript
import { PLUMCPPlugin, PluginCapability } from '@plumcp/core';

class MyCustomPlugin implements PLUMCPPlugin {
  id = 'my-custom-plugin';
  name = 'My Custom Plugin';
  version = '1.0.0';
  capabilities: PluginCapability[] = [
    {
      type: 'tools',
      methods: ['my_custom_tool']
    }
  ];
  dependencies = [];

  async activate(context) {
    // Register tools
    context.registerTool({
      name: 'my_custom_tool',
      description: 'My custom functionality',
      inputSchema: { /* schema */ },
      handler: async (args) => {
        // Implementation
        return { result: 'Custom operation completed' };
      },
      pluginId: this.id
    });

    // Register resources
    context.registerResource({
      uri: 'custom://data',
      name: 'Custom Data',
      description: 'My custom data source',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({ data: 'value' }),
      pluginId: this.id
    });
  }

  async deactivate() {
    // Cleanup
  }
}
```

### Plugin Registration
```typescript
const registry = new PluginRegistry();
registry.registerPlugin(new MyCustomPlugin());
```

## Available Plugins

### Core Plugins (Essential)
- **`CoreToolsPlugin`** - Basic utilities (echo, system info, plugin listing)
- **`FileSystemPlugin`** - File operations and system resources

### Specialized Plugins
- **`AIAssistancePlugin`** - Code analysis, improvement suggestions, documentation generation
- **`WebScrapingPlugin`** - URL scraping, text extraction, web resources
- **`DatabasePlugin`** - Data persistence, querying, table management
- **`ContextProviderPlugin`** - **🔒 SAFE Model Context Provider** - Secure context storage, retrieval, and semantic search
- **`IntelligentContextPlugin`** - **🧠 ML-Powered Context Intelligence** - Pattern analysis, predictive context, intelligent merging
- **`CodeContextPlugin`** - **💻 Specialized Code Context** - Syntax-aware code storage with dependency tracking
- **`ContextAwareAIPlugin`** - **🤖 Context-Aware AI** - Personalized responses using multiple context providers
- **`IDEExtensionFrameworkPlugin`** - **🛡️ Secure IDE Framework** - Safe extension registration, authentication, and session management
- **`VSCodeExtensionPlugin`** - **💙 VS Code Integration** - Secure VS Code-specific commands and workspace access
- **`SecureIDECommunicationPlugin`** - **🔐 Encrypted IDE Channels** - AES-256-GCM/TLS communication with message integrity
- **`VirtualFileSystemPlugin`** - **💾 VFS with Injection Protection** - Secure file operations with prompt injection prevention and backup/recovery
- **`GuidancePlugin`** - **🧠 Intelligent Code Analysis** - Code analysis, security assessment, improvement suggestions, and Google Assistant context enhancement
- **`ReliabilityEnhancementPlugin`** - **🔄 Reliability Enhancements** - Retry logic, circuit breakers, and health monitoring with backward compatibility
- **`MonitoringPlugin`** - System metrics, performance tracking, event logging

## Usage Examples

### Basic MCP Operations
```typescript
// Once plugins are loaded, PLUMCP responds to standard MCP requests:

// Tools
await client.callTool({
  name: 'analyze_code',
  arguments: { code: 'function test() { return true; }' }
});

// Resources
await client.readResource({
  uri: 'file:///path/to/file.txt'
});

// Prompts
await client.getPrompt({
  name: 'code_review',
  arguments: { language: 'typescript' }
});
```

### Virtual File System Integration 🗂️
```typescript
// 🔒 SECURE VFS OPERATIONS WITH INJECTION PROTECTION
const fileContent = await client.callTool({
  name: 'vfs_read_file',
  arguments: {
    path: '/secure/document.txt',
    encoding: 'utf8'
  }
});
// Returns: { path, content (sanitized), protected: true }

// 💾 VFS WRITE WITH BACKUP AND INTEGRITY
await client.callTool({
  name: 'vfs_write_file',
  arguments: {
    path: '/data/analysis.json',
    content: JSON.stringify(analysisData),
    backup: true
  }
});

// 🔍 SECURE VFS SEARCH WITH INJECTION PROTECTION
const searchResults = await client.callTool({
  name: 'vfs_search',
  arguments: {
    query: 'security patterns',
    path: '/code/',
    includeContent: true
  }
});

// 🔄 VFS BACKUP AND RECOVERY
await client.callTool({
  name: 'vfs_backup',
  arguments: { name: 'daily_backup' }
});

await client.callTool({
  name: 'vfs_recover',
  arguments: { backupName: 'daily_backup' }
});
```

### Reliability Enhancements 🔄
```typescript
// 🔁 AUTOMATIC RETRY WITH EXPONENTIAL BACKOFF
const retryResult = await client.callTool({
  name: 'retry_operation',
  arguments: {
    operation: 'unstable_network_call',
    maxRetries: 3,
    baseDelay: 1000
  }
});

// ✅ INTEGRITY VALIDATION
const integrityCheck = await client.callTool({
  name: 'validate_integrity',
  arguments: {
    data: 'sensitive_content',
    expectedHash: 'sha256_hash'
  }
});

// 🏥 SYSTEM HEALTH MONITORING
const healthStatus = await client.callTool({
  name: 'health_check',
  arguments: {}
});

// ⚡ CIRCUIT BREAKER STATUS
const breakerStatus = await client.callTool({
  name: 'circuit_breaker_status',
  arguments: {}
});
```

### Google Code Assistant Compatible Features 🧠
```typescript
// 🔄 GENERATE PREFILLED CONTEXT - Token-efficient responses for Google Assistant
const prefilledContext = await client.callTool({
  name: 'generate_prefilled_context',
  arguments: {
    task: 'function',
    language: 'typescript',
    context: 'user management system',
    maxTokens: 50
  }
});
// Returns: { prefix, suffix, imports, variables, estimatedTokens }

// ⚡ INTELLIGENT CODE COMPLETION - Context-aware suggestions
const completions = await client.callTool({
  name: 'intelligent_code_completion',
  arguments: {
    prefix: 'func',
    language: 'javascript',
    context: 'const data = [1,2,3];',
    maxSuggestions: 3
  }
});
// Returns: [{ completion: 'tion', fullText: 'function', confidence: 0.98 }]

// 🛡️ PROTECTED PROMPT RESPONSE - Injection-safe responses
const safeResponse = await client.callTool({
  name: 'protected_prompt_response',
  arguments: {
    prompt: 'create a function',
    context: 'data processing',
    language: 'typescript',
    protectOutput: true
  }
});
// Returns: { response, protectionApplied: true, injectionSafe: true }

// 🎯 CONTEXT FOR ASSISTANT - Prefilled context for Google Code Assistant
const assistantContext = await client.callTool({
  name: 'context_for_assistant',
  arguments: {
    task: 'complete',
    code: 'function calculateTotal(items) {\n  // TODO: sum all item prices\n}',
    language: 'javascript',
    cursorPosition: 35,
    projectContext: 'e-commerce application'
  }
});
// Returns: { assistantContext, tokensSaved, readyForAssistant, injectionProtected }
```

### Plugin Management
```typescript
// Load plugin at runtime
await server.loadPlugin(new AIAssistancePlugin());

// Check available capabilities
const tools = server.getPluginManager().getAllTools();
const resources = server.getPluginManager().getAllResources();

// Unload plugin
await server.unloadPlugin('plumcp-ai-assistance');
```

### Cross-Plugin Functionality
```typescript
// Plugins can work together
// FileSystemPlugin + AIAssistancePlugin
const fileContent = await fileTool({ path: './code.js' });
const analysis = await analyzeTool({ code: fileContent });

// DatabasePlugin + MonitoringPlugin
await insertTool({ table: 'metrics', data: performanceData });
const metrics = await queryTool({ table: 'metrics' });
```

### Safe Context Provider Usage 🔒
```typescript
// THE SAFE CONTEXT PROVIDER - Evaluated by the Plumber before use
// Store context securely with validation and integrity checks
await client.callTool({
  name: 'store_context',
  arguments: {
    key: 'user_conversation_123',
    data: {
      userId: 'user123',
      preferences: { theme: 'dark', language: 'en' },
      conversation: ['Hello', 'How can I help?']
    },
    tags: ['user', 'conversation', 'preferences']
  }
});

// Retrieve context with integrity verification
const context = await client.callTool({
  name: 'retrieve_context',
  arguments: { key: 'user_conversation_123' }
});

// Search context semantically
const results = await client.callTool({
  name: 'context_search',
  arguments: {
    query: 'user preferences',
    tags: ['user'],
    limit: 10
  }
});
```

### Advanced Context Ecosystem 🔄
```typescript
// 🎯 CONTEXT PROVIDER ECOSYSTEM - Multiple Specialized Providers Working Together

// 1. Base Context Provider (secure storage & retrieval)
await client.callTool({
  name: 'store_context',
  arguments: { key: 'user_123', data: userData, tags: ['user', 'profile'] }
});

// 2. Intelligent Context Provider (ML-powered analysis & prediction)
const patterns = await client.callTool({
  name: 'analyze_context_patterns',
  arguments: { userId: 'user_123', timeRange: 24 }
});

const predictions = await client.callTool({
  name: 'predict_context_needs',
  arguments: { currentContext: 'analysis', userHistory: ['user_123', 'session_456'] }
});

// 3. Code Context Provider (syntax-aware code storage)
await client.callTool({
  name: 'store_code_context',
  arguments: {
    code: 'function analyze() { return true; }',
    language: 'typescript',
    filePath: './utils.ts',
    tags: ['security', 'analysis']
  }
});

// 4. Context-Aware AI (leverages ALL context providers)
const personalizedAnalysis = await client.callTool({
  name: 'context_aware_analysis',
  arguments: {
    data: 'Analyze this security vulnerability',
    userId: 'user_123',
    context: 'security_analysis_456'
  }
});

const smartResponse = await client.callTool({
  name: 'personalized_responses',
  arguments: {
    query: 'How does this security fix work?',
    userId: 'user_123',
    conversationId: 'security_discussion_789'
  }
});
```

### Secure IDE Connectivity 🛡️
```typescript
// 🔐 SECURE IDE EXTENSION REGISTRATION
const registration = await client.callTool({
  name: 'register_ide_extension',
  arguments: {
    extensionId: 'my-vscode-extension',
    ideType: 'vscode',
    capabilities: ['read', 'write', 'context:file', 'context:user'],
    publicKey: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'
  }
});

// 🔑 AUTHENTICATE IDE SESSION
const auth = await client.callTool({
  name: 'authenticate_ide',
  arguments: {
    extensionId: 'my-vscode-extension',
    token: registration.token,
    sessionId: 'session_123'
  }
});

// 🔒 ESTABLISH ENCRYPTED COMMUNICATION CHANNEL
const channel = await client.callTool({
  name: 'establish_secure_channel',
  arguments: {
    ideId: 'my-vscode-extension',
    encryptionMethod: 'AES-256-GCM',
    keyExchange: 'ECDHE'
  }
});

// 📤 SEND ENCRYPTED MESSAGES TO IDE
const encryptedMsg = await client.callTool({
  name: 'encrypt_ide_message',
  arguments: {
    channelId: channel.channelId,
    message: { action: 'sync_context', data: userContext },
    priority: 'high'
  }
});

// 📥 RECEIVE & DECRYPT MESSAGES FROM IDE
const decryptedMsg = await client.callTool({
  name: 'decrypt_ide_message',
  arguments: {
    channelId: channel.channelId,
    encryptedMessage: receivedEncryptedData
  }
});

// 🆚 SYNCHRONIZE CONTEXT BETWEEN IDE AND PLUMCP
const sync = await client.callTool({
  name: 'sync_ide_context',
  arguments: {
    sessionId: auth.sessionId,
    contextType: 'workspace',
    contextData: { files: ['main.ts', 'utils.ts'], settings: vscodeSettings },
    direction: 'bidirectional'
  }
});

// 💙 VS CODE SPECIFIC OPERATIONS
const vscodeResult = await client.callTool({
  name: 'vscode_execute_command',
  arguments: {
    sessionId: auth.sessionId,
    command: 'editor.action.formatDocument',
    args: []
  }
});
```

### Plugin Dependencies
```typescript
class AdvancedAIPlugin implements PLUMCPPlugin {
  dependencies = [
    { pluginId: 'plumcp-filesystem', version: '1.0.0', required: true },
    { pluginId: 'plumcp-database', version: '1.0.0', required: false }
  ];

  async activate(context) {
    // Can safely use filesystem and optionally database
    const filePlugin = context.getPlugin('plumcp-filesystem');
    // Implementation
  }
}
```

### Hot Plugin Reloading
```typescript
// Unload and reload plugin without restarting server
await server.unloadPlugin('my-plugin');
await server.loadPlugin(new UpdatedMyPlugin());
```

### Plugin Sandboxing
```typescript
// Plugins run in isolated contexts
const sandboxedPlugin = await sandboxManager.sandbox(plugin);
await server.loadPlugin(sandboxedPlugin);
```

## Configuration

### Server Configuration
```json
{
  "plumcp": {
    "autoLoadPlugins": [
      "plumcp-core-tools",
      "plumcp-filesystem"
    ],
    "pluginDirectories": [
      "./plugins",
      "~/.plumcp/plugins"
    ],
    "security": {
      "sandboxPlugins": true,
      "resourceLimits": {
        "memory": "50MB",
        "timeout": 30000
      }
    }
  }
}
```

### Plugin Discovery
```typescript
// Automatic plugin discovery
const registry = new PluginRegistry();
await registry.scanDirectories(['./plugins', '~/.plumcp/plugins']);

// Search by capability
const aiPlugins = registry.searchPlugins('analyze_code');
```

## Benefits

### Modularity
- **Specialized plugins** for specific use cases
- **Mix and match** capabilities as needed
- **Zero bloat** - only load what you need

### Extensibility
- **Easy plugin development** with clear interfaces
- **Community ecosystem** of specialized plugins
- **Version management** and dependency resolution

### Security 🔒 (The Plumber's Domain)
- **Plugin sandboxing** prevents malicious code execution
- **Capability-based access** controls
- **Resource limits** prevent abuse
- **Leak prevention**: Just like a plumber stops water leaks, PLUMCP prevents security leaks through plugin validation
- **Connection management**: Ensures plugins interact safely without compromising system integrity
- **Flow control**: Regulates plugin capabilities and resource usage to maintain system stability

### Performance
- **Lazy loading** - plugins load only when needed
- **Selective activation** - run only required plugins
- **Resource pooling** - efficient resource usage

## Comparison: Traditional MCP vs PLUMCP

| Aspect | Traditional MCP | PLUMCP |
|--------|----------------|--------|
| **Core Functionality** | Built-in capabilities | Zero built-in capabilities |
| **Extensibility** | Limited to configuration | Unlimited through plugins |
| **Modularity** | Monolithic design | Highly modular |
| **Plugin System** | Optional extensions | Required for functionality |
| **Customization** | Configuration-based | Plugin-based |
| **Security** | All-or-nothing access | Granular plugin permissions |
| **Performance** | Fixed overhead | Pay-for-what-you-use |

## Getting Started

1. **Install PLUMCP Core**
   ```bash
   npm install @plumcp/core
   ```

2. **Install Essential Plugins**
   ```bash
   npm install @plumcp/plugins
   ```

3. **Create Server**
   ```typescript
   import { PLUMCPServer } from '@plumcp/core';
   import { CoreToolsPlugin, FileSystemPlugin } from '@plumcp/plugins';

   const server = new PLUMCPServer();
   await server.loadPlugin(new CoreToolsPlugin());
   await server.loadPlugin(new FileSystemPlugin());
   await server.start();
   ```

4. **Connect MCP Client**
   ```
   Your PLUMCP server is now ready to serve MCP requests!
   ```

## Contributing

### Plugin Development Guidelines
- Follow the `PLUMCPPlugin` interface
- Include comprehensive error handling
- Provide clear documentation
- Test plugin isolation

### Core Contributions
- Maintain backward compatibility
- Keep core minimal and focused
- Document plugin interfaces clearly
- Ensure security and sandboxing

## Plugin Combinations for Different Contexts 🎯

### Context-Driven Plugin Orchestration

PLUMCP enables dynamic plugin combinations based on context, where Gemini acts as the intelligent platform that selects and orchestrates the optimal plugin mix for each task.

#### 🔒 **Security Analysis Context**
```
Context: "Analyze code for security vulnerabilities"
Gemini Platform Selection:
├── ContextProviderPlugin (secure storage & retrieval)
├── GuidancePlugin (security scanning & vulnerability detection)
├── VirtualFileSystemPlugin (secure file access)
└── ReliabilityEnhancementPlugin (circuit breaker for safe scanning)

Result: Comprehensive security analysis with protected data flows
```

#### 🐛 **Debugging & Bug Fixing Context**
```
Context: "Debug and fix authentication bug"
Gemini Platform Selection:
├── CodeContextPlugin (syntax-aware code storage)
├── IntelligentContextPlugin (ML-powered bug pattern recognition)
├── GuidancePlugin (code quality assessment & fix suggestions)
├── VirtualFileSystemPlugin (backup before fixes)
└── ReliabilityEnhancementPlugin (retry failed operations)

Result: Intelligent bug detection and safe automated fixes
```

#### 🚀 **Performance Optimization Context**
```
Context: "Optimize application performance"
Gemini Platform Selection:
├── IntelligentContextPlugin (performance pattern analysis)
├── GuidancePlugin (code quality metrics & optimization suggestions)
├── VirtualFileSystemPlugin (performance monitoring & caching)
├── MonitoringPlugin (real-time performance tracking)
└── ReliabilityEnhancementPlugin (circuit breaker for optimization tests)

Result: Data-driven performance improvements with safety guarantees
```

#### 🏗️ **Code Generation & Architecture Context**
```
Context: "Design and implement user management system"
Gemini Platform Selection:
├── ContextAwareAIPlugin (multi-context AI for architecture decisions)
├── GuidancePlugin (prefilled context templates & intelligent completions)
├── CodeContextPlugin (dependency tracking & architectural patterns)
├── VirtualFileSystemPlugin (project structure management)
└── IDEExtensionFrameworkPlugin (IDE integration for seamless workflow)

Result: AI-assisted architecture with context-aware code generation
```

#### 🔧 **DevOps & Deployment Context**
```
Context: "Set up CI/CD pipeline and deploy"
Gemini Platform Selection:
├── DatabasePlugin (configuration management)
├── VirtualFileSystemPlugin (infrastructure as code storage)
├── ReliabilityEnhancementPlugin (deployment retry logic & health checks)
├── SecureIDECommunicationPlugin (encrypted deployment commands)
└── MonitoringPlugin (deployment tracking & alerting)

Result: Secure, reliable deployment pipelines with monitoring
```

### Custom Command Integration 💻

Gemini acts as the command platform that interprets natural language and routes to optimal plugin combinations:

#### **Platform Commands** (Gemini interprets natural language → Plugin actions)
```bash
# Gemini interprets: "securely analyze this file"
gemini "analyze security of auth.js"
# → ContextProviderPlugin + GuidancePlugin + VirtualFileSystemPlugin

# Gemini interprets: "help me debug the login issue"
gemini "debug login authentication bug"
# → CodeContextPlugin + IntelligentContextPlugin + GuidancePlugin

# Gemini interprets: "optimize the database queries"
gemini "speed up slow database performance"
# → IntelligentContextPlugin + GuidancePlugin + MonitoringPlugin
```

#### **Dynamic Context Switching** 🔄
```typescript
// Gemini intelligently switches plugin combinations based on task evolution
const contextManager = new GeminiContextManager();

// Initial context: Code review
await contextManager.switchContext('code_review', {
  plugins: ['ContextProviderPlugin', 'GuidancePlugin'],
  priority: 'security'
});

// Context evolution: Performance optimization needed
await contextManager.evolveContext('performance_optimization', {
  addPlugins: ['IntelligentContextPlugin', 'MonitoringPlugin'],
  priority: 'efficiency'
});

// Final context: Production deployment
await contextManager.finalizeContext('production_deployment', {
  plugins: ['VirtualFileSystemPlugin', 'ReliabilityEnhancementPlugin', 'SecureIDECommunicationPlugin'],
  priority: 'stability'
});
```

## License

PLUMCP is released under the Apache 2.0 License.

---

**PLUMCP**: Where the MCP server gets its superpowers from plugins! 🚀🔌
