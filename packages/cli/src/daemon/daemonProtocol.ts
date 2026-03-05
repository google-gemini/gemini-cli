/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PingRequest {
  type: 'ping';
}

export interface PromptRequest {
  type: 'prompt';
  session?: string;
  prompt: string;
}

export interface ListSessionsRequest {
  type: 'list-sessions';
}

export interface ShutdownRequest {
  type: 'shutdown';
}

export type DaemonRequest =
  | PingRequest
  | PromptRequest
  | ListSessionsRequest
  | ShutdownRequest;

export interface PongResponse {
  type: 'pong';
  pid: number;
  version: string;
}

export interface ChunkResponse {
  type: 'chunk';
  text: string;
}

export interface ToolCallResponse {
  type: 'tool-call';
  toolName: string;
  toolId: string;
}

export interface ToolResultResponse {
  type: 'tool-result';
  toolId: string;
  status: 'success' | 'error';
  output?: string;
}

export interface DoneResponse {
  type: 'done';
  session: string;
}

export interface ErrorResponse {
  type: 'error';
  message: string;
}

export interface SessionsListResponse {
  type: 'sessions-list';
  sessions: string[];
}

export interface ShutdownAckResponse {
  type: 'shutdown-ack';
}

export type DaemonResponse =
  | PongResponse
  | ChunkResponse
  | ToolCallResponse
  | ToolResultResponse
  | DoneResponse
  | ErrorResponse
  | SessionsListResponse
  | ShutdownAckResponse;

import path from 'node:path';
import { homedir, GEMINI_DIR } from '@google/gemini-cli-core';

export function defaultSocketPath(): string {
  return path.join(homedir(), GEMINI_DIR, 'daemon.sock');
}

export function daemonPidPath(): string {
  return path.join(homedir(), GEMINI_DIR, 'daemon.pid');
}
