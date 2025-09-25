/**
 * PLUMCP (Plugin Model Control Program) - Advanced MCP Ecosystem
 *
 * Main entry point for the PLUMCP ecosystem providing:
 * - Intelligent plugin orchestration
 * - Context-aware MCP server
 * - Comprehensive plugin system
 * - Testing and validation framework
 */

// Core MCP Server
export { PLUMCPServer } from './core/plumcp_core.js';

// Plugin System
export {
  PLUMCPPlugin,
  PluginCapability,
  PluginContext,
  PluginDependency,
  PluginRegistry,
  // System Plugins
  VirtualFileSystemPlugin,
  GuidancePlugin,
  ReliabilityEnhancementPlugin,
  PromptInjectionProtector,
  // Context Plugins
  ContextProviderPlugin,
  CodeContextPlugin,
  IntelligentContextPlugin,
  // IDE Plugins
  IDEExtensionFrameworkPlugin,
  VSCodeExtensionPlugin,
  SecureIDECommunicationPlugin,
  // AI Plugins
  ContextAwareAIPlugin,
  // Infrastructure Plugins
  DatabasePlugin,
  MonitoringPlugin,
  // Utility Plugins
  AIAssistancePlugin,
  WebScrapingPlugin,
  CoreToolsPlugin,
  FileSystemPlugin
} from './plugins/plumcp_plugins.js';

// Orchestration Engine
export {
  GeminiContextOrchestrator,
  ContextProfile,
  OrchestrationResult,
  PluginActivationResult
} from './orchestration/gemini_plugin_orchestration.js';

// Testing Framework
export {
  PLUMCPTestFramework,
  runPLUMCPTests,
  TestResult,
  TestSuite,
  TestCase,
  pluginTests,
  contextTests,
  integrationTests,
  performanceTests,
  securityTests
} from './testing/plumcp_test_framework.js';

// Demo and Examples
export { demonstratePLUMCP, createCustomPluginExample } from '../plumcp_demo.js';

// Types
export * from './types/plugin-interfaces.js';
export * from './types/context-types.js';
export * from './types/mcp-types.js';

// Version and metadata
export const PLUMCP_VERSION = '1.0.0';
export const PLUMCP_DESCRIPTION = 'Plugin Model Control Program - Advanced MCP ecosystem for intelligent development workflows';

/**
 * Quick start function to initialize a complete PLUMCP ecosystem
 */
export async function createPLUMCPEcosystem(options: {
  enableAllPlugins?: boolean;
  customPlugins?: PLUMCPPlugin[];
  orchestrationConfig?: any;
} = {}) {
  const {
    enableAllPlugins = true,
    customPlugins = [],
    orchestrationConfig
  } = options;

  // Initialize core server
  const server = new PLUMCPServer();

  // Load plugins
  if (enableAllPlugins) {
    // Load all built-in plugins
    const registry = new PluginRegistry();

    // System plugins
    await server.loadPlugin(new VirtualFileSystemPlugin());
    await server.loadPlugin(new GuidancePlugin());
    await server.loadPlugin(new ReliabilityEnhancementPlugin());

    // Context plugins
    await server.loadPlugin(new ContextProviderPlugin());
    await server.loadPlugin(new CodeContextPlugin());
    await server.loadPlugin(new IntelligentContextPlugin());

    // IDE plugins
    await server.loadPlugin(new IDEExtensionFrameworkPlugin());
    await server.loadPlugin(new SecureIDECommunicationPlugin());

    // AI plugins
    await server.loadPlugin(new ContextAwareAIPlugin());

    // Infrastructure plugins
    await server.loadPlugin(new DatabasePlugin());
    await server.loadPlugin(new MonitoringPlugin());
  }

  // Load custom plugins
  for (const plugin of customPlugins) {
    await server.loadPlugin(plugin);
  }

  // Initialize orchestration engine
  const orchestrator = new GeminiContextOrchestrator(server.getPluginManager());

  return {
    server,
    orchestrator,
    async start() {
      await server.start();
      console.log('🚀 PLUMCP ecosystem started successfully');
    },
    async stop() {
      await server.stop();
      console.log('🛑 PLUMCP ecosystem stopped');
    }
  };
}

/**
 * Health check function for the PLUMCP ecosystem
 */
export async function checkPLUMCPHealth() {
  const results = {
    version: PLUMCP_VERSION,
    description: PLUMCP_DESCRIPTION,
    timestamp: new Date().toISOString(),
    components: {
      core: 'operational',
      plugins: 'operational',
      orchestration: 'operational',
      testing: 'operational'
    },
    status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy'
  };

  try {
    // Quick validation tests
    const testFramework = new PLUMCPTestFramework();
    const pluginManager = testFramework['pluginManager'];
    const orchestrator = testFramework['orchestrator'];

    if (!pluginManager || !orchestrator) {
      results.status = 'unhealthy';
      results.components.plugins = 'failed';
      results.components.orchestration = 'failed';
    }
  } catch (error) {
    results.status = 'unhealthy';
    results.components.testing = 'failed';
  }

  return results;
}
