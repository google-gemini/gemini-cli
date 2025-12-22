/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '../config/config.js';
import { type Status } from '../core/coreToolScheduler.js';
import { type ThoughtSummary } from '../utils/thoughtUtils.js';
import { getProjectHash } from '../utils/paths.js';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type {
  PartListUnion,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';

export const SESSION_FILE_PREFIX = 'session-';

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
  resultDisplay?: string;
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
}

/**
 * Data structure for resuming an existing session.
 */
export interface ResumedSessionData {
  conversation: ConversationRecord;
  filePath: string;
}

/**
 * Parses a JSONL string into a ConversationRecord.
 */
export function parseJsonl(
  content: string,
  sessionId: string,
  projectHash: string,
): ConversationRecord {
  const lines = content.split('\n');
  let lastUpdatedMs: number | null = null;
  let lastUpdatedValue: string | null = null;
  let earliestTimestamp: string | null = null;
  let hasStartTime = false;
  let parseErrors = 0;
  const conversation: ConversationRecord = {
    sessionId,
    projectHash,
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    messages: [],
  };

  // Queue for message_update records that arrive before their target message
  const pendingUpdates = new Map<
    string,
    Array<Partial<MessageRecord> & { id: string }>
  >();
  const messageIndex = new Map<string, MessageRecord>();

  const updateLastUpdated = (timestamp?: string) => {
    if (!timestamp) return;
    const ms = Date.parse(timestamp);
    if (Number.isNaN(ms)) return;
    if (lastUpdatedMs === null || ms > lastUpdatedMs) {
      lastUpdatedMs = ms;
      lastUpdatedValue = timestamp;
    }
    if (!earliestTimestamp || timestamp < earliestTimestamp) {
      earliestTimestamp = timestamp;
    }
  };

  // Helper to apply an update to a message
  const applyUpdate = (
    msg: MessageRecord,
    update: Partial<MessageRecord> & { id: string },
  ) => {
    // Exclude the type field from the update merge to avoid overwriting the message type
    const { type: _type, ...updateData } = update;
    Object.assign(msg, updateData);
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      // Handle session metadata
      if (record.type === 'session_metadata') {
        if (typeof record.sessionId === 'string') {
          conversation.sessionId = record.sessionId;
        }
        if (typeof record.projectHash === 'string') {
          conversation.projectHash = record.projectHash;
        }
        if (typeof record.startTime === 'string') {
          conversation.startTime = record.startTime;
        }
        if (typeof record.lastUpdated === 'string') {
          conversation.lastUpdated = record.lastUpdated;
        }
        if (typeof record.summary === 'string') {
          conversation.summary = record.summary;
        }
        if (typeof record.startTime === 'string') {
          const startMs = Date.parse(record.startTime);
          if (!Number.isNaN(startMs)) {
            hasStartTime = true;
            updateLastUpdated(record.startTime);
          }
        }
        if (typeof record.lastUpdated === 'string') {
          updateLastUpdated(record.lastUpdated);
        }
        continue;
      }

      // Handle message updates
      if (record.type === 'message_update') {
        const update = record as Partial<MessageRecord> & { id: string };
        const existingMsg = messageIndex.get(update.id);
        if (existingMsg) {
          applyUpdate(existingMsg, update);
        } else {
          // Queue the update for when the message arrives
          const queue = pendingUpdates.get(update.id) ?? [];
          queue.push(update);
          pendingUpdates.set(update.id, queue);
        }
        updateLastUpdated(record.timestamp);
        continue;
      }

      // Handle standard messages (user, gemini, info, error, warning)
      // We assume anything else with an 'id' is a message record
      if (record.id && record.type) {
        const msg = record as MessageRecord;
        const existingMsg = messageIndex.get(msg.id);
        let targetMsg: MessageRecord;
        if (existingMsg) {
          Object.assign(existingMsg, msg);
          targetMsg = existingMsg;
        } else {
          conversation.messages.push(msg);
          messageIndex.set(msg.id, msg);
          targetMsg = msg;
        }

        // Apply any pending updates for this message
        const pending = pendingUpdates.get(targetMsg.id);
        if (pending) {
          for (const update of pending) {
            applyUpdate(targetMsg, update);
          }
          pendingUpdates.delete(targetMsg.id);
        }

        updateLastUpdated(targetMsg.timestamp);
      }
    } catch (e) {
      debugLogger.error('Error parsing JSONL line', e);
      parseErrors += 1;
    }
  }
  if (!hasStartTime && earliestTimestamp) {
    conversation.startTime = earliestTimestamp;
  }
  if (lastUpdatedValue) {
    conversation.lastUpdated = lastUpdatedValue;
  } else if (earliestTimestamp) {
    conversation.lastUpdated = earliestTimestamp;
  }
  if (parseErrors > 0) {
    debugLogger.warn(
      `[SessionRecording] Failed to parse ${parseErrors} JSONL line(s) for session ${sessionId || 'unknown'}. Some messages may be missing.`,
    );
  }
  return conversation;
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
  private conversation: ConversationRecord | null = null;
  private sessionId: string;
  private projectHash: string;
  private queuedThoughts: Array<ThoughtSummary & { timestamp: string }> = [];
  private queuedTokens: TokensSummary | null = null;
  private config: Config;
  /** Tracks whether session_metadata has been written to the file */
  private fileInitialized: boolean = false;
  /** Promise gate to prevent concurrent metadata writes */
  private metadataWritePromise: Promise<void> | null = null;

  constructor(config: Config) {
    this.config = config;
    this.sessionId = config.getSessionId();
    this.projectHash = getProjectHash(config.getProjectRoot());
  }

  /**
   * Initializes the chat recording service: creates a new conversation file and associates it with
   * this service instance, or resumes from an existing session if resumedSessionData is provided.
   */
  async initialize(resumedSessionData?: ResumedSessionData): Promise<void> {
    try {
      if (resumedSessionData) {
        // Resume from existing session
        this.conversationFile = resumedSessionData.filePath;
        this.conversation = resumedSessionData.conversation;
        if (!this.conversation.messages) {
          this.conversation.messages = [];
        }
        this.sessionId = this.conversation.sessionId;
        // Resumed sessions already have metadata written
        this.fileInitialized = true;

        // If it's an old .json file, we'll keep using it as JSON for now to avoid complexity,
        // or we could convert it. But let's check the extension.
        if (this.conversationFile.endsWith('.json')) {
          // Force an update to the session ID in the existing file
          await this.updateConversation((conversation) => {
            conversation.sessionId = this.sessionId;
          });
        } else {
          // For .jsonl, keep the existing metadata; don't update lastUpdated on resume
          this.conversation.sessionId = this.sessionId;
        }
      } else {
        // Create new session
        const chatsDir = path.join(
          this.config.storage.getProjectTempDir(),
          'chats',
        );
        await fsPromises.mkdir(chatsDir, { recursive: true });

        const timestamp = new Date()
          .toISOString()
          .slice(0, 16)
          .replace(/:/g, '-');
        // Use .jsonl for new sessions
        const filename = `${SESSION_FILE_PREFIX}${timestamp}-${this.sessionId.slice(
          0,
          8,
        )}.jsonl`;
        this.conversationFile = path.join(chatsDir, filename);

        this.conversation = {
          sessionId: this.sessionId,
          projectHash: this.projectHash,
          startTime: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          messages: [],
        };
        // New sessions haven't written metadata yet
        this.fileInitialized = false;
        // We don't write anything yet until there's at least one message,
        // similar to previous implementation.
      }

      // Clear any queued data and reset promise gate since this is a fresh start
      this.queuedThoughts = [];
      this.queuedTokens = null;
      this.metadataWritePromise = null;
    } catch (error) {
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
  ): MessageRecord {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      content,
    };
  }

  /**
   * Records a message in the conversation.
   */
  async recordMessage(message: {
    model: string | undefined;
    type: ConversationRecordExtra['type'];
    content: PartListUnion;
  }): Promise<void> {
    if (!this.conversationFile) return;

    try {
      let msgToWrite: MessageRecord | null = null;
      await this.updateConversation((conversation) => {
        const msg = this.newMessage(message.type, message.content);
        if (msg.type === 'gemini') {
          // If it's a new Gemini message then incorporate any queued thoughts.
          const fullMsg: MessageRecord = {
            ...msg,
            thoughts: this.queuedThoughts,
            tokens: this.queuedTokens,
            model: message.model,
          };
          conversation.messages.push(fullMsg);
          this.queuedThoughts = [];
          this.queuedTokens = null;
          msgToWrite = fullMsg;
        } else {
          // Or else just add it.
          conversation.messages.push(msg);
          msgToWrite = msg;
        }
      });
      if (msgToWrite) {
        await this.writeMessageRecord(msgToWrite);
      }
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
  async recordMessageTokens(
    respUsageMetadata: GenerateContentResponseUsageMetadata,
  ): Promise<void> {
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
      let updateData: { id: string; tokens: typeof tokens } | null = null;
      let msgToWrite: MessageRecord | null = null;
      await this.updateConversation((conversation) => {
        const lastMsg = this.getLastMessage(conversation);
        // If the last message already has token info, it's because this new token info is for a
        // new message that hasn't been recorded yet.
        if (lastMsg && lastMsg.type === 'gemini' && !lastMsg.tokens) {
          lastMsg.tokens = tokens;
          this.queuedTokens = null;
          if (this.conversationFile?.endsWith('.jsonl')) {
            updateData = { id: lastMsg.id, tokens };
          } else {
            msgToWrite = lastMsg;
          }
        } else {
          this.queuedTokens = tokens;
        }
      });
      if (updateData) {
        await this.writeMessageUpdate(updateData);
      } else if (msgToWrite) {
        await this.writeMessageRecord(msgToWrite);
      }
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
  async recordToolCalls(
    model: string,
    toolCalls: ToolCallRecord[],
  ): Promise<void> {
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
      let msgToWrite: MessageRecord | null = null;
      let updateData: {
        id: string;
        toolCalls: ToolCallRecord[];
      } | null = null;
      await this.updateConversation((conversation) => {
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
          msgToWrite = newMsg;
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
          if (this.conversationFile?.endsWith('.jsonl')) {
            updateData = {
              id: lastMsg.id,
              toolCalls: lastMsg.toolCalls,
            };
          } else {
            msgToWrite = lastMsg;
          }
        }
      });
      if (msgToWrite) {
        await this.writeMessageRecord(msgToWrite);
      } else if (updateData) {
        await this.writeMessageUpdate(updateData);
      }
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
  private async readConversation(): Promise<ConversationRecord> {
    if (!this.conversationFile) {
      throw new Error('Conversation file not set');
    }

    try {
      const content = await fsPromises.readFile(this.conversationFile, 'utf8');
      const result = this.conversationFile.endsWith('.jsonl')
        ? parseJsonl(content, this.sessionId, this.projectHash)
        : JSON.parse(content);
      return result;
    } catch (error) {
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
      };
    }
  }

  /**
   * Saves the conversation record; overwrites the file for .json, appends for .jsonl.
   */
  private async writeConversation(
    conversation: ConversationRecord,
  ): Promise<void> {
    try {
      if (!this.conversationFile) return;
      // Don't write the file yet until there's at least one message.
      if (!conversation.messages || conversation.messages.length === 0) return;

      if (this.conversationFile.endsWith('.jsonl')) {
        // In JSONL mode, we should have already written the individual records
        // via writeMessageRecord or writeMetadataUpdate.
        // We just update the lastUpdated timestamp in memory.
        conversation.lastUpdated = new Date().toISOString();
        return;
      }

      // Legacy .json support (overwrites file)
      conversation.lastUpdated = new Date().toISOString();
      const newContent = JSON.stringify(conversation, null, 2);
      const tmpPath = `${this.conversationFile}.tmp`;
      await fsPromises.writeFile(tmpPath, newContent);
      await fsPromises.rename(tmpPath, this.conversationFile);
    } catch (error) {
      debugLogger.error('Error writing conversation file.', error);
      throw error;
    }
  }

  /**
   * Ensures session_metadata is written to the file exactly once.
   * Uses a promise gate to prevent concurrent writes from racing.
   */
  private async ensureMetadataWritten(): Promise<void> {
    if (this.fileInitialized) return;
    if (!this.conversationFile || !this.conversationFile.endsWith('.jsonl'))
      return;

    // If another call is already writing metadata, wait for it
    if (this.metadataWritePromise) {
      await this.metadataWritePromise;
      return;
    }

    // Create promise gate for concurrent callers
    this.metadataWritePromise = (async () => {
      try {
        const metadata = {
          type: 'session_metadata',
          sessionId: this.conversation?.sessionId,
          projectHash: this.conversation?.projectHash,
          startTime: this.conversation?.startTime,
          lastUpdated: new Date().toISOString(),
        };
        await fsPromises.appendFile(
          this.conversationFile!,
          JSON.stringify(metadata) + '\n',
        );
        this.fileInitialized = true;
      } finally {
        this.metadataWritePromise = null;
      }
    })();

    await this.metadataWritePromise;
  }

  private async writeMessageRecord(message: MessageRecord): Promise<void> {
    if (!this.conversationFile || !this.conversationFile.endsWith('.jsonl'))
      return;

    try {
      await this.ensureMetadataWritten();
      await fsPromises.appendFile(
        this.conversationFile,
        JSON.stringify(message) + '\n',
      );
    } catch (error) {
      debugLogger.error('Error appending message to JSONL', error);
    }
  }

  private async writeMessageUpdate(
    update: Partial<MessageRecord> & { id: string },
  ): Promise<void> {
    if (!this.conversationFile || !this.conversationFile.endsWith('.jsonl'))
      return;

    try {
      // Ensure metadata is written first to prevent race conditions
      await this.ensureMetadataWritten();
      const record = {
        type: 'message_update',
        ...update,
        timestamp: new Date().toISOString(),
      };
      await fsPromises.appendFile(
        this.conversationFile,
        JSON.stringify(record) + '\n',
      );
    } catch (error) {
      debugLogger.error('Error appending message update to JSONL', error);
    }
  }

  private async writeMetadataUpdate(
    data: Partial<ConversationRecord>,
  ): Promise<void> {
    if (!this.conversationFile || !this.conversationFile.endsWith('.jsonl'))
      return;

    try {
      // Ensure metadata is written first to prevent race conditions
      await this.ensureMetadataWritten();
      const record = {
        type: 'session_metadata',
        ...data,
        lastUpdated: new Date().toISOString(),
      };
      await fsPromises.appendFile(
        this.conversationFile,
        JSON.stringify(record) + '\n',
      );
    } catch (error) {
      debugLogger.error('Error appending metadata update to JSONL', error);
    }
  }

  /**
   * Convenient helper for updating the conversation without file reading and writing and time
   * updating boilerplate.
   */
  private async updateConversation(
    updateFn: (conversation: ConversationRecord) => void,
  ): Promise<void> {
    if (!this.conversation) {
      this.conversation = await this.readConversation();
    }
    updateFn(this.conversation);
    await this.writeConversation(this.conversation);
  }

  /**
   * Saves a summary for the current session.
   */
  async saveSummary(summary: string): Promise<void> {
    if (!this.conversationFile) return;

    try {
      await this.updateConversation((conversation) => {
        conversation.summary = summary;
      });
      if (this.conversationFile.endsWith('.jsonl')) {
        await this.writeMetadataUpdate({ summary });
      }
    } catch (error) {
      debugLogger.error('Error saving summary to chat history.', error);
      // Don't throw - we want graceful degradation
    }
  }

  /**
   * Gets the current conversation data (for summary generation).
   */
  async getConversation(): Promise<ConversationRecord | null> {
    if (!this.conversationFile) return null;

    try {
      if (!this.conversation) {
        this.conversation = await this.readConversation();
      }
      return this.conversation;
    } catch (error) {
      debugLogger.error('Error reading conversation for summary.', error);
      return null;
    }
  }

  /**
   * Gets the path to the current conversation file.
   * Returns null if the service hasn't been initialized yet.
   */
  getConversationFilePath(): string | null {
    return this.conversationFile;
  }

  /**
   * Deletes a session file by session ID.
   * Session files are named: session-{timestamp}-{sessionId.slice(0,8)}.jsonl
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const chatsDir = path.join(
        this.config.storage.getProjectTempDir(),
        'chats',
      );

      // Helper to check if a file exists
      const fileExists = async (filePath: string): Promise<boolean> => {
        try {
          await fsPromises.access(filePath);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
          }
          throw error;
        }
      };

      // If sessionId looks like a full filename with path, try that first
      if (sessionId.includes('/') || sessionId.includes('\\')) {
        const resolvedPath = path.resolve(sessionId);
        const resolvedChatsDir = `${path.resolve(chatsDir)}${path.sep}`;
        if (!resolvedPath.startsWith(resolvedChatsDir)) {
          throw new Error('Session path is outside of the chats directory.');
        }
        const baseName = path.basename(resolvedPath);
        if (
          !baseName.startsWith(SESSION_FILE_PREFIX) ||
          (!baseName.endsWith('.json') && !baseName.endsWith('.jsonl'))
        ) {
          throw new Error('Session path is not a valid session file.');
        }
        if (await fileExists(resolvedPath)) {
          await fsPromises.unlink(resolvedPath);
          return;
        }
      }

      // If sessionId is a full filename (with extension), try it directly
      if (sessionId.endsWith('.json') || sessionId.endsWith('.jsonl')) {
        const directPath = path.join(chatsDir, sessionId);
        if (await fileExists(directPath)) {
          await fsPromises.unlink(directPath);
          return;
        }
      }

      // If sessionId already looks like a session filename without extension,
      // delete it directly and return. Do NOT fall through to shortId scan,
      // as shortId would be "session-" which could match all session files.
      if (sessionId.startsWith(SESSION_FILE_PREFIX)) {
        const jsonlPath = path.join(chatsDir, `${sessionId}.jsonl`);
        const jsonPath = path.join(chatsDir, `${sessionId}.json`);
        if (await fileExists(jsonlPath)) {
          await fsPromises.unlink(jsonlPath);
        }
        if (await fileExists(jsonPath)) {
          await fsPromises.unlink(jsonPath);
        }
        // Always return here to prevent fall-through to shortId scan
        return;
      }

      // Session files use the first 8 chars of the UUID in the filename
      // Pattern: session-{timestamp}-{sessionId.slice(0,8)}.jsonl
      const shortId = sessionId.slice(0, 8);
      const shortIdIsHex = /^[0-9a-fA-F]{8}$/.test(shortId);

      // Scan chats directory for matching files
      if (shortIdIsHex && (await fileExists(chatsDir))) {
        const files = await fsPromises.readdir(chatsDir);
        let deleted = false;
        const jsonlSuffix = `-${shortId}.jsonl`;
        const jsonSuffix = `-${shortId}.json`;
        const sessionMatches = async (filePath: string): Promise<boolean> => {
          try {
            const content = await fsPromises.readFile(filePath, 'utf8');
            if (filePath.endsWith('.jsonl')) {
              const parsed = parseJsonl(content, '', '');
              return parsed.sessionId === sessionId;
            }
            const parsed = JSON.parse(content) as ConversationRecord;
            return parsed.sessionId === sessionId;
          } catch (error) {
            debugLogger.warn(
              `[SessionRecording] Failed to verify sessionId for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
          }
        };
        for (const file of files) {
          // Match files that end with the short session ID segment
          if (
            file.startsWith(SESSION_FILE_PREFIX) &&
            (file.endsWith(jsonlSuffix) || file.endsWith(jsonSuffix))
          ) {
            const filePath = path.join(chatsDir, file);
            if (await sessionMatches(filePath)) {
              await fsPromises.unlink(filePath);
              deleted = true;
            }
          }
        }
        if (deleted) {
          return;
        }
      }

      // Fallback: try direct paths with sessionId as filename
      const jsonlPath = path.join(chatsDir, `${sessionId}.jsonl`);
      const jsonPath = path.join(chatsDir, `${sessionId}.json`);

      if (await fileExists(jsonlPath)) {
        await fsPromises.unlink(jsonlPath);
      }
      if (await fileExists(jsonPath)) {
        await fsPromises.unlink(jsonPath);
      }
    } catch (error) {
      debugLogger.error('Error deleting session file.', error);
      throw error;
    }
  }
}
