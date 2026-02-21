/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  checkExhaustive,
  partListUnionToString,
  SESSION_FILE_PREFIX,
  CoreToolCallStatus,
  type Config,
  type ConversationRecord,
  type MessageRecord,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { stripUnsafeCharacters } from '../ui/utils/textUtils.js';
import type { Part } from '@google/genai';
import { MessageType, type HistoryItemWithoutId } from '../ui/types.js';

/**
 * Constant for the resume "latest" identifier.
 * Used when --resume is passed without a value to select the most recent session.
 */
export const RESUME_LATEST = 'latest';

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
export class SessionError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }

  /**
   * Creates an error for when no sessions exist for the current project.
   */
  static noSessionsFound(): SessionError {
    return new SessionError(
      'NO_SESSIONS_FOUND',
      'No previous sessions found for this project.',
    );
  }

  /**
   * Creates an error for when a session identifier is invalid.
   */
  static invalidSessionIdentifier(identifier: string): SessionError {
    return new SessionError(
      'INVALID_SESSION_IDENTIFIER',
      `Invalid session identifier "${identifier}".\n  Use --list-sessions to see available sessions, then use --resume {number}, --resume {uuid}, or --resume latest.`,
    );
  }
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
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
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
export const hasUserOrAssistantMessage = (messages: MessageRecord[]): boolean =>
  messages.some((msg) => msg.type === 'user' || msg.type === 'gemini');

/**
 * Cleans and sanitizes message content for display by:
 * - Converting newlines to spaces
 * - Collapsing multiple whitespace to single spaces
 * - Removing non-printable characters (keeping only ASCII 32-126)
 * - Trimming leading/trailing whitespace
 * @param message - The raw message content to clean
 * @returns Sanitized message suitable for display
 */
export const cleanMessage = (message: string): string =>
  message
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]+/g, '') // Non-printable.
    .trim();

/**
 * Extracts the first meaningful user message from conversation messages.
 */
export const extractFirstUserMessage = (messages: MessageRecord[]): string => {
  const userMessage = messages
    // First try filtering out slash commands.
    .filter((msg) => {
      const content = partListUnionToString(msg.content);
      return (
        !content.startsWith('/') &&
        !content.startsWith('?') &&
        content.trim().length > 0
      );
    })
    .find((msg) => msg.type === 'user');

  let content: string;

  if (!userMessage) {
    // Fallback to first user message even if it's a slash command
    const firstMsg = messages.find((msg) => msg.type === 'user');
    if (!firstMsg) return 'Empty conversation';
    content = cleanMessage(partListUnionToString(firstMsg.content));
  } else {
    content = cleanMessage(partListUnionToString(userMessage.content));
  }

  return content;
};

/**
 * Formats a timestamp as relative time.
 * @param timestamp - The timestamp to format
 * @param style - 'long' (e.g. "2 hours ago") or 'short' (e.g. "2h")
 */
export const formatRelativeTime = (
  timestamp: string,
  style: 'long' | 'short' = 'long',
): string => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (style === 'short') {
    if (diffSeconds < 1) return 'now';
    if (diffSeconds < 60) return `${diffSeconds}s`;
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 30) return `${diffDays}d`;
    const diffMonths = Math.floor(diffDays / 30);
    return diffMonths < 12
      ? `${diffMonths}mo`
      : `${Math.floor(diffMonths / 12)}y`;
  } else {
    if (diffDays > 0) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else {
      return 'Just now';
    }
  }
};

export interface GetSessionOptions {
  /** Whether to load full message content (needed for search) */
  includeFullContent?: boolean;
}

/**
 * Loads all session files (including corrupted ones) from the chats directory.
 * @returns Array of session file entries, with sessionInfo null for corrupted files
 */
