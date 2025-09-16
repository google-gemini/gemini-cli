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
  tool_call_id?: string;
  name?: string;
  timestamp?: Date;
}

export interface UniversalResponse {
  content: string;
  llmContent?: string; // Tool response content for LLM display
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
}

export interface CompressionInfo {
  originalTokenCount: number;
  newTokenCount: number;
  compressionRatio: number;
}

export interface UniversalStreamEvent {
  type: 'content' | 'content_delta' | 'tool_call' | 'tool_response' | 'done' | 'message_complete' | 'error' | 'compression';
  content?: string;
  toolCall?: ToolCall;
  toolCallId?: string;
  toolName?: string;
  toolSuccess?: boolean;  // Added to indicate tool execution success/failure
  toolResponseData?: ToolResponseData;  // Structured tool response data
  response?: UniversalResponse;
  compressionInfo?: CompressionInfo;
  error?: Error | string;
  role?: 'assistant' | 'user' | 'system';
  timestamp?: number;
}

export interface ToolResponseData {
  operation: string;
  summary: string;
  details?: Record<string, unknown>;
  metrics?: {
    rowsAffected?: number;
    columnsAffected?: number;
    cellsAffected?: number;
    duration?: number;
  };
  files?: {
    input?: string[];
    output?: string[];
    created?: string[];
    workbook?: string;
    worksheet?: string;
  };
  nextActions?: string[];
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

export interface TemplateVariable {
  readonly name: string;
  readonly type: 'text' | 'number' | 'boolean' | 'file_path' | 'directory_path';
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly placeholder?: string;
  readonly validation?: {
    readonly pattern?: string;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly min?: number;
    readonly max?: number;
  };
}

export interface PresetTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly icon: string;
  readonly template: string;
  readonly variables: readonly TemplateVariable[];
  readonly tags: readonly string[];
  readonly author?: string;
  readonly version: string;
  readonly lastModified: Date;
  readonly usageCount?: number;
  readonly isBuiltin: boolean;
  // GUI-specific field for simplified templates
  readonly content?: string;
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
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  error?: string;
  toolSuccess?: boolean;  // Added to indicate tool execution success/failure
  toolResponseData?: ToolResponseData;  // Structured tool response data
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
  lastUsed: Date;
  description?: string;
}

export interface AuthConfig {
  gemini?: {
    type: 'oauth' | 'api_key';
    oauthToken?: string;
    // Note: API key is read from GEMINI_API_KEY environment variable, not stored in config
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

// Tool confirmation types (defined locally to avoid WASM dependencies)
export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAlwaysServer = 'proceed_always_server',
  ProceedAlwaysTool = 'proceed_always_tool',
  ModifyWithEditor = 'modify_with_editor',
  Cancel = 'cancel',
}

export interface ToolEditConfirmationDetails {
  type: 'edit';
  title: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: any,
  ) => Promise<void>;
  fileName: string;
  filePath: string;
  fileDiff: string;
  originalContent: string | null;
  newContent: string;
}

export interface ToolExecuteConfirmationDetails {
  type: 'exec';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  command: string;
  rootCommand: string;
}

export interface ToolMcpConfirmationDetails {
  type: 'mcp';
  title: string;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

export interface ToolInfoConfirmationDetails {
  type: 'info';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  prompt: string;
  urls?: string[];
}

export type ToolCallConfirmationDetails =
  | ToolEditConfirmationDetails
  | ToolExecuteConfirmationDetails
  | ToolMcpConfirmationDetails
  | ToolInfoConfirmationDetails;

export interface AppState {
  // Session management
  sessions: ChatSession[];
  activeSessionId: string | null;
  
  // Model and authentication
  currentProvider: ModelProviderType;
  currentModel: string;
  authConfig: AuthConfig;
  
  // Workspace
  currentWorkspace: WorkspaceConfig | null;
  workspaces: WorkspaceConfig[];
  
  // UI state
  language: Language;
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  initialized: boolean;
  
  // Role system
  currentRole: string;
  customRoles: RoleDefinition[];
  builtinRoles: RoleDefinition[];
}

