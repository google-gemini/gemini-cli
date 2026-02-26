/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  type Config,
  type ConversationRecord,
  type MessageRecord,
} from '@google/gemini-cli-core';
import type { Part } from '@google/genai';
import { type HistoryItemWithoutId } from '../ui/types.js';
/**
 * Constant for the resume "latest" identifier.
 * Used when --resume is passed without a value to select the most recent session.
 */
export declare const RESUME_LATEST = 'latest';
/**
 * Error codes for session-related errors.
 */
export type SessionErrorCode =
  | 'NO_SESSIONS_FOUND'
  | 'INVALID_SESSION_IDENTIFIER';
/**
 * Error thrown for session-related failures.
 * Uses a code field to differentiate between error types.
 */
export declare class SessionError extends Error {
  readonly code: SessionErrorCode;
  constructor(code: SessionErrorCode, message: string);
  /**
   * Creates an error for when no sessions exist for the current project.
   */
  static noSessionsFound(): SessionError;
  /**
   * Creates an error for when a session identifier is invalid.
   */
  static invalidSessionIdentifier(identifier: string): SessionError;
}
/**
 * Represents a text match found during search with surrounding context.
 */
export interface TextMatch {
  /** Text content before the match (with ellipsis if truncated) */
  before: string;
  /** The exact matched text */
  match: string;
  /** Text content after the match (with ellipsis if truncated) */
  after: string;
  /** Role of the message author where the match was found */
  role: 'user' | 'assistant';
}
/**
 * Session information for display and selection purposes.
 */
export interface SessionInfo {
  /** Unique session identifier (filename without .json) */
  id: string;
  /** Filename without extension */
  file: string;
  /** Full filename including .json extension */
  fileName: string;
  /** ISO timestamp when session started */
  startTime: string;
  /** Total number of messages in the session */
  messageCount: number;
  /** ISO timestamp when session was last updated */
  lastUpdated: string;
  /** Display name for the session (typically first user message) */
  displayName: string;
  /** Cleaned first user message content */
  firstUserMessage: string;
  /** Whether this is the currently active session */
  isCurrentSession: boolean;
  /** Display index in the list */
  index: number;
  /** AI-generated summary of the session (if available) */
  summary?: string;
  /** Full concatenated content (only loaded when needed for search) */
  fullContent?: string;
  /** Processed messages with normalized roles (only loaded when needed) */
  messages?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  /** Search result snippets when filtering */
  matchSnippets?: TextMatch[];
  /** Total number of matches found in this session */
  matchCount?: number;
}
/**
 * Represents a session file, which may be valid or corrupted.
 */
export interface SessionFileEntry {
  /** Full filename including .json extension */
  fileName: string;
  /** Parsed session info if valid, null if corrupted */
  sessionInfo: SessionInfo | null;
}
/**
 * Result of resolving a session selection argument.
 */
export interface SessionSelectionResult {
  sessionPath: string;
  sessionData: ConversationRecord;
  displayInfo: string;
}
/**
 * Checks if a session has at least one user or assistant (gemini) message.
 * Sessions with only system messages (info, error, warning) are considered empty.
 * @param messages - The array of message records to check
 * @returns true if the session has meaningful content
 */
export declare const hasUserOrAssistantMessage: (
  messages: MessageRecord[],
) => boolean;
/**
 * Cleans and sanitizes message content for display by:
 * - Converting newlines to spaces
 * - Collapsing multiple whitespace to single spaces
 * - Removing non-printable characters (keeping only ASCII 32-126)
 * - Trimming leading/trailing whitespace
 * @param message - The raw message content to clean
 * @returns Sanitized message suitable for display
 */
export declare const cleanMessage: (message: string) => string;
/**
 * Extracts the first meaningful user message from conversation messages.
 */
export declare const extractFirstUserMessage: (
  messages: MessageRecord[],
) => string;
/**
 * Formats a timestamp as relative time.
 * @param timestamp - The timestamp to format
 * @param style - 'long' (e.g. "2 hours ago") or 'short' (e.g. "2h")
 */
export declare const formatRelativeTime: (
  timestamp: string,
  style?: 'long' | 'short',
) => string;
export interface GetSessionOptions {
  /** Whether to load full message content (needed for search) */
  includeFullContent?: boolean;
}
/**
 * Loads all session files (including corrupted ones) from the chats directory.
 * @returns Array of session file entries, with sessionInfo null for corrupted files
 */
export declare const getAllSessionFiles: (
  chatsDir: string,
  currentSessionId?: string,
  options?: GetSessionOptions,
) => Promise<SessionFileEntry[]>;
/**
 * Loads all valid session files from the chats directory and converts them to SessionInfo.
 * Corrupted files are automatically filtered out.
 */
export declare const getSessionFiles: (
  chatsDir: string,
  currentSessionId?: string,
  options?: GetSessionOptions,
) => Promise<SessionInfo[]>;
/**
 * Utility class for session discovery and selection.
 */
export declare class SessionSelector {
  private config;
  constructor(config: Config);
  /**
   * Lists all available sessions for the current project.
   */
  listSessions(): Promise<SessionInfo[]>;
  /**
   * Finds a session by identifier (UUID or numeric index).
   *
   * @param identifier - Can be a full UUID or an index number (1-based)
   * @returns Promise resolving to the found SessionInfo
   * @throws Error if the session is not found or identifier is invalid
   */
  findSession(identifier: string): Promise<SessionInfo>;
  /**
   * Resolves a resume argument to a specific session.
   *
   * @param resumeArg - Can be "latest", a full UUID, or an index number (1-based)
   * @returns Promise resolving to session selection result
   */
  resolveSession(resumeArg: string): Promise<SessionSelectionResult>;
  /**
   * Loads session data for a selected session.
   */
  private selectSession;
}
/**
 * Converts session/conversation data into UI history and Gemini client history formats.
 */
export declare function convertSessionToHistoryFormats(
  messages: ConversationRecord['messages'],
): {
  uiHistory: HistoryItemWithoutId[];
  clientHistory: Array<{
    role: 'user' | 'model';
    parts: Part[];
  }>;
};
