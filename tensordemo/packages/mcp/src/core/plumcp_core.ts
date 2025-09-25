/**
 * PLUMCP (Plugable MCP) Core System
 *
 * A modular MCP server architecture where:
 * - Core MCP server provides only basic protocol handling
 * - ALL functionality is provided by plugins
 * - Plugins are REQUIRED for any MCP operations
 * - Highly extensible and specialized
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// PLUGIN ARCHITECTURE
// ============================================================================

export interface PLUMCPPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: PluginCapability[];
  dependencies: PluginDependency[];
  activate: (context: PluginContext) => Promise<void>;
  deactivate: () => Promise<void>;
}

export interface PluginCapability {
  type: 'tools' | 'resources' | 'prompts' | 'sampling' | 'logging';
  methods: string[];
  schema?: any;
}

export interface PluginDependency {
  pluginId: string;
  version: string;
  required: boolean;
}

export interface PluginContext {
  registerTool: (tool: MCPTool) => void;
  registerResource: (resource: MCPResource) => void;
  registerPrompt: (prompt: MCPPrompt) => void;
  getPlugin: (pluginId: string) => PLUMCPPlugin | undefined;
  emit: (event: string, data: any) => void;
  on: (event: string, handler: (data: any) => void) => void;
}

// MCP Entity Interfaces
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any) => Promise<any>;
  pluginId: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: () => Promise<string>;
  pluginId: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments: PromptArgument[];
  handler: (args: Record<string, any>) => Promise<string>;
  pluginId: string;
}

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

// ============================================================================
// PLUMCP CORE SERVER
// ============================================================================

export class PLUMCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private pluginManager: PluginManager;
  private isInitialized = false;

  constructor() {
    this.pluginManager = new PluginManager();
    this.server = new Server(
      {
        name: 'plumcp-core',
        version: '1.0.0',
      },
      {
        capabilities: {
          // Core declares NO capabilities - plugins provide everything
          tools: {}, // Empty - plugins provide tools
          resources: {}, // Empty - plugins provide resources
          prompts: {}, // Empty - plugins provide prompts
        },
      }
    );

    this.transport = new StdioServerTransport();
    this.setupRequestHandlers();
  }

  private setupRequestHandlers(): void {
    // Tools - DELEGATED TO PLUGINS
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.ensurePluginsLoaded();
      return {
        tools: this.pluginManager.getAllTools().map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.ensurePluginsLoaded();
      const tool = this.pluginManager.getTool(request.params.name);
      if (!tool) {
        throw new Error(`Tool not found: ${request.params.name}. No plugin provides this functionality.`);
      }
      return await tool.handler(request.params.arguments);
    });

    // Resources - DELEGATED TO PLUGINS
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      this.ensurePluginsLoaded();
      return {
        resources: this.pluginManager.getAllResources().map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      this.ensurePluginsLoaded();
      const resource = this.pluginManager.getResource(request.params.uri);
      if (!resource) {
        throw new Error(`Resource not found: ${request.params.uri}. No plugin provides this resource.`);
      }
      return {
        contents: [{
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: await resource.handler(),
        }],
      };
    });

    // Prompts - DELEGATED TO PLUGINS
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      this.ensurePluginsLoaded();
      return {
        prompts: this.pluginManager.getAllPrompts().map(prompt => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments,
        })),
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      this.ensurePluginsLoaded();
      const prompt = this.pluginManager.getPrompt(request.params.name);
      if (!prompt) {
        throw new Error(`Prompt not found: ${request.params.name}. No plugin provides this prompt.`);
      }

      const args = request.params.arguments || {};
      const content = await prompt.handler(args);

      return {
        description: prompt.description,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: content,
          },
        }],
      };
    });
  }

  private ensurePluginsLoaded(): void {
    if (!this.isInitialized) {
      throw new Error(
        'PLUMCP requires plugins to function. No plugins are loaded. ' +
        'Please install and activate plugins to enable MCP functionality.'
      );
    }

    const loadedPlugins = this.pluginManager.getLoadedPlugins();
    if (loadedPlugins.length === 0) {
      throw new Error(
        'PLUMCP requires at least one plugin to function. ' +
        'All plugins are inactive or failed to load.'
      );
    }
  }

  async loadPlugin(plugin: PLUMCPPlugin): Promise<void> {
    await this.pluginManager.loadPlugin(plugin, this.createPluginContext());
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    await this.pluginManager.unloadPlugin(pluginId);
  }

  async start(): Promise<void> {
    // Initialize plugins
    await this.pluginManager.initializePlugins();
    this.isInitialized = true;

    // Start MCP server
    await this.server.connect(this.transport);
    console.error('PLUMCP Core started - awaiting plugin functionality');
  }

  private createPluginContext(): PluginContext {
    return {
      registerTool: (tool: MCPTool) => this.pluginManager.registerTool(tool),
      registerResource: (resource: MCPResource) => this.pluginManager.registerResource(resource),
      registerPrompt: (prompt: MCPPrompt) => this.pluginManager.registerPrompt(prompt),
      getPlugin: (pluginId: string) => this.pluginManager.getPlugin(pluginId),
      emit: (event: string, data: any) => this.pluginManager.emit(event, data),
      on: (event: string, handler: (data: any) => void) => this.pluginManager.on(event, handler),
    };
  }

  getPluginManager(): PluginManager {
    return this.pluginManager;
  }
}

// ============================================================================
// PLUGIN MANAGER - CORE OF PLUGABILITY
// ============================================================================

export class PluginManager {
  private plugins: Map<string, PLUMCPPlugin> = new Map();
  private loadedPlugins: Set<string> = new Set();
  private tools: Map<string, MCPTool> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private prompts: Map<string, MCPPrompt> = new Map();
  private eventListeners: Map<string, ((data: any) => void)[]> = new Map();

  async loadPlugin(plugin: PLUMCPPlugin, context: PluginContext): Promise<void> {
    // Check dependencies
    await this.checkDependencies(plugin);

    // Activate plugin
    await plugin.activate(context);

    // Register plugin
    this.plugins.set(plugin.id, plugin);
    this.loadedPlugins.add(plugin.id);

    console.error(`PLUMCP Plugin loaded: ${plugin.name} (${plugin.version})`);
    this.emit('plugin:loaded', { pluginId: plugin.id, plugin: plugin });
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    // Deactivate plugin
    await plugin.deactivate();

    // Remove all registrations from this plugin
    this.tools = new Map([...this.tools].filter(([_, tool]) => tool.pluginId !== pluginId));
    this.resources = new Map([...this.resources].filter(([_, resource]) => resource.pluginId !== pluginId));
    this.prompts = new Map([...this.prompts].filter(([_, prompt]) => prompt.pluginId !== pluginId));

    // Unregister plugin
    this.plugins.delete(pluginId);
    this.loadedPlugins.delete(pluginId);

    console.error(`PLUMCP Plugin unloaded: ${plugin.name}`);
    this.emit('plugin:unloaded', { pluginId });
  }

  async initializePlugins(): Promise<void> {
    // Load plugins from configuration or discovery
    const configuredPlugins = await this.discoverPlugins();

    if (configuredPlugins.length === 0) {
      console.error('WARNING: No plugins configured. PLUMCP will not function without plugins.');
      console.error('Install plugins to enable MCP functionality.');
      return;
    }

    const context = this.createInternalContext();

    for (const plugin of configuredPlugins) {
      try {
        await this.loadPlugin(plugin, context);
      } catch (error) {
        console.error(`Failed to load plugin ${plugin.name}:`, error);
      }
    }
  }

  private async discoverPlugins(): Promise<PLUMCPPlugin[]> {
    // In a real implementation, this would scan plugin directories,
    // check package.json files, or query a plugin registry
    // For now, return empty array - plugins must be explicitly loaded
    return [];
  }

  private async checkDependencies(plugin: PLUMCPPlugin): Promise<void> {
    for (const dep of plugin.dependencies) {
      const installedPlugin = this.plugins.get(dep.pluginId);

      if (!installedPlugin) {
        if (dep.required) {
          throw new Error(`Required dependency not found: ${dep.pluginId}`);
        }
        continue;
      }

      if (!this.isVersionCompatible(installedPlugin.version, dep.version)) {
        throw new Error(`Dependency version mismatch: ${dep.pluginId} ${installedPlugin.version} != ${dep.version}`);
      }
    }
  }

  private isVersionCompatible(installed: string, required: string): boolean {
    // Simple semver check - in reality, use a proper semver library
    return installed === required; // For now, exact match only
  }

  private createInternalContext(): PluginContext {
    return {
      registerTool: (tool: MCPTool) => this.registerTool(tool),
      registerResource: (resource: MCPResource) => this.registerResource(resource),
      registerPrompt: (prompt: MCPPrompt) => this.registerPrompt(prompt),
      getPlugin: (pluginId: string) => this.getPlugin(pluginId),
      emit: (event: string, data: any) => this.emit(event, data),
      on: (event: string, handler: (data: any) => void) => this.on(event, handler),
    };
  }

  // Registration methods
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    this.emit('tool:registered', { tool: tool.name, plugin: tool.pluginId });
  }

  registerResource(resource: MCPResource): void {
    this.resources.set(resource.uri, resource);
    this.emit('resource:registered', { resource: resource.uri, plugin: resource.pluginId });
  }

  registerPrompt(prompt: MCPPrompt): void {
    this.prompts.set(prompt.name, prompt);
    this.emit('prompt:registered', { prompt: prompt.name, plugin: prompt.pluginId });
  }

  // Access methods
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getResource(uri: string): MCPResource | undefined {
    return this.resources.get(uri);
  }

  getPrompt(name: string): MCPPrompt | undefined {
    return this.prompts.get(name);
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getAllResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  getAllPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values());
  }

  getPlugin(pluginId: string): PLUMCPPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getLoadedPlugins(): PLUMCPPlugin[] {
    return Array.from(this.loadedPlugins).map(id => this.plugins.get(id)!);
  }

  // Event system
  emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  on(event: string, handler: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
  }
}

// ============================================================================
// EXAMPLE PLUGINS
// ============================================================================

// Core Tools Plugin - Provides essential MCP tools
export class CoreToolsPlugin implements PLUMCPPlugin {
  id = 'plumcp-core-tools';
  name = 'PLUMCP Core Tools';
  version = '1.0.0';
  description = 'Essential MCP tools for basic functionality';
  capabilities = [{
    type: 'tools' as const,
    methods: ['echo', 'get_system_info', 'list_plugins']
  }];
  dependencies = [];

  async activate(context: PluginContext): Promise<void> {
    // Register core tools
    context.registerTool({
      name: 'echo',
      description: 'Echo back the input text',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to echo' }
        },
        required: ['text']
      },
      handler: async (args: { text: string }) => ({ result: args.text }),
      pluginId: this.id
    });

    context.registerTool({
      name: 'get_system_info',
      description: 'Get basic system information',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime()
      }),
      pluginId: this.id
    });

    context.registerTool({
      name: 'list_plugins',
      description: 'List all loaded PLUMCP plugins',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        // This would need access to plugin manager
        return { plugins: ['core-tools'], note: 'Plugin listing requires enhanced context' };
      },
      pluginId: this.id
    });

    console.error(`PLUMCP Core Tools Plugin activated`);
  }

  async deactivate(): Promise<void> {
    console.error(`PLUMCP Core Tools Plugin deactivated`);
  }
}

// File System Plugin - Provides file operations
export class FileSystemPlugin implements PLUMCPPlugin {
  id = 'plumcp-filesystem';
  name = 'PLUMCP File System';
  version = '1.0.0';
  description = 'File system operations and resource access';
  capabilities = [
    {
      type: 'tools' as const,
      methods: ['read_file', 'list_directory']
    },
    {
      type: 'resources' as const,
      methods: ['read']
    }
  ];
  dependencies = [];

  async activate(context: PluginContext): Promise<void> {
    // Register file tools
    context.registerTool({
      name: 'read_file',
      description: 'Read the contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' }
        },
        required: ['path']
      },
      handler: async (args: { path: string }) => {
        const fs = require('fs').promises;
        try {
          const content = await fs.readFile(args.path, 'utf8');
          return { content, path: args.path };
        } catch (error) {
          throw new Error(`Failed to read file ${args.path}: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    context.registerTool({
      name: 'list_directory',
      description: 'List contents of a directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the directory' }
        },
        required: ['path']
      },
      handler: async (args: { path: string }) => {
        const fs = require('fs').promises;
        try {
          const entries = await fs.readdir(args.path, { withFileTypes: true });
          return {
            path: args.path,
            entries: entries.map(entry => ({
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file'
            }))
          };
        } catch (error) {
          throw new Error(`Failed to list directory ${args.path}: ${error.message}`);
        }
      },
      pluginId: this.id
    });

    // Register file resources
    context.registerResource({
      uri: 'file://system/info',
      name: 'System Information',
      description: 'Basic system information',
      mimeType: 'application/json',
      handler: async () => JSON.stringify({
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        plugin: this.name
      }, null, 2),
      pluginId: this.id
    });

    console.error(`PLUMCP File System Plugin activated`);
  }

  async deactivate(): Promise<void> {
    console.error(`PLUMCP File System Plugin deactivated`);
  }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

export async function createPLUMCPServer(): Promise<PLUMCPServer> {
  const server = new PLUMCPServer();

  // Load essential plugins
  await server.loadPlugin(new CoreToolsPlugin());
  await server.loadPlugin(new FileSystemPlugin());

  return server;
}

// Example of starting PLUMCP
export async function startPLUMCP(): Promise<void> {
  console.error('Starting PLUMCP (Plugable MCP) Server...');
  console.error('Note: PLUMCP requires plugins to function - no built-in capabilities');

  const server = await createPLUMCPServer();
  await server.start();

  console.error('PLUMCP Server ready - all functionality provided by plugins');
}

// Export everything needed for plugins
export {
  type PLUMCPPlugin,
  type PluginCapability,
  type PluginDependency,
  type PluginContext,
  type MCPTool,
  type MCPResource,
  type MCPPrompt,
  type PromptArgument
};
