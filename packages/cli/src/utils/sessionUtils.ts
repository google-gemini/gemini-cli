/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildSessionName,
  checkExhaustive,
  ensureSessionNameBase,
  getDefaultSessionNameBase,
  partListUnionToString,
  sanitizeFilenamePart,
  SESSION_FILE_PREFIX,
  Storage,
  type Config,
  type ConversationRecord,
  type MessageRecord,
  getSessionNameSuffix,
  normalizeSessionNameSuffix,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { stripUnsafeCharacters } from '../ui/utils/textUtils.js';
import type { Part } from '@google/genai';
import {
  MessageType,
  ToolCallStatus,
  type HistoryItemWithoutId,
} from '../ui/types.js';

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
      'No previous sessions found.',
    );
  }

  /**
   * Creates an error for when a session identifier is invalid.
   */
  static invalidSessionIdentifier(identifier: string): SessionError {
    return new SessionError(
      'INVALID_SESSION_IDENTIFIER',
      `Invalid session identifier "${identifier}".\n  Use --list-sessions to see available sessions, then use --resume {name}, --resume {number}, --resume {uuid}, or --resume latest.`,
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
  /** Shell-friendly resumable session name: <base>-<immutableSuffix> */
  sessionName: string;
  /** Mutable base segment of sessionName */
  sessionNameBase: string;
  /** Immutable 5-char suffix segment of sessionName */
  sessionNameSuffix: string;
  /** Cleaned first user message content */
  firstUserMessage: string;
  /** Whether this is the currently active session */
  isCurrentSession: boolean;
  /** Display index in the list */
  index: number;
  /** AI-generated summary of the session (if available) */
  summary?: string;
  /** Project root where this session was created (if known) */
  projectRoot?: string;
  /** Project identifier in ~/.gemini/tmp */
  projectId?: string;
  /** Absolute path to project temp directory */
  projectTempDir: string;
  /** Absolute path to the session json file */
  sessionPath: string;
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

export interface RenameSessionResult {
  sessionInfo: SessionInfo;
  conversation: ConversationRecord;
}

export function getConversationSessionName(
  conversation: Pick<
    ConversationRecord,
    'sessionId' | 'startTime' | 'sessionNameBase' | 'sessionNameSuffix'
  >,
): string {
  const base = ensureSessionNameBase(
    conversation.sessionNameBase ||
      getDefaultSessionNameBase(new Date(conversation.startTime || Date.now())),
  );
  const suffix = normalizeSessionNameSuffix(
    conversation.sessionNameSuffix || getSessionNameSuffix(conversation.sessionId),
  );
  return buildSessionName(base, suffix);
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

export interface SessionFileContext {
  projectRoot?: string;
  projectId?: string;
  projectTempDir: string;
  isCurrentProject: boolean;
}

/**
 * Loads all session files (including corrupted ones) from the chats directory.
 * @returns Array of session file entries, with sessionInfo null for corrupted files
 */
export const getAllSessionFiles = async (
  chatsDir: string,
  currentSessionId?: string,
  options: GetSessionOptions = {},
  context: SessionFileContext = {
    projectTempDir: path.dirname(chatsDir),
    isCurrentProject: false,
  },
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

          const firstUserMessage = extractFirstUserMessage(content.messages);
          const isCurrentSession = Boolean(
            context.isCurrentProject &&
              currentSessionId &&
              content.sessionId === currentSessionId,
          );

          const sessionNameSuffix = content.sessionNameSuffix
            ? content.sessionNameSuffix
            : getSessionNameSuffix(content.sessionId);
          const sessionNameBase = ensureSessionNameBase(
            content.sessionNameBase ||
              (content.summary
                ? stripUnsafeCharacters(content.summary)
                : firstUserMessage),
          );
          const sessionName = buildSessionName(
            sessionNameBase,
            sessionNameSuffix,
          );

          let fullContent: string | undefined;
          let messages:
            | Array<{ role: 'user' | 'assistant'; content: string }>
            | undefined;

          if (options.includeFullContent) {
            fullContent = content.messages
              .map((msg: MessageRecord) => partListUnionToString(msg.content))
              .join(' ');
            messages = content.messages.map((msg: MessageRecord) => ({
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
            sessionPath: filePath,
            projectTempDir: context.projectTempDir,
            projectRoot: context.projectRoot,
            projectId: context.projectId,
            startTime: content.startTime,
            lastUpdated: content.lastUpdated,
            messageCount: content.messages.length,
            sessionName,
            sessionNameBase,
            sessionNameSuffix,
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
    {
      projectTempDir: path.dirname(chatsDir),
      isCurrentProject: true,
    },
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

interface ProjectChatDirectory {
  projectId: string;
  projectTempDir: string;
  chatsDir: string;
  projectRoot?: string;
}

async function getProjectChatDirectories(): Promise<ProjectChatDirectory[]> {
  const globalTempDir = Storage.getGlobalTempDir();
  let entries: string[];
  try {
    entries = await fs.readdir(globalTempDir);
  } catch {
    return [];
  }

  const directories = await Promise.all(
    entries.map(async (projectId): Promise<ProjectChatDirectory | null> => {
      const projectTempDir = path.join(globalTempDir, projectId);
      const chatsDir = path.join(projectTempDir, 'chats');

      try {
        const stat = await fs.stat(projectTempDir);
        if (!stat.isDirectory()) {
          return null;
        }
      } catch {
        return null;
      }

      let projectRoot: string | undefined;
      try {
        projectRoot = (
          await fs.readFile(path.join(projectTempDir, '.project_root'), 'utf8')
        ).trim();
      } catch {
        projectRoot = undefined;
      }

      return { projectId, projectTempDir, chatsDir, projectRoot };
    }),
  );

  return directories.filter((entry): entry is ProjectChatDirectory =>
    Boolean(entry),
  );
}

export async function getGlobalSessionFiles(
  currentSessionId?: string,
  currentProjectRoot?: string,
  options: GetSessionOptions = {},
): Promise<SessionInfo[]> {
  const projectChatDirs = await getProjectChatDirectories();

  const allEntries = await Promise.all(
    projectChatDirs.map(async (projectDir) =>
      getAllSessionFiles(projectDir.chatsDir, currentSessionId, options, {
        projectRoot: projectDir.projectRoot,
        projectId: projectDir.projectId,
        projectTempDir: projectDir.projectTempDir,
        isCurrentProject:
          !!currentProjectRoot &&
          !!projectDir.projectRoot &&
          path.resolve(currentProjectRoot) === path.resolve(projectDir.projectRoot),
      }),
    ),
  );

  const flattened = allEntries.flat();
  const validSessions = flattened
    .filter(
      (entry): entry is { fileName: string; sessionInfo: SessionInfo } =>
        entry.sessionInfo !== null,
    )
    .map((entry) => entry.sessionInfo);

  const uniqueSessionsMap = new Map<string, SessionInfo>();
  for (const session of validSessions) {
    if (
      !uniqueSessionsMap.has(session.id) ||
      new Date(session.lastUpdated).getTime() >
        new Date(uniqueSessionsMap.get(session.id)!.lastUpdated).getTime()
    ) {
      uniqueSessionsMap.set(session.id, session);
    }
  }

  const uniqueSessions = Array.from(uniqueSessionsMap.values());
  uniqueSessions.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  uniqueSessions.forEach((session, index) => {
    session.index = index + 1;
  });

  return uniqueSessions;
}

export async function renameSession(
  session: SessionInfo,
  newNameBase: string,
): Promise<RenameSessionResult> {
  const conversation: ConversationRecord = JSON.parse(
    await fs.readFile(session.sessionPath, 'utf8'),
  );

  const sessionNameBase = ensureSessionNameBase(newNameBase);
  const existingSuffix =
    conversation.sessionNameSuffix ||
    session.sessionNameSuffix ||
    getSessionNameSuffix(conversation.sessionId);
  const sessionNameSuffix = normalizeSessionNameSuffix(existingSuffix);

  conversation.sessionNameBase = sessionNameBase;
  conversation.sessionNameSuffix = sessionNameSuffix;
  conversation.lastUpdated = new Date().toISOString();

  await fs.writeFile(session.sessionPath, JSON.stringify(conversation, null, 2));

  return {
    conversation,
    sessionInfo: {
      ...session,
      lastUpdated: conversation.lastUpdated,
      sessionNameBase,
      sessionNameSuffix,
      sessionName: buildSessionName(sessionNameBase, sessionNameSuffix),
    },
  };
}

export async function deleteSessionArtifacts(session: SessionInfo): Promise<void> {
  try {
    await fs.unlink(session.sessionPath);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error;
    }
  }

  const safeSessionId = sanitizeFilenamePart(session.id);
  const toolOutputsBase = path.join(session.projectTempDir, 'tool-outputs');
  const toolOutputDir = path.join(
    toolOutputsBase,
    `session-${safeSessionId}`,
  );
  const resolvedBase = path.resolve(toolOutputsBase);
  const resolvedTarget = path.resolve(toolOutputDir);

  if (
    resolvedTarget === resolvedBase ||
    !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
  ) {
    return;
  }

  await fs.rm(toolOutputDir, { recursive: true, force: true });
}

/**
 * Utility class for session discovery and selection.
 */
export class SessionSelector {
  constructor(private config: Config) {}

  /**
   * Lists all available sessions globally across projects.
   */
  async listSessions(): Promise<SessionInfo[]> {
    return getGlobalSessionFiles(
      this.config.getSessionId(),
      this.config.getProjectRoot(),
    );
  }

  /**
   * Finds a session by identifier (name, UUID or numeric index).
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

    // Try to find by session name first.
    const sessionByName = sortedSessions.find(
      (session) => session.sessionName === identifier,
    );
    if (sessionByName) {
      return sessionByName;
    }

    // Try to find by UUID.
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
   * @param resumeArg - Can be "latest", a session name, a full UUID, or an index number (1-based)
   * @returns Promise resolving to session selection result
   */
  async resolveSession(resumeArg: string): Promise<SessionSelectionResult> {
    let selectedSession: SessionInfo;

    if (resumeArg === RESUME_LATEST) {
      const sessions = await this.listSessions();

      if (sessions.length === 0) {
        throw new Error('No previous sessions found.');
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
    const sessionPath = sessionInfo.sessionPath;

    try {
      const sessionData: ConversationRecord = JSON.parse(
        await fs.readFile(sessionPath, 'utf8'),
      );

      const displayInfo = `Session ${sessionInfo.index}: ${sessionInfo.firstUserMessage} (${sessionInfo.messageCount} messages, ${formatRelativeTime(sessionInfo.lastUpdated)})`;

      return {
        sessionPath: sessionInfo.sessionPath,
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
        tools: msg.toolCalls.map((tool: NonNullable<typeof msg.toolCalls>[number]) => ({
          callId: tool.id,
          name: tool.displayName || tool.name,
          description: tool.description || '',
          renderOutputAsMarkdown: tool.renderOutputAsMarkdown ?? true,
          status:
            tool.status === 'success'
              ? ToolCallStatus.Success
              : ToolCallStatus.Error,
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
