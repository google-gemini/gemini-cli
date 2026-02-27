export type DashboardEventType =
  | 'session_start'
  | 'think'
  | 'act'
  | 'observe'
  | 'session_end'
  | 'token_usage'
  | 'screenshot';

export interface DashboardEvent {
  type: DashboardEventType;
  timestamp?: string;
  iteration?: number;
  content?: string;
  tool?: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
    estimatedCostUsd: number;
  };
  screenshotBase64?: string;
}

export interface TokenUsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  sessions: number;
}
