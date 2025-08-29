// Import types from core when available, otherwise define locally
// import type { PresetTemplate } from '@google/gemini-cli-core';

// Temporarily define core types locally until build issues are resolved
export enum ModelProviderType {
  GEMINI = 'gemini',
  OPENAI = 'openai', 
  LM_STUDIO = 'lm_studio',
  ANTHROPIC = 'anthropic',
  CUSTOM = 'custom'
}

export interface ModelProviderConfig {
  type: ModelProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  authType?: string;
  additionalConfig?: Record<string, unknown>;
  displayName?: string;
  isDefault?: boolean;
  lastUsed?: Date;
}

export interface UniversalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface UniversalResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
}

export interface UniversalStreamEvent {
  type: 'content' | 'content_delta' | 'tool_call' | 'done' | 'message_complete' | 'error';
  content?: string;
  toolCall?: ToolCall;
  response?: UniversalResponse;
  error?: Error | string;
  role?: 'assistant' | 'user' | 'system';
  timestamp?: number;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  category: 'development' | 'office' | 'creative' | 'education' | 'custom';
  icon?: string;
  tools?: string[];
  isBuiltin?: boolean;
  modelPreferences?: {
    preferred: ModelProviderType[];
    fallback: ModelProviderType;
  };
}

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  variables: TemplateVariable[];
  content: string;
  tags: string[];
  isBuiltin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiline';
  description: string;
  required: boolean;
  defaultValue?: any;
  options?: any[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessage[];
  provider: ModelProviderType;
  model: string;
  roleId: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}

export interface SessionConfig {
  modelProvider: ModelProviderType;
  model: string;
  role: string;
  workspaceId: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface SessionMetadata {
  messageCount: number;
  tokenUsage: number;
  lastActivity: Date;
  tags: string[];
  pinned: boolean;
  archived: boolean;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  directories: string[];
  createdAt: Date;
  description?: string;
}

export interface AuthConfig {
  gemini?: {
    type: 'oauth' | 'api_key';
    apiKey?: string;
    oauthToken?: string;
  };
  openai?: {
    apiKey: string;
    organization?: string;
  };
  lmStudio?: {
    baseUrl: string;
    apiKey?: string;
  };
}

export type Language = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppState {
  // Session management
  sessions: ChatSession[];
  activeSessionId: string | null;
  
  // Model and authentication
  currentProvider: ModelProviderType;
  currentModel: string;
  authConfig: AuthConfig;
  availableModels: Record<string, string[]>;
  
  // Workspace
  currentWorkspace: WorkspaceConfig | null;
  workspaces: WorkspaceConfig[];
  
  // UI state
  language: Language;
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  
  // Role system
  currentRole: string;
  customRoles: RoleDefinition[];
  builtinRoles: RoleDefinition[];
  
  // Templates
  templates: PresetTemplate[];
}