export const getAllSessionFiles = async (
  chatsDir: string,
  currentSessionId?: string,
  options: GetSessionOptions = {},
): Promise<SessionFileEntry[]> => {
  try {
    const files = await fs.readdir(chatsDir);
    const sessionFiles = files
      .filter((f) => f.startsWith(SESSION_FILE_PREFIX) && f.endsWith('.json'))
      .sort(); // Sort by filename, which includes timestamp

    const sessionPromises = sessionFiles.map(
      async (file): Promise<SessionFileEntry> => {
        const filePath = path.join(chatsDir, file);
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const content: ConversationRecord = JSON.parse(
            await fs.readFile(filePath, 'utf8'),
          );

          // Validate required fields
          if (
            !content.sessionId ||
            !content.messages ||
            !Array.isArray(content.messages) ||
            !content.startTime ||
            !content.lastUpdated
          ) {
            // Missing required fields - treat as corrupted
            return { fileName: file, sessionInfo: null };
          }

          // Skip sessions that only contain system messages (info, error, warning)
          if (!hasUserOrAssistantMessage(content.messages)) {
            return { fileName: file, sessionInfo: null };
          }

          // Skip subagent sessions - these are implementation details of a tool call
          // and shouldn't be surfaced for resumption in the main agent history.
          if (content.kind === 'subagent') {
            return { fileName: file, sessionInfo: null };
          }

          const firstUserMessage = extractFirstUserMessage(content.messages);
          const isCurrentSession = currentSessionId
            ? file.includes(currentSessionId.slice(0, 8))
            : false;

          let fullContent: string | undefined;
          let messages:
            | Array<{ role: 'user' | 'assistant'; content: string }>
            | undefined;

          if (options.includeFullContent) {
            fullContent = content.messages
              .map((msg) => partListUnionToString(msg.content))
              .join(' ');
            messages = content.messages.map((msg) => ({
              role:
                msg.type === 'user'
                  ? ('user' as const)
                  : ('assistant' as const),
              content: partListUnionToString(msg.content),
            }));
          }

          const sessionInfo: SessionInfo = {
            id: content.sessionId,
            file: file.replace('.json', ''),
            fileName: file,
            startTime: content.startTime,
            lastUpdated: content.lastUpdated,
            messageCount: content.messages.length,
            displayName: content.summary
              ? stripUnsafeCharacters(content.summary)
              : firstUserMessage,
            firstUserMessage,
            isCurrentSession,
            index: 0, // Will be set after sorting valid sessions
            summary: content.summary,
            fullContent,
            messages,
          };

          return { fileName: file, sessionInfo };
        } catch {
          // File is corrupted (can't read or parse JSON)
          return { fileName: file, sessionInfo: null };
        }
      },
    );

    return await Promise.all(sessionPromises);
  } catch (error) {
    // It's expected that the directory might not exist, which is not an error.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    // For other errors (e.g., permissions), re-throw to be handled by the caller.
    throw error;
  }
};

/**
 * Loads all valid session files from the chats directory and converts them to SessionInfo.
 * Corrupted files are automatically filtered out.
 */
export const getSessionFiles = async (
  chatsDir: string,
  currentSessionId?: string,
  options: GetSessionOptions = {},
): Promise<SessionInfo[]> => {
  const allFiles = await getAllSessionFiles(
    chatsDir,
    currentSessionId,
    options,
  );

  // Filter out corrupted files and extract SessionInfo
  const validSessions = allFiles
    .filter(
      (entry): entry is { fileName: string; sessionInfo: SessionInfo } =>
        entry.sessionInfo !== null,
    )
    .map((entry) => entry.sessionInfo);

  // Deduplicate sessions by ID
  const uniqueSessionsMap = new Map<string, SessionInfo>();
  for (const session of validSessions) {
    // If duplicate exists, keep the one with the later lastUpdated timestamp
    if (
      !uniqueSessionsMap.has(session.id) ||
      new Date(session.lastUpdated).getTime() >
        new Date(uniqueSessionsMap.get(session.id)!.lastUpdated).getTime()
    ) {
      uniqueSessionsMap.set(session.id, session);
    }
  }
  const uniqueSessions = Array.from(uniqueSessionsMap.values());

  // Sort by startTime (oldest first) for stable session numbering
  uniqueSessions.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // Set the correct 1-based indexes after sorting
  uniqueSessions.forEach((session, index) => {
    session.index = index + 1;
  });

  return uniqueSessions;
};

