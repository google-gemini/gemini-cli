export interface ConfigParameters {
  model?: string;
  sandbox?: boolean;
  debug?: boolean;
  allFiles?: boolean;
  showMemoryUsage?: boolean;
  yolo?: boolean;
  telemetry?: boolean;
  telemetryTarget?: string;
  checkpointing?: boolean;
}

export interface ChatMessage {
  type: string;
  sessionId?: string;
  prompt?: string;
  config?: ConfigParameters;
}

export interface WebSocketMessage {
  type: string;
  sessionId?: string;
  data?: string;
  error?: string;
  exitCode?: number;
}