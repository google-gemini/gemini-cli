/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion } from '@google/genai';
import type { Status } from '../scheduler/types.js';
import type { ToolResultDisplay } from '../tools/tools.js';
import { type ThoughtSummary } from '../utils/thoughtUtils.js';

export const SESSION_FILE_PREFIX = 'session-';
export const MAX_HISTORY_MESSAGES = 50;
export const MAX_TOOL_OUTPUT_SIZE = 50 * 1024; // 50KB

/**
 * Token usage summary for a message or conversation.
 */
export interface TokensSummary {
  input: number; // promptTokenCount
  output: number; // candidatesTokenCount
  cached: number; // cachedContentTokenCount
  thoughts?: number; // thoughtsTokenCount
  tool?: number; // toolUsePromptTokenCount
  total: number; // totalTokenCount
}

/**
 * Base fields common to all messages.
 */
export interface BaseMessageRecord {
  id: string;
  timestamp: string;
  content: PartListUnion;
  displayContent?: PartListUnion;
}

/**
 * Record of a tool call execution within a conversation.
 */
export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: PartListUnion | null;
  status: Status;
  timestamp: string;
  agentId?: string;
  // UI-specific fields for display purposes
  displayName?: string;
  description?: string;
  resultDisplay?: ToolResultDisplay;
  renderOutputAsMarkdown?: boolean;
}

/**
 * Message type and message type-specific fields.
 */
export type ConversationRecordExtra =
  | {
      type: 'user' | 'info' | 'error' | 'warning';
    }
  | {
      type: 'gemini';
      toolCalls?: ToolCallRecord[];
      thoughts?: Array<ThoughtSummary & { timestamp: string }>;
      tokens?: TokensSummary | null;
      model?: string;
    };

/**
 * A single message record in a conversation.
 */
export type MessageRecord = BaseMessageRecord & ConversationRecordExtra;

/**
 * Complete conversation record stored in session files.
 */
export interface ConversationRecord {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  messages: MessageRecord[];
  summary?: string;
  /** Workspace directories added during the session via /dir add */
  directories?: string[];
  /** The kind of conversation (main agent or subagent) */
  kind?: 'main' | 'subagent';
}

/**
 * Data structure for resuming an existing session.
 */
export interface ResumedSessionData {
  conversation: ConversationRecord;
  filePath: string;
}

/**
 * Loads a ConversationRecord from a JSONL session file.
 * Returns null if the file is invalid or cannot be read.
 */
export interface LoadConversationOptions {
  maxMessages?: number;
  metadataOnly?: boolean;
}

export interface RewindRecord {
  $rewindTo: string;
}

export interface MetadataUpdateRecord {
  $set: Partial<ConversationRecord>;
}

export interface PartialMetadataRecord {
  sessionId: string;
  projectHash: string;
  startTime?: string;
  lastUpdated?: string;
  summary?: string;
  directories?: string[];
  kind?: 'main' | 'subagent';
}
