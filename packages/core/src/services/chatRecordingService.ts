/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  type Status,
  type ThoughtSummary,
  getProjectHash,
} from '@google/gemini-cli-core';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export interface TokensSummary {
  input: number; // promptTokenCount
  output: number; // candidatesTokenCount
  cached: number; // cachedContentTokenCount
  thoughts?: number; // thoughtsTokenCount
  tool?: number; // toolUsePromptTokenCount
  total: number; // totalTokenCount
}

// Base fields common to all messages.
export interface BaseMessageRecord {
  id: string;
  timestamp: string;
  content: string;
}

interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: Status;
  timestamp: string;
  // UI-specific fields for display purposes
  displayName?: string;
  description?: string;
  resultDisplay?: string;
  renderOutputAsMarkdown?: boolean;
}

// Message type and message type-specific fields.
export type ConversationRecordExtra =
  | {
      type: 'user' | 'system' | 'error';
    }
  | {
      type: 'gemini';
      toolCalls?: ToolCallRecord[];
      thoughts?: Array<ThoughtSummary & { timestamp: string }>;
      tokens?: TokensSummary | null;
    };

export type MessageRecord = BaseMessageRecord & ConversationRecordExtra;

export interface ConversationRecord {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  messages: MessageRecord[];
}

export class ChatRecordingService {
  private conversationFile: string | null = null;
  private cachedLastConvData: string | null = null;
  private sessionId: string;
  private projectHash: string;
  private queuedThoughts: Array<ThoughtSummary & { timestamp: string }> = [];
  private queuedTokens: TokensSummary | null = null;

  constructor(private config: Config) {
    this.sessionId = config.getSessionId();
    this.projectHash = getProjectHash(config.getProjectRoot());
  }

  /**
   * Initializes the chat recording service: creates a new conversation file and associates it with
   * this service instance.
   */
  initialize(): void {
    try {
      const chatsDir = path.join(this.config.getProjectTempDir(), 'chats');
      fs.mkdirSync(chatsDir, { recursive: true });

      const timestamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/:/g, '-');
      const filename = `session-${timestamp}-${this.sessionId.slice(
        0,
        8,
      )}.json`;
      this.conversationFile = path.join(chatsDir, filename);

      const initialRecord: ConversationRecord = {
        sessionId: this.sessionId,
        projectHash: this.projectHash,
        startTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        messages: [],
      };

      this.writeConversation(initialRecord);
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.error('Error initializing chat recording service:', error);
      }
    }
  }

  /**
   * Reinitializes the chat recording service with a new session ID, optionally copying from an
   * existing session. This allows session resumption to create a new branched conversation file.
   */
  reinitializeWithSession(newSessionId: string, sourceFilePath?: string): void {
    try {
      this.sessionId = newSessionId;

      const chatsDir = path.join(this.config.getProjectTempDir(), 'chats');
      fs.mkdirSync(chatsDir, { recursive: true });

      const timestamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/:/g, '-');
      const filename = `session-${timestamp}-${newSessionId.slice(0, 8)}.json`;
      this.conversationFile = path.join(chatsDir, filename);

      if (sourceFilePath && fs.existsSync(sourceFilePath)) {
        // Copy existing session to new file
        const sourceData = fs.readFileSync(sourceFilePath, 'utf8');
        const conversation: ConversationRecord = JSON.parse(sourceData);

        // Update with new session ID and timestamp
        conversation.sessionId = newSessionId;
        conversation.lastUpdated = new Date().toISOString();

        this.writeConversation(conversation);

        // Clear any cached data to force fresh reads
        this.cachedLastConvData = null;
      } else {
        // Create new empty session
        const initialRecord: ConversationRecord = {
          sessionId: newSessionId,
          projectHash: this.projectHash,
          startTime: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          messages: [],
        };

        this.writeConversation(initialRecord);
      }

      // Clear any queued data since this is a fresh start
      this.queuedThoughts = [];
      this.queuedTokens = null;
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.error('Error reinitializing chat recording service:', error);
      }
    }
  }

  private getLastMessage(
    conversation: ConversationRecord,
  ): MessageRecord | undefined {
    return conversation.messages.at(-1);
  }

  private newMessage(
    type: ConversationRecordExtra['type'],
    content: string,
  ): MessageRecord {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      content,
    };
  }

  recordMessage(message: {
    type: ConversationRecordExtra['type'];
    content: string;
    append?: boolean;
  }): void {
    if (!this.conversationFile) return;

    try {
      this.updateConversation((conversation) => {
        if (message.append) {
          const lastMsg = this.getLastMessage(conversation);
          if (lastMsg && lastMsg.type === message.type) {
            lastMsg.content += message.content;
            return;
          }
        }
        // We're not appending, or we are appending but the last message's type is not the same as
        // the specified type, so just create a new message.
        const msg = this.newMessage(message.type, message.content);
        if (msg.type === 'gemini') {
          // If it's a new Gemini message then incorporate any queued thoughts.
          conversation.messages.push({
            ...msg,
            thoughts: this.queuedThoughts,
            tokens: this.queuedTokens,
          });
          this.queuedThoughts = [];
          this.queuedTokens = null;
        } else {
          // Or else just add it.
          conversation.messages.push(msg);
        }
      });
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.error('Error saving message:', error);
      }
    }
  }

  recordThought(thought: ThoughtSummary): void {
    if (!this.conversationFile) return;

    try {
      this.queuedThoughts.push({
        ...thought,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.error('Error saving thought:', error);
      }
    }
  }

  /** Updates the tokens for the last message in the conversation (which should be by Gemini). */
  recordMessageTokens(tokens: {
    input: number;
    output: number;
    cached: number;
    thoughts?: number;
    tool?: number;
    total: number;
  }): void {
    if (!this.conversationFile) return;

    try {
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
      if (this.config.getDebugMode()) {
        console.error('Error updating message tokens:', error);
      }
    }
  }

  /**
   * Adds tool calls to the last message in the conversation (which should be by Gemini). */
  recordToolCalls(
    toolCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      result?: unknown;
      status: Status;
      timestamp: string;
      displayName?: string;
      description?: string;
      resultDisplay?: string;
      renderOutputAsMarkdown?: boolean;
    }>,
  ): void {
    if (!this.conversationFile) return;

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
            toolCalls,
            thoughts: this.queuedThoughts,
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
          for (const toolCall of toolCalls) {
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
      if (this.config.getDebugMode()) {
        console.error('Error adding tool call to message:', error);
      }
    }
  }

  /** Loads up the conversation record from disk. */
  private readConversation(): ConversationRecord {
    try {
      this.cachedLastConvData = fs.readFileSync(this.conversationFile!, 'utf8');
      return JSON.parse(this.cachedLastConvData);
    } catch {
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

  /** Saves the conversation record; overwrites the file. */
  private writeConversation(conversation: ConversationRecord): void {
    try {
      if (!this.conversationFile) return;

      // Only write the file if this change would change the file.
      if (this.cachedLastConvData !== JSON.stringify(conversation, null, 2)) {
        conversation.lastUpdated = new Date().toISOString();
        const newContent = JSON.stringify(conversation, null, 2);
        this.cachedLastConvData = newContent;
        fs.writeFileSync(this.conversationFile, newContent);
      }
    } catch (error) {
      if (this.config.getDebugMode()) {
        console.error('Error writing conversation file:', error);
      }
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
}
