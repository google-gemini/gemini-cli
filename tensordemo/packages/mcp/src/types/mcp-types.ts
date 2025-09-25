/**
 * MCP (Model Context Protocol) Type Definitions
 */

export interface MCPServer {
  name: string;
  version: string;
  capabilities: {
    tools?: Record<string, any>;
    resources?: Record<string, any>;
    prompts?: Record<string, any>;
  };
}

export interface MCPRequest {
  id: string;
  method: string;
  params: any;
}

export interface MCPResponse {
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPNotification {
  method: string;
  params: any;
}

export interface MCPServerConfig {
  transport: 'stdio' | 'websocket' | 'http';
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  security: {
    sandboxing?: boolean;
    inputValidation?: boolean;
    rateLimiting?: boolean;
  };
}

export interface MCPClientConfig {
  serverUrl?: string;
  transport: 'stdio' | 'websocket' | 'http';
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}
