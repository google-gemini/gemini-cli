/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// JSON-RPC 2.0 base types
export interface JSONRPCMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
}

export interface JSONRPCRequest extends JSONRPCMessage {
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse extends JSONRPCMessage {
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface Agent {
  a2a: {
    url: string;
  };
}

// A2A Protocol Types
export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string;
}

export interface Task {
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
  kind: 'task';
}

export interface Message {
  role: 'user' | 'agent';
  parts: Part[];
  messageId?: string;
  taskId?: string;
  contextId?: string;
  kind?: 'message';
  metadata?: Record<string, unknown>;
  sourceAgentId?: string;
  sourceAgentName?: string;
  isA2AMessage?: boolean;
}

export type Part = TextPart | FilePart;

export interface TextPart {
  kind: 'text';
  text: string;
  metadata?: Record<string, unknown>;
}

export interface FilePart {
  kind: 'file';
  file: FileWithBytes | FileWithUri;
  metadata?: Record<string, unknown>;
}

export interface FileWithBytes {
  name: string;
  mimeType: string;
  bytes: string; // base64 encoded
}

export interface FileWithUri {
  name: string;
  mimeType: string;
  uri: string;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  parts: Part[];
}

// Method-specific types
export interface MessageSendParams {
  message: Message;
  metadata?: Record<string, unknown>;
  [key: string]: unknown; // Allow additional properties for JSON-RPC compatibility
}

// A2A Client types
export interface A2AClientConfig {
  baseUrl: string;
  authentication?: {
    type: string;
    credentials: Record<string, unknown>;
  };
  timeout?: number;
}