/**
 * Utility class for session discovery and selection.
 */
export class SessionSelector {
  constructor(private config: Config) {}

  /**
   * Lists all available sessions for the current project.
   */
  async listSessions(): Promise<SessionInfo[]> {
    const chatsDir = path.join(
      this.config.storage.getProjectTempDir(),
      'chats',
    );
    return getSessionFiles(chatsDir, this.config.getSessionId());
  }

  /**
   * Finds a session by identifier (UUID or numeric index).
   *
   * @param identifier - Can be a full UUID or an index number (1-based)
   * @returns Promise resolving to the found SessionInfo
   * @throws Error if the session is not found or identifier is invalid
   */
  async findSession(identifier: string): Promise<SessionInfo> {
    const sessions = await this.listSessions();

    if (sessions.length === 0) {
      throw SessionError.noSessionsFound();
    }

    // Sort by startTime (oldest first, so newest sessions get highest numbers)
    const sortedSessions = sessions.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    // Try to find by UUID first
    const sessionByUuid = sortedSessions.find(
      (session) => session.id === identifier,
    );
    if (sessionByUuid) {
      return sessionByUuid;
    }

    // Parse as index number (1-based) - only allow numeric indexes
    const index = parseInt(identifier, 10);
    if (
      !isNaN(index) &&
      index.toString() === identifier &&
      index > 0 &&
      index <= sortedSessions.length
    ) {
      return sortedSessions[index - 1];
    }

    throw SessionError.invalidSessionIdentifier(identifier);
  }

