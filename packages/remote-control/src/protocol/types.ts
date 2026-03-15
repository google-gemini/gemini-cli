/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Message types and status enums
// ---------------------------------------------------------------------------

export enum RemoteControlMessageType {
  // Session lifecycle
  SESSION_INIT = 'session_init',
  SESSION_CONNECT = 'session_connect',
  SESSION_DISCONNECT = 'session_disconnect',
  SESSION_RESUME = 'session_resume',

  // Conversation
  USER_MESSAGE = 'user_message',
  AGENT_RESPONSE = 'agent_response',
  AGENT_RESPONSE_CHUNK = 'agent_response_chunk',
  AGENT_THOUGHT = 'agent_thought',

  // Tool execution
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  TOOL_APPROVAL_REQUEST = 'tool_approval_request',
  TOOL_APPROVAL_RESPONSE = 'tool_approval_response',

  // Infrastructure
  STATUS_UPDATE = 'status_update',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat',
  HEARTBEAT_ACK = 'heartbeat_ack',
}

// ---------------------------------------------------------------------------
// Core message envelope
// ---------------------------------------------------------------------------

export interface RemoteControlMessage {
  type: RemoteControlMessageType;
  sessionId: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** UUID identifying this specific message */
  messageId: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface SessionInitPayload {
  workspacePath: string;
  projectName?: string;
  modelId: string;
  approvalMode: RemoteApprovalMode;
  capabilities: SessionCapabilities;
}

export type RemoteApprovalMode = 'default' | 'auto_edit' | 'yolo' | 'plan';

export interface SessionCapabilities {
  supportsImages: boolean;
  supportsAudio: boolean;
  supportsFiles: boolean;
  supportsMcp: boolean;
}

export interface UserMessagePayload {
  content: string;
  attachments?: RemoteAttachment[];
}

export interface RemoteAttachment {
  type: 'file' | 'image';
  name: string;
  /** Base64-encoded file content */
  content: string;
  mimeType: string;
}

export interface AgentResponseChunkPayload {
  text: string;
  /** True when this chunk is the final chunk for this response turn */
  isComplete: boolean;
}

export interface AgentResponsePayload {
  text: string;
  usage?: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  };
}

export interface ToolCallPayload {
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  requiresApproval: boolean;
}

export interface ToolApprovalRequestPayload {
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  description: string;
}

export interface ToolApprovalResponsePayload {
  toolCallId: string;
  approved: boolean;
  reason?: string;
}

export type SessionStatus =
  | 'idle'
  | 'processing'
  | 'waiting_approval'
  | 'error';

export interface StatusUpdatePayload {
  status: SessionStatus;
  message?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Session and configuration types
// ---------------------------------------------------------------------------

export interface SessionInfo {
  sessionId: string;
  /** WebSocket URL remote clients should connect to */
  url: string;
  /** Session authentication token */
  token: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 expiry timestamp */
  expiresAt: string;
  projectName?: string;
}

export interface RemoteControlOptions {
  name?: string;
  verbose?: boolean;
  /** Port override; 0 = OS-assigned (default) */
  port?: number;
  /** Host override for the displayed URL */
  host?: string;
}

export interface RemoteControlSettings {
  enabled: boolean;
  autoStart: boolean;
  defaultSessionName?: string;
  /** Transport backend ('local' = local WebSocket server) */
  relayService: 'local';
  /** Session idle timeout in milliseconds */
  timeout: number;
  maxSessions: number;
  port: number;
}
