/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '../config/config.js';
import { type Status } from '../core/coreToolScheduler.js';
import { type ThoughtSummary } from '../utils/thoughtUtils.js';
import { getProjectHash } from '../utils/paths.js';
import { sanitizeFilenamePart } from '../utils/fileUtils.js';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type {
  Content,
  Part,
  PartListUnion,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';
import type { ToolResultDisplay } from '../tools/tools.js';

export const SESSION_FILE_PREFIX = 'session-';

/**
 * Warning message shown when recording is disabled due to disk full.
 */
const ENOSPC_WARNING_MESSAGE =
  'Chat recording disabled: No space left on device. ' +
  'The conversation will continue but will not be saved to disk. ' +
  'Free up disk space and restart to enable recording.';

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
 * Service for automatically recording chat conversations to disk.
 *
 * This service provides comprehensive conversation recording that captures:
 * - All user and assistant messages
 * - Tool calls and their execution results
 * - Token usage statistics
 * - Assistant thoughts and reasoning
 *
 * Sessions are stored as JSON files in ~/.gemini/tmp/<project_hash>/chats/
 */
export class ChatRecordingService {
  private conversationFile: string | null = null;
  private cachedLastConvData: string | null = null;
  private sessionId: string;
  private projectHash: string;
  private kind?: 'main' | 'subagent';
  private queuedThoughts: Array<ThoughtSummary & { timestamp: string }> = [];
  private queuedTokens: TokensSummary | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.sessionId = config.getSessionId();
    this.projectHash = getProjectHash(config.getProjectRoot());
  }

  /**
   * Initializes the chat recording service: creates a new conversation file and associates it with
   * this service instance, or resumes from an existing session if resumedSessionData is provided.
   *
   * @param resumedSessionData Data from a previous session to resume from.
   * @param kind The kind of conversation (main or subagent).
   */
  initialize(
    resumedSessionData?: ResumedSessionData,
    kind?: 'main' | 'subagent',
  ): void {
    try {
      this.kind = kind;
      if (resumedSessionData) {
        // Resume from existing session
        this.conversationFile = resumedSessionData.filePath;
        this.sessionId = resumedSessionData.conversation.sessionId;
        this.kind = resumedSessionData.conversation.kind;

        // Update the session ID in the existing file
        this.updateConversation((conversation) => {
          conversation.sessionId = this.sessionId;
        });

        // Clear any cached data to force fresh reads
        this.cachedLastConvData = null;
      } else {
        // Create new session
        const chatsDir = path.join(
          this.config.storage.getProjectTempDir(),
          'chats',
        );
        fs.mkdirSync(chatsDir, { recursive: true });

        const timestamp = new Date()
          .toISOString()
          .slice(0, 16)
          .replace(/:/g, '-');
        const filename = `${SESSION_FILE_PREFIX}${timestamp}-${this.sessionId.slice(
          0,
          8,
        )}.json`;
        this.conversationFile = path.join(chatsDir, filename);

        this.writeConversation({
          sessionId: this.sessionId,
          projectHash: this.projectHash,
          startTime: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          messages: [],
          kind: this.kind,
        });
      }

      // Clear any queued data since this is a fresh start
      this.queuedThoughts = [];
      this.queuedTokens = null;
    } catch (error) {
      // Handle disk full (ENOSPC) gracefully - disable recording but allow CLI to continue
      if (
        error instanceof Error &&
        'code' in error &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (error as NodeJS.ErrnoException).code === 'ENOSPC'
      ) {
        this.conversationFile = null;
        debugLogger.warn(ENOSPC_WARNING_MESSAGE);
        return; // Don't throw - allow the CLI to continue
      }
      debugLogger.error('Error initializing chat recording service:', error);
      throw error;
    }
  }

  private getLastMessage(
    conversation: ConversationRecord,
  ): MessageRecord | undefined {
    return conversation.messages.at(-1);
  }

  private newMessage(
    type: ConversationRecordExtra['type'],
    content: PartListUnion,
    displayContent?: PartListUnion,
  ): MessageRecord {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      content,
      displayContent,
    };
  }

  /**
   * Records a message in the conversation.
   */
  recordMessage(message: {
    model: string | undefined;
    type: ConversationRecordExtra['type'];
    content: PartListUnion;
    displayContent?: PartListUnion;
  }): void {
    if (!this.conversationFile) return;

    try {
      this.updateConversation((conversation) => {
        const msg = this.newMessage(
          message.type,
          message.content,
          message.displayContent,
        );
        if (msg.type === 'gemini') {
          // If it's a new Gemini message then incorporate any queued thoughts.
          conversation.messages.push({
            ...msg,
            thoughts: this.queuedThoughts,
            tokens: this.queuedTokens,
            model: message.model,
          });
          this.queuedThoughts = [];
          this.queuedTokens = null;
        } else {
          // Or else just add it.
          conversation.messages.push(msg);
        }
      });
    } catch (error) {
      debugLogger.error('Error saving message to chat history.', error);
      throw error;
    }
  }

  /**
   * Records a thought from the assistant's reasoning process.
   */
  recordThought(thought: ThoughtSummary): void {
    if (!this.conversationFile) return;

    try {
      this.queuedThoughts.push({
        ...thought,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      debugLogger.error('Error saving thought to chat history.', error);
      throw error;
    }
  }

  /**
   * Updates the tokens for the last message in the conversation (which should be by Gemini).
   */
  recordMessageTokens(
    respUsageMetadata: GenerateContentResponseUsageMetadata,
  ): void {
    if (!this.conversationFile) return;

    try {
      const tokens = {
        input: respUsageMetadata.promptTokenCount ?? 0,
        output: respUsageMetadata.candidatesTokenCount ?? 0,
        cached: respUsageMetadata.cachedContentTokenCount ?? 0,
        thoughts: respUsageMetadata.thoughtsTokenCount ?? 0,
        tool: respUsageMetadata.toolUsePromptTokenCount ?? 0,
        total: respUsageMetadata.totalTokenCount ?? 0,
      };
      this.updateConversation((conversation) => {
        const lastMsg = this.getLastMessage(conversation);
        // If the last message already has token info, it's because this new token info is for a
        // new message that hasn't been recorded yet.
        if (lastMsg && lastMsg.type === 'gemini' && !lastMsg.tokens) {
          lastMsg.tokens = tokens;
          this.queuedTokens = null;
        } else {
          this.queuedTokens = tokens;
        }
      });
    } catch (error) {
      debugLogger.error(
        'Error updating message tokens in chat history.',
        error,
      );
      throw error;
    }
  }

  /**
   * Adds tool calls to the last message in the conversation (which should be by Gemini).
   * This method enriches tool calls with metadata from the ToolRegistry.
   */
  recordToolCalls(model: string, toolCalls: ToolCallRecord[]): void {
    if (!this.conversationFile) return;

    // Enrich tool calls with metadata from the ToolRegistry
    const toolRegistry = this.config.getToolRegistry();
    const enrichedToolCalls = toolCalls.map((toolCall) => {
      const toolInstance = toolRegistry.getTool(toolCall.name);
      return {
        ...toolCall,
        displayName: toolInstance?.displayName || toolCall.name,
        description: toolInstance?.description || '',
        renderOutputAsMarkdown: toolInstance?.isOutputMarkdown || false,
      };
    });

    try {
      this.updateConversation((conversation) => {
        const lastMsg = this.getLastMessage(conversation);
        // If a tool call was made, but the last message isn't from Gemini, it's because Gemini is
        // calling tools without starting the message with text.  So the user submits a prompt, and
        // Gemini immediately calls a tool (maybe with some thinking first).  In that case, create
        // a new empty Gemini message.
        // Also if there are any queued thoughts, it means this tool call(s) is from a new Gemini
        // message--because it's thought some more since we last, if ever, created a new Gemini
        // message from tool calls, when we dequeued the thoughts.
        if (
          !lastMsg ||
          lastMsg.type !== 'gemini' ||
          this.queuedThoughts.length > 0
        ) {
          const newMsg: MessageRecord = {
            ...this.newMessage('gemini' as const, ''),
            // This isn't strictly necessary, but TypeScript apparently can't
            // tell that the first parameter to newMessage() becomes the
            // resulting message's type, and so it thinks that toolCalls may
            // not be present.  Confirming the type here satisfies it.
            type: 'gemini' as const,
            toolCalls: enrichedToolCalls,
            thoughts: this.queuedThoughts,
            model,
          };
          // If there are any queued thoughts join them to this message.
          if (this.queuedThoughts.length > 0) {
            newMsg.thoughts = this.queuedThoughts;
            this.queuedThoughts = [];
          }
          // If there's any queued tokens info join it to this message.
          if (this.queuedTokens) {
            newMsg.tokens = this.queuedTokens;
            this.queuedTokens = null;
          }
          conversation.messages.push(newMsg);
        } else {
          // The last message is an existing Gemini message that we need to update.

          // Update any existing tool call entries.
          if (!lastMsg.toolCalls) {
            lastMsg.toolCalls = [];
          }
          lastMsg.toolCalls = lastMsg.toolCalls.map((toolCall) => {
            // If there are multiple tool calls with the same ID, this will take the first one.
            const incomingToolCall = toolCalls.find(
              (tc) => tc.id === toolCall.id,
            );
            if (incomingToolCall) {
              // Merge in the new data to keep preserve thoughts, etc., that were assigned to older
              // versions of the tool call.
              return { ...toolCall, ...incomingToolCall };
            } else {
              return toolCall;
            }
          });

          // Add any new tools calls that aren't in the message yet.
          for (const toolCall of enrichedToolCalls) {
            const existingToolCall = lastMsg.toolCalls.find(
              (tc) => tc.id === toolCall.id,
            );
            if (!existingToolCall) {
              lastMsg.toolCalls.push(toolCall);
            }
          }
        }
      });
    } catch (error) {
      debugLogger.error(
        'Error adding tool call to message in chat history.',
        error,
      );
      throw error;
    }
  }

  /**
   * Loads up the conversation record from disk.
   */
  private readConversation(): ConversationRecord {
    try {
      this.cachedLastConvData = fs.readFileSync(this.conversationFile!, 'utf8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(this.cachedLastConvData);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        debugLogger.error('Error reading conversation file.', error);
        throw error;
      }

      // Placeholder empty conversation if file doesn't exist.
      return {
        sessionId: this.sessionId,
        projectHash: this.projectHash,
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        messages: [],
        kind: this.kind,
      };
    }
  }

  /**
   * Saves the conversation record; overwrites the file.
   */
  private writeConversation(
    conversation: ConversationRecord,
    { allowEmpty = false }: { allowEmpty?: boolean } = {},
  ): void {
    try {
      if (!this.conversationFile) return;
      // Don't write the file yet until there's at least one message.
      if (conversation.messages.length === 0 && !allowEmpty) return;

      // Only write the file if this change would change the file.
      if (this.cachedLastConvData !== JSON.stringify(conversation, null, 2)) {
        conversation.lastUpdated = new Date().toISOString();
        const newContent = JSON.stringify(conversation, null, 2);
        this.cachedLastConvData = newContent;
        // Ensure directory exists before writing (handles cases where temp dir was cleaned)
        fs.mkdirSync(path.dirname(this.conversationFile), { recursive: true });
        fs.writeFileSync(this.conversationFile, newContent);
      }
    } catch (error) {
      // Handle disk full (ENOSPC) gracefully - disable recording but allow conversation to continue
      if (
        error instanceof Error &&
        'code' in error &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (error as NodeJS.ErrnoException).code === 'ENOSPC'
      ) {
        this.conversationFile = null;
        debugLogger.warn(ENOSPC_WARNING_MESSAGE);
        return; // Don't throw - allow the conversation to continue
      }
      debugLogger.error('Error writing conversation file.', error);
      throw error;
    }
  }

  /**
   * Convenient helper for updating the conversation without file reading and writing and time
   * updating boilerplate.
   */
  private updateConversation(
    updateFn: (conversation: ConversationRecord) => void,
  ) {
    const conversation = this.readConversation();
    updateFn(conversation);
    this.writeConversation(conversation);
  }

  /**
   * Saves a summary for the current session.
   */
  saveSummary(summary: string): void {
    if (!this.conversationFile) return;

    try {
      this.updateConversation((conversation) => {
        conversation.summary = summary;
      });
    } catch (error) {
      debugLogger.error('Error saving summary to chat history.', error);
      // Don't throw - we want graceful degradation
    }
  }

  /**
   * Records workspace directories to the session file.
   * Called when directories are added via /dir add.
   */
  recordDirectories(directories: readonly string[]): void {
    if (!this.conversationFile) return;

    try {
      this.updateConversation((conversation) => {
        conversation.directories = [...directories];
      });
    } catch (error) {
      debugLogger.error('Error saving directories to chat history.', error);
      // Don't throw - we want graceful degradation
    }
  }

  /**
   * Gets the current conversation data (for summary generation).
   */
  getConversation(): ConversationRecord | null {
    if (!this.conversationFile) return null;

    try {
      return this.readConversation();
    } catch (error) {
      debugLogger.error('Error reading conversation for summary.', error);
      return null;
    }
  }

  /**
   * Gets the path to the current conversation file.
   * Returns null if the service hasn't been initialized yet or recording is disabled.
   */
  getConversationFilePath(): string | null {
    return this.conversationFile;
  }

  /**
   * Deletes a session file by session ID.
   */
  deleteSession(sessionId: string): void {
    try {
      const tempDir = this.config.storage.getProjectTempDir();
      const chatsDir = path.join(tempDir, 'chats');
      const sessionPath = path.join(chatsDir, `${sessionId}.json`);
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }

      // Cleanup tool outputs for this session
      const safeSessionId = sanitizeFilenamePart(sessionId);
      const toolOutputDir = path.join(
        tempDir,
        'tool-outputs',
        `session-${safeSessionId}`,
      );

      // Robustness: Ensure the path is strictly within the tool-outputs base
      const toolOutputsBase = path.join(tempDir, 'tool-outputs');
      if (
        fs.existsSync(toolOutputDir) &&
        toolOutputDir.startsWith(toolOutputsBase)
      ) {
        fs.rmSync(toolOutputDir, { recursive: true, force: true });
      }
    } catch (error) {
      debugLogger.error('Error deleting session file.', error);
      throw error;
    }
  }

  /**
   * Rewinds the conversation to the state just before the specified message ID.
   * All messages from (and including) the specified ID onwards are removed.
   */
  rewindTo(messageId: string): ConversationRecord | null {
    if (!this.conversationFile) {
      return null;
    }
    const conversation = this.readConversation();
    const messageIndex = conversation.messages.findIndex(
      (m) => m.id === messageId,
    );

    if (messageIndex === -1) {
      debugLogger.error(
        'Message to rewind to not found in conversation history',
      );
      return conversation;
    }

    conversation.messages = conversation.messages.slice(0, messageIndex);
    this.writeConversation(conversation, { allowEmpty: true });
    return conversation;
  }

  /**
   * Updates the conversation history based on the provided API Content array.
   * This is used to persist changes made to the history (like masking) back to disk.
   */
  updateMessagesFromHistory(history: Content[]): void {
    if (!this.conversationFile) return;

    try {
      this.updateConversation((conversation) => {
        // Create a map of tool results from the API history for quick lookup by call ID.
        // We store the full list of parts associated with each tool call ID to preserve
        // multi-modal data and proper trajectory structure.
        const partsMap = new Map<string, Part[]>();
        for (const content of history) {
          if (content.role === 'user' && content.parts) {
            // Find all unique call IDs in this message
            const callIds = content.parts
              .map((p) => p.functionResponse?.id)
              .filter((id): id is string => !!id);

            if (callIds.length === 0) continue;

            // Use the first ID as a seed to capture any "leading" non-ID parts
            // in this specific content block.
            let currentCallId = callIds[0];
            for (const part of content.parts) {
              if (part.functionResponse?.id) {
                currentCallId = part.functionResponse.id;
              }

              if (!partsMap.has(currentCallId)) {
                partsMap.set(currentCallId, []);
              }
              partsMap.get(currentCallId)!.push(part);
            }
          }
        }

        // Update the conversation records tool results if they've changed.
        for (const message of conversation.messages) {
          if (message.type === 'gemini' && message.toolCalls) {
            for (const toolCall of message.toolCalls) {
              const newParts = partsMap.get(toolCall.id);
              if (newParts !== undefined) {
                // Store the results as proper Parts (including functionResponse)
                // instead of stringifying them as text parts. This ensures the
                // tool trajectory is correctly reconstructed upon session resumption.
                toolCall.result = newParts;
              }
            }
          }
        }
      });
    } catch (error) {
      debugLogger.error(
        'Error updating conversation history from memory.',
        error,
      );
      throw error;
    }
  }
}
