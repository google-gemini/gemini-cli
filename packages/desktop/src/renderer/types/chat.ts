export interface ToolCall {
  callId: string;
  name: string;
  args?: Record<string, unknown>;
  status?: 'pending' | 'approved' | 'rejected' | 'executing' | 'success' | 'error';
  result?: unknown;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolRequest {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  messageIndex: number;
}

export interface StreamEvent {
  type: string;
  value?: unknown;
}

export interface GeminiContentEvent extends StreamEvent {
  type: 'content';
  value: string;
}

export interface GeminiToolCallRequestEvent extends StreamEvent {
  type: 'tool_call_request';
  value: {
    callId: string;
    name: string;
    args: Record<string, unknown>;
  };
}

export interface GeminiToolCallResponseEvent extends StreamEvent {
  type: 'tool_call_response';
  value: {
    callId: string;
    result?: unknown;
    error?: string;
  };
}

export interface GeminiFinishedEvent extends StreamEvent {
  type: 'finished';
  value: {
    reason: string;
    usageMetadata?: unknown;
  };
}

export interface GeminiErrorEvent extends StreamEvent {
  type: 'error';
  value: {
    error: string;
  };
}

export type GeminiStreamEvent =
  | GeminiContentEvent
  | GeminiToolCallRequestEvent
  | GeminiToolCallResponseEvent
  | GeminiFinishedEvent
  | GeminiErrorEvent
  | StreamEvent;