  /**
   * Resolves a resume argument to a specific session.
   *
   * @param resumeArg - Can be "latest", a full UUID, or an index number (1-based)
   * @returns Promise resolving to session selection result
   */
  async resolveSession(resumeArg: string): Promise<SessionSelectionResult> {
    let selectedSession: SessionInfo;

    if (resumeArg === RESUME_LATEST) {
      const sessions = await this.listSessions();

      if (sessions.length === 0) {
        throw new Error('No previous sessions found for this project.');
      }

      // Sort by startTime (oldest first, so newest sessions get highest numbers)
      sessions.sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );

      selectedSession = sessions[sessions.length - 1];
    } else {
      try {
        selectedSession = await this.findSession(resumeArg);
      } catch (error) {
        // SessionError already has detailed messages - just rethrow
        if (error instanceof SessionError) {
          throw error;
        }
        // Wrap unexpected errors with context
        throw new Error(
          `Failed to find session "${resumeArg}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return this.selectSession(selectedSession);
  }

  /**
   * Loads session data for a selected session.
   */
  private async selectSession(
    sessionInfo: SessionInfo,
  ): Promise<SessionSelectionResult> {
    const chatsDir = path.join(
      this.config.storage.getProjectTempDir(),
      'chats',
    );
    const sessionPath = path.join(chatsDir, sessionInfo.fileName);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const sessionData: ConversationRecord = JSON.parse(
        await fs.readFile(sessionPath, 'utf8'),
      );

      const displayInfo = `Session ${sessionInfo.index}: ${sessionInfo.firstUserMessage} (${sessionInfo.messageCount} messages, ${formatRelativeTime(sessionInfo.lastUpdated)})`;

      return {
        sessionPath,
        sessionData,
        displayInfo,
      };
    } catch (error) {
      throw new Error(
        `Failed to load session ${sessionInfo.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

/**
 * Converts session/conversation data into UI history and Gemini client history formats.
 */
export function convertSessionToHistoryFormats(
  messages: ConversationRecord['messages'],
): {
  uiHistory: HistoryItemWithoutId[];
  clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }>;
} {
  const uiHistory: HistoryItemWithoutId[] = [];

  for (const msg of messages) {
    // Add the message only if it has content
    const displayContentString = msg.displayContent
      ? partListUnionToString(msg.displayContent)
      : undefined;
    const contentString = partListUnionToString(msg.content);
    const uiText = displayContentString || contentString;

    if (uiText.trim()) {
      let messageType: MessageType;
      switch (msg.type) {
        case 'user':
          messageType = MessageType.USER;
          break;
        case 'info':
          messageType = MessageType.INFO;
          break;
        case 'error':
          messageType = MessageType.ERROR;
          break;
        case 'warning':
          messageType = MessageType.WARNING;
          break;
        case 'gemini':
          messageType = MessageType.GEMINI;
          break;
        default:
          checkExhaustive(msg);
          messageType = MessageType.GEMINI;
          break;
      }

      uiHistory.push({
        type: messageType,
        text: uiText,
      });
    }

    // Add tool calls if present
    if (
      msg.type !== 'user' &&
      'toolCalls' in msg &&
      msg.toolCalls &&
      msg.toolCalls.length > 0
    ) {
      uiHistory.push({
        type: 'tool_group',
        tools: msg.toolCalls.map((tool) => ({
          callId: tool.id,
          name: tool.displayName || tool.name,
          description: tool.description || '',
          renderOutputAsMarkdown: tool.renderOutputAsMarkdown ?? true,
          status:
            tool.status === 'success'
              ? CoreToolCallStatus.Success
              : CoreToolCallStatus.Error,
          resultDisplay: tool.resultDisplay,
          confirmationDetails: undefined,
        })),
      });
    }
  }

  // Convert to Gemini client history format
  const clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }> = [];

  for (const msg of messages) {
    // Skip system/error messages and user slash commands
    if (msg.type === 'info' || msg.type === 'error' || msg.type === 'warning') {
      continue;
    }

    if (msg.type === 'user') {
      // Skip user slash commands
      const contentString = partListUnionToString(msg.content);
      if (
        contentString.trim().startsWith('/') ||
        contentString.trim().startsWith('?')
      ) {
        continue;
      }

      // Add regular user message
      clientHistory.push({
        role: 'user',
        parts: Array.isArray(msg.content)
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (msg.content as Part[])
          : [{ text: contentString }],
      });
    } else if (msg.type === 'gemini') {
      // Handle Gemini messages with potential tool calls
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        // Create model message with function calls
        const modelParts: Part[] = [];

        // Add text content if present
        const contentString = partListUnionToString(msg.content);
        if (msg.content && contentString.trim()) {
          modelParts.push({ text: contentString });
        }

        // Add function calls
        for (const toolCall of msg.toolCalls!) {
          modelParts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.args,
              ...(toolCall.id && { id: toolCall.id }),
            },
          });
        }

        clientHistory.push({
          role: 'model',
          parts: modelParts,
        });

        // Create single function response message with all tool call responses
        const functionResponseParts: Part[] = [];
        for (const toolCall of msg.toolCalls!) {
          if (toolCall.result) {
            // Convert PartListUnion result to function response format
            let responseData: Part;

            if (typeof toolCall.result === 'string') {
              responseData = {
                functionResponse: {
                  id: toolCall.id,
                  name: toolCall.name,
                  response: {
                    output: toolCall.result,
                  },
                },
              };
            } else if (Array.isArray(toolCall.result)) {
              // toolCall.result is an array containing properly formatted
              // function responses
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              functionResponseParts.push(...(toolCall.result as Part[]));
              continue;
            } else {
              // Fallback for non-array results
              responseData = toolCall.result;
            }

            functionResponseParts.push(responseData);
          }
        }

        // Only add user message if we have function responses
        if (functionResponseParts.length > 0) {
          clientHistory.push({
            role: 'user',
            parts: functionResponseParts,
          });
        }
      } else {
        // Regular Gemini message without tool calls
        const contentString = partListUnionToString(msg.content);
        if (msg.content && contentString.trim()) {
          clientHistory.push({
            role: 'model',
            parts: [{ text: contentString }],
          });
        }
      }
    }
  }

  return {
    uiHistory,
    clientHistory,
  };
}
