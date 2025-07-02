export interface GeminiConfig {
  model: string;
  sandbox: boolean;
  debug: boolean;
  allFiles: boolean;
  showMemoryUsage: boolean;
  yolo: boolean;
  telemetry: boolean;
  telemetryTarget?: string;
  telemetryOtlpEndpoint?: string;
  telemetryLogPrompts?: boolean;
  checkpointing: boolean;
  sandboxImage?: string;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  config: GeminiConfig;
  messages: ChatMessage[];
  status: 'ready' | 'active' | 'completed' | 'error';
  createdAt: Date;
  lastActivity?: Date;
}

export interface WebSocketMessage {
  type: 'chat' | 'start' | 'output' | 'error' | 'complete';
  sessionId?: string;
  prompt?: string;
  config?: GeminiConfig;
  data?: string;
  exitCode?: number;
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ConfigOptions {
  models: string[];
  sandboxOptions: boolean[];
  telemetryTargets: string[];
  defaultConfig: GeminiConfig;
}