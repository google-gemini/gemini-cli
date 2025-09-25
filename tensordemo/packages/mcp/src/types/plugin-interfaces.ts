/**
 * PLUMCP Plugin Interface Definitions
 */

export interface PLUMCPPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  capabilities: PluginCapability[];
  dependencies: PluginDependency[];
  activate(context: PluginContext): Promise<void>;
  deactivate(): Promise<void>;
}

export interface PluginCapability {
  type: 'tool' | 'resource' | 'prompt';
  name: string;
  description: string;
}

export interface PluginDependency {
  pluginId: string;
  version: string;
  required: boolean;
}

export interface PluginContext {
  registerTool(tool: MCPTool): void;
  registerResource(resource: MCPResource): void;
  registerPrompt(prompt: MCPPrompt): void;
  getPlugin(pluginId: string): PLUMCPPlugin | undefined;
  emit(event: string, data: any): void;
  on(event: string, listener: (data: any) => void): void;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any) => Promise<any>;
  pluginId?: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: () => Promise<any>;
  pluginId?: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments: any[];
  handler: (args: any) => Promise<any>;
  pluginId?: string;
}
