/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ThoughtSummary } from '../utils/thoughtUtils.js';
import { getProjectHash } from '../utils/paths.js';
import path from 'node:path';
import * as fs from 'node:fs';
import { sanitizeFilenamePart } from '../utils/fileUtils.js';
import { isNodeError } from '../utils/errors.js';
import {
  deleteSessionArtifactsAsync,
  deleteSubagentSessionDirAndArtifactsAsync,
} from '../utils/sessionOperations.js';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import type {
  Content,
  Part,
  PartListUnion,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import {
  SESSION_FILE_PREFIX,
  type TokensSummary,
  type ToolCallRecord,
  type ConversationRecordExtra,
  type MessageRecord,
  type ConversationRecord,
  type ResumedSessionData,
  type LoadConversationOptions,
  type RewindRecord,
  type MetadataUpdateRecord,
  type PartialMetadataRecord,
} from './chatRecordingTypes.js';
export * from './chatRecordingTypes.js';

/**
 * Warning message shown when recording is disabled due to disk full.
 */
const ENOSPC_WARNING_MESSAGE =
  'Chat recording disabled: No space left on device. ' +
  'The conversation will continue but will not be saved to disk. ' +
  'Free up disk space and restart to enable recording.';

function hasProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: unknown } {
  return obj !== null && typeof obj === 'object' && prop in obj;
}

function isStringProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: string } {
  return hasProperty(obj, prop) && typeof obj[prop] === 'string';
}

function isObjectProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: object } {
  return (
    hasProperty(obj, prop) &&
    obj[prop] !== null &&
    typeof obj[prop] === 'object'
  );
}

function isRewindRecord(record: unknown): record is RewindRecord {
  return isStringProperty(record, '$rewindTo');
}

function isMessageRecord(record: unknown): record is MessageRecord {
  return isStringProperty(record, 'id');
}

function isMetadataUpdateRecord(
  record: unknown,
): record is MetadataUpdateRecord {
  return isObjectProperty(record, '$set');
}

function isPartialMetadataRecord(
  record: unknown,
): record is PartialMetadataRecord {
  return (
    isStringProperty(record, 'sessionId') &&
    isStringProperty(record, 'projectHash')
  );
}

function isTextPart(part: unknown): part is { text: string } {
  return isStringProperty(part, 'text');
}

function isSessionIdRecord(record: unknown): record is { sessionId: string } {
  return isStringProperty(record, 'sessionId');
}

export async function loadConversationRecord(
  filePath: string,
  options?: LoadConversationOptions,
): Promise<
  | (ConversationRecord & {
      messageCount?: number;
      userMessageCount?: number;
      firstUserMessage?: string;
      hasUserOrAssistantMessage?: boolean;
      memoryScratchpadIsStale?: boolean;
    })
  | null
> {
  let fileStream: fs.ReadStream;
  try {
    fileStream = fs.createReadStream(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }

  try {
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let metadata: Partial<ConversationRecord> = {};
    const messagesMap = new Map<string, MessageRecord>();
    const messageIds: string[] = [];
    const messageKinds = new Map<
      string,
      { isUser: boolean; isUserOrAssistant: boolean }
    >();
    let isTrackingMemoryScratchpadFreshness = false;
    let memoryScratchpadIsStale = false;
    let firstUserMessageStr: string | undefined;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as unknown;
        if (isRewindRecord(record)) {
          if (isTrackingMemoryScratchpadFreshness) {
            memoryScratchpadIsStale = true;
          }
          const rewindId = record.$rewindTo;
          if (options?.metadataOnly) {
            const idx = messageIds.indexOf(rewindId);
            if (idx !== -1) {
              const removedIds = messageIds.splice(idx);
              for (const removedId of removedIds) {
                messageKinds.delete(removedId);
              }
            } else {
              messageIds.length = 0;
              messageKinds.clear();
            }
          } else {
            let found = false;
            const idsToDelete: string[] = [];
            for (const [id] of messagesMap) {
              if (id === rewindId) found = true;
              if (found) idsToDelete.push(id);
            }
            if (found) {
              for (const id of idsToDelete) {
                messagesMap.delete(id);
              }
            } else {
              messagesMap.clear();
            }
          }
        } else if (isMessageRecord(record)) {
          if (isTrackingMemoryScratchpadFreshness) {
            memoryScratchpadIsStale = true;
          }
          const id = record.id;
          const isUser = hasProperty(record, 'type') && record.type === 'user';
          const isUserOrAssistant =
            hasProperty(record, 'type') &&
            (record.type === 'user' || record.type === 'gemini');
          // Track message count and first user message
          if (options?.metadataOnly) {
            messageIds.push(id);
            messageKinds.set(id, { isUser, isUserOrAssistant });
          }
          if (
            !firstUserMessageStr &&
            isUser &&
            hasProperty(record, 'content') &&
            record['content']
          ) {
            // Basic extraction of first user message for display
            const rawContent = record['content'];
            if (Array.isArray(rawContent)) {
              firstUserMessageStr = rawContent
                .map((p: unknown) => (isTextPart(p) ? p['text'] : ''))
                .join('');
            } else if (typeof rawContent === 'string') {
              firstUserMessageStr = rawContent;
            }
          }

          if (!options?.metadataOnly) {
            messagesMap.set(id, record);
            if (
              options?.maxMessages &&
              messagesMap.size > options.maxMessages
            ) {
              const firstKey = messagesMap.keys().next().value;
              if (typeof firstKey === 'string') messagesMap.delete(firstKey);
            }
          }
        } else if (isMetadataUpdateRecord(record)) {
          if (hasProperty(record.$set, 'memoryScratchpad')) {
            isTrackingMemoryScratchpadFreshness = Boolean(
              record.$set.memoryScratchpad,
            );
            memoryScratchpadIsStale = false;
          }
          // Metadata update
          metadata = {
            ...metadata,
            ...record.$set,
          };
        } else if (isPartialMetadataRecord(record)) {
          // Initial metadata line
          metadata = { ...metadata, ...record };
        }
      } catch {
        // ignore parse errors on individual lines
      }
    }

    if (!metadata.sessionId || !metadata.projectHash) {
      return await parseLegacyRecordFallback(filePath, options);
    }

    const metadataMessages = Array.isArray(metadata.messages)
      ? metadata.messages
      : [];
    const loadedMessages =
      metadataMessages.length > 0
        ? metadataMessages
        : Array.from(messagesMap.values());
    const metadataFirstUserMessage =
      metadataMessages.find((message) => message.type === 'user') ?? null;
    let fallbackFirstUserMessage = firstUserMessageStr;
    if (!fallbackFirstUserMessage && metadataFirstUserMessage) {
      const rawContent = metadataFirstUserMessage.content;
      if (Array.isArray(rawContent)) {
        fallbackFirstUserMessage = rawContent
          .map((part: unknown) => (isTextPart(part) ? part['text'] : ''))
          .join('');
      } else if (typeof rawContent === 'string') {
        fallbackFirstUserMessage = rawContent;
      }
    }
    const userMessageCount = options?.metadataOnly
      ? Array.from(messageKinds.values()).filter((m) => m.isUser).length
      : loadedMessages.filter((m) => m.type === 'user').length;
    const hasUserOrAssistant = options?.metadataOnly
      ? Array.from(messageKinds.values()).some((m) => m.isUserOrAssistant)
      : loadedMessages.some((m) => m.type === 'user' || m.type === 'gemini');

    return {
      sessionId: metadata.sessionId,
      projectHash: metadata.projectHash,
      startTime: metadata.startTime || new Date().toISOString(),
      lastUpdated: metadata.lastUpdated || new Date().toISOString(),
      summary: metadata.summary,
      memoryScratchpad: metadata.memoryScratchpad,
      directories: metadata.directories,
      kind: metadata.kind,
      messages: options?.metadataOnly ? [] : loadedMessages,
      messageCount: options?.metadataOnly
        ? metadataMessages.length || messageIds.length
        : loadedMessages.length,
      userMessageCount:
        options?.metadataOnly && metadataMessages.length > 0
          ? metadataMessages.filter((m) => m.type === 'user').length
          : userMessageCount,
      memoryScratchpadIsStale: isTrackingMemoryScratchpadFreshness
        ? memoryScratchpadIsStale
        : undefined,
      firstUserMessage: fallbackFirstUserMessage,
      hasUserOrAssistantMessage:
        options?.metadataOnly && metadataMessages.length > 0
          ? metadataMessages.some(
              (m) => m.type === 'user' || m.type === 'gemini',
            )
          : hasUserOrAssistant,
    };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    debugLogger.error('Error loading conversation record from JSONL:', error);
    return null;
  }
}

/**
 * Suffix for the per-session metadata sidecar file. The sidecar lives next to
 * the JSONL chat file and contains only the fields needed to render the
 * session list, so listings can avoid streaming and parsing the full chat.
 */
export const SESSION_META_SUFFIX = '.meta.json';

const SESSION_META_VERSION = 1;

interface SessionMetadataSidecar {
  version: typeof SESSION_META_VERSION;
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  kind?: 'main' | 'subagent';
  summary?: string;
  directories?: string[];
  messageCount: number;
  userMessageCount: number;
  hasUserOrAssistantMessage: boolean;
  firstUserMessage?: string;
}

export function getSessionMetadataSidecarPath(jsonlPath: string): string {
  return jsonlPath.replace(/\.jsonl?$/, '') + SESSION_META_SUFFIX;
}

function extractFirstUserMessageText(
  messages: MessageRecord[],
): string | undefined {
  for (const msg of messages) {
    if (msg.type !== 'user') continue;
    const c = msg.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c.map((p) => (isTextPart(p) ? p.text : '')).join('');
    }
    return undefined;
  }
  return undefined;
}

type ConversationRecordWithCounts = ConversationRecord & {
  messageCount?: number;
  userMessageCount?: number;
  firstUserMessage?: string;
  hasUserOrAssistantMessage?: boolean;
};

function buildSidecarFromConversation(
  record: ConversationRecordWithCounts,
): SessionMetadataSidecar {
  // Prefer precomputed counts when present (e.g. when the record came from
  // loadConversationRecord with metadataOnly:true, which strips `messages`
  // but populates the count fields).
  let messageCount = record.messageCount ?? record.messages.length;
  let userCount = record.userMessageCount;
  let hasUserOrAssistant = record.hasUserOrAssistantMessage;
  if (
    userCount === undefined ||
    hasUserOrAssistant === undefined ||
    record.messages.length > 0
  ) {
    let computedUser = 0;
    let computedHasUserOrAssistant = false;
    for (const msg of record.messages) {
      if (msg.type === 'user') computedUser++;
      if (msg.type === 'user' || msg.type === 'gemini') {
        computedHasUserOrAssistant = true;
      }
    }
    if (record.messages.length > 0) {
      userCount = computedUser;
      hasUserOrAssistant = computedHasUserOrAssistant;
      messageCount = record.messages.length;
    } else {
      userCount = userCount ?? computedUser;
      hasUserOrAssistant = hasUserOrAssistant ?? computedHasUserOrAssistant;
    }
  }
  const firstUserMessage =
    record.firstUserMessage ?? extractFirstUserMessageText(record.messages);
  return {
    version: SESSION_META_VERSION,
    sessionId: record.sessionId,
    projectHash: record.projectHash,
    startTime: record.startTime,
    lastUpdated: record.lastUpdated,
    kind: record.kind,
    summary: record.summary,
    directories: record.directories ? [...record.directories] : undefined,
    messageCount,
    userMessageCount: userCount ?? 0,
    hasUserOrAssistantMessage: hasUserOrAssistant ?? false,
    firstUserMessage,
  };
}

/**
 * Atomically writes the sidecar metadata file for the session at `jsonlPath`.
 * Sidecars are derivable from the chat file, so write failures are swallowed
 * (ENOSPC) or logged but never thrown — listings fall back to parsing the
 * chat file when the sidecar is missing.
 */
export function writeSessionMetadataSidecar(
  jsonlPath: string,
  conversation: ConversationRecordWithCounts,
): void {
  const sidecar = buildSidecarFromConversation(conversation);
  const finalPath = getSessionMetadataSidecarPath(jsonlPath);
  const tmpPath = finalPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(sidecar));
    fs.renameSync(tmpPath, finalPath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOSPC') return;
    debugLogger.error('Error writing session metadata sidecar:', error);
  }
}

/**
 * Reads the metadata sidecar for the JSONL chat file. Returns null if the
 * sidecar is missing, malformed, or has an unknown version. Callers must
 * fall back to parsing the JSONL chat file in that case.
 */
function isNumberProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: number } {
  return hasProperty(obj, prop) && typeof obj[prop] === 'number';
}

function isBooleanProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: boolean } {
  return hasProperty(obj, prop) && typeof obj[prop] === 'boolean';
}

function isSessionMetadataSidecar(
  value: unknown,
): value is SessionMetadataSidecar {
  return (
    hasProperty(value, 'version') &&
    value.version === SESSION_META_VERSION &&
    isStringProperty(value, 'sessionId') &&
    isStringProperty(value, 'projectHash') &&
    isStringProperty(value, 'startTime') &&
    isStringProperty(value, 'lastUpdated') &&
    isNumberProperty(value, 'messageCount') &&
    isNumberProperty(value, 'userMessageCount') &&
    isBooleanProperty(value, 'hasUserOrAssistantMessage')
  );
}

export async function readSessionMetadataSidecar(
  jsonlPath: string,
): Promise<SessionMetadataSidecar | null> {
  const sidecarPath = getSessionMetadataSidecarPath(jsonlPath);
  try {
    const content = await fs.promises.readFile(sidecarPath, 'utf8');
    const parsed: unknown = JSON.parse(content);
    return isSessionMetadataSidecar(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export type { SessionMetadataSidecar };

export class ChatRecordingService {
  private conversationFile: string | null = null;
  private cachedConversation: ConversationRecord | null = null;
  private sessionId: string;
  private projectHash: string;
  private kind?: 'main' | 'subagent';
  private queuedThoughts: Array<ThoughtSummary & { timestamp: string }> = [];
  private queuedTokens: TokensSummary | null = null;
  private context: AgentLoopContext;

  constructor(context: AgentLoopContext) {
    this.context = context;
    this.sessionId = context.promptId;
    this.projectHash = getProjectHash(context.config.getProjectRoot());
  }

  async initialize(
    resumedSessionData?: ResumedSessionData,
    kind?: 'main' | 'subagent',
  ): Promise<void> {
    try {
      this.kind = kind;
      if (resumedSessionData) {
        this.conversationFile = resumedSessionData.filePath;
        this.sessionId = resumedSessionData.conversation.sessionId;
        this.kind = resumedSessionData.conversation.kind;

        const loadedRecord = await loadConversationRecord(
          this.conversationFile,
        );
        if (loadedRecord) {
          this.cachedConversation = loadedRecord;
          this.projectHash = this.cachedConversation.projectHash;

          if (this.conversationFile.endsWith('.json')) {
            this.conversationFile = this.conversationFile + 'l'; // e.g. session-foo.jsonl

            // Migrate the entire legacy record to the new file
            const initialMetadata = {
              sessionId: this.sessionId,
              projectHash: this.projectHash,
              startTime: this.cachedConversation.startTime,
              lastUpdated: this.cachedConversation.lastUpdated,
              kind: this.cachedConversation.kind,
              directories: this.cachedConversation.directories,
              summary: this.cachedConversation.summary,
            };
            this.appendRecord(initialMetadata);
            for (const msg of this.cachedConversation.messages) {
              this.appendRecord(msg);
            }
            if (this.cachedConversation.memoryScratchpad) {
              this.appendRecord({
                $set: {
                  memoryScratchpad: this.cachedConversation.memoryScratchpad,
                },
              });
            }
          }

          // Update the session ID in the existing file
          this.updateMetadata({ sessionId: this.sessionId });
          this.writeSidecar();
        } else {
          throw new Error('Failed to load resumed session data from file');
        }
      } else {
        // Create new session
        this.sessionId = this.context.promptId;
        let chatsDir = path.join(
          this.context.config.storage.getProjectTempDir(),
          'chats',
        );

        // subagents are nested under the complete parent session id
        if (this.kind === 'subagent' && this.context.parentSessionId) {
          const safeParentId = sanitizeFilenamePart(
            this.context.parentSessionId,
          );
          if (!safeParentId) {
            throw new Error(
              `Invalid parentSessionId after sanitization: ${this.context.parentSessionId}`,
            );
          }
          chatsDir = path.join(chatsDir, safeParentId);
        }

        fs.mkdirSync(chatsDir, { recursive: true });

        const timestamp = new Date()
          .toISOString()
          .slice(0, 16)
          .replace(/:/g, '-');
        const safeSessionId = sanitizeFilenamePart(this.sessionId);
        if (!safeSessionId) {
          throw new Error(
            `Invalid sessionId after sanitization: ${this.sessionId}`,
          );
        }

        let filename: string;
        if (this.kind === 'subagent') {
          filename = `${safeSessionId}.jsonl`;
        } else {
          filename = `${SESSION_FILE_PREFIX}${timestamp}-${safeSessionId.slice(
            0,
            8,
          )}.jsonl`;
        }
        this.conversationFile = path.join(chatsDir, filename);

        const directories =
          this.kind === 'subagent'
            ? [
                ...(this.context.config
                  .getWorkspaceContext()
                  ?.getDirectories() ?? []),
              ]
            : undefined;

        const initialMetadata = {
          sessionId: this.sessionId,
          projectHash: this.projectHash,
          startTime: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          kind: this.kind,
          directories,
        };

        this.appendRecord(initialMetadata);
        this.cachedConversation = {
          ...initialMetadata,
          messages: [],
        };
        this.writeSidecar();
      }

      this.queuedThoughts = [];
      this.queuedTokens = null;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOSPC') {
        this.conversationFile = null;
        debugLogger.warn(ENOSPC_WARNING_MESSAGE);
        return;
      }
      debugLogger.error('Error initializing chat recording service:', error);
      throw error;
    }
  }

  private appendRecord(record: unknown): void {
    if (!this.conversationFile) return;
    try {
      const line = JSON.stringify(record) + '\n';
      fs.mkdirSync(path.dirname(this.conversationFile), { recursive: true });
      fs.appendFileSync(this.conversationFile, line);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOSPC') {
        this.conversationFile = null;
        debugLogger.warn(ENOSPC_WARNING_MESSAGE);
      } else {
        throw error;
      }
    }
  }

  private writeSidecar(): void {
    if (!this.conversationFile || !this.cachedConversation) return;
    writeSessionMetadataSidecar(this.conversationFile, this.cachedConversation);
  }

  private updateMetadata(updates: Partial<ConversationRecord>): void {
    if (!this.cachedConversation) return;
    Object.assign(this.cachedConversation, updates);
    this.appendRecord({ $set: updates });
    this.writeSidecar();
  }

  private pushMessage(msg: MessageRecord): void {
    if (!this.cachedConversation) return;

    // We append the full message to the log
    this.appendRecord(msg);

    // Now update memory
    const index = this.cachedConversation.messages.findIndex(
      (m) => m.id === msg.id,
    );
    if (index !== -1) {
      this.cachedConversation.messages[index] = msg;
    } else {
      this.cachedConversation.messages.push(msg);
    }
    this.writeSidecar();
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

  recordMessage(message: {
    model: string | undefined;
    type: ConversationRecordExtra['type'];
    content: PartListUnion;
    displayContent?: PartListUnion;
  }): void {
    if (!this.conversationFile || !this.cachedConversation) return;

    try {
      const msg = this.newMessage(
        message.type,
        message.content,
        message.displayContent,
      );
      if (msg.type === 'gemini') {
        msg.thoughts = this.queuedThoughts;
        msg.tokens = this.queuedTokens;
        msg.model = message.model;
        this.queuedThoughts = [];
        this.queuedTokens = null;
      }
      this.pushMessage(msg);
      this.updateMetadata({ lastUpdated: new Date().toISOString() });
    } catch (error) {
      debugLogger.error('Error saving message to chat history.', error);
      throw error;
    }
  }

  recordThought(thought: ThoughtSummary): void {
    if (!this.conversationFile) return;
    this.queuedThoughts.push({
      ...thought,
      timestamp: new Date().toISOString(),
    });
  }

  recordMessageTokens(
    respUsageMetadata: GenerateContentResponseUsageMetadata,
  ): void {
    if (!this.conversationFile || !this.cachedConversation) return;

    try {
      const tokens = {
        input: respUsageMetadata.promptTokenCount ?? 0,
        output: respUsageMetadata.candidatesTokenCount ?? 0,
        cached: respUsageMetadata.cachedContentTokenCount ?? 0,
        thoughts: respUsageMetadata.thoughtsTokenCount ?? 0,
        tool: respUsageMetadata.toolUsePromptTokenCount ?? 0,
        total: respUsageMetadata.totalTokenCount ?? 0,
      };
      const lastMsg = this.getLastMessage(this.cachedConversation);
      if (lastMsg && lastMsg.type === 'gemini' && !lastMsg.tokens) {
        lastMsg.tokens = tokens;
        this.queuedTokens = null;
        this.pushMessage(lastMsg);
      } else {
        this.queuedTokens = tokens;
      }
    } catch (error) {
      debugLogger.error(
        'Error updating message tokens in chat history.',
        error,
      );
      throw error;
    }
  }

  recordToolCalls(model: string, toolCalls: ToolCallRecord[]): void {
    if (!this.conversationFile || !this.cachedConversation) return;

    const toolRegistry = this.context.toolRegistry;
    const enrichedToolCalls = toolCalls.map((toolCall) => {
      const toolInstance = toolRegistry.getTool(toolCall.name);
      return {
        ...toolCall,
        displayName: toolInstance?.displayName || toolCall.name,
        description:
          toolCall.description?.trim() || toolInstance?.description || '',
        renderOutputAsMarkdown: toolInstance?.isOutputMarkdown || false,
      };
    });

    try {
      const lastMsg = this.getLastMessage(this.cachedConversation);
      if (
        !lastMsg ||
        lastMsg.type !== 'gemini' ||
        this.queuedThoughts.length > 0
      ) {
        const newMsg: MessageRecord = {
          ...this.newMessage('gemini' as const, ''),
          type: 'gemini' as const,
          toolCalls: enrichedToolCalls,
          thoughts: this.queuedThoughts,
          model,
        };
        if (this.queuedThoughts.length > 0) {
          newMsg.thoughts = this.queuedThoughts;
          this.queuedThoughts = [];
        }
        if (this.queuedTokens) {
          newMsg.tokens = this.queuedTokens;
          this.queuedTokens = null;
        }
        this.pushMessage(newMsg);
      } else {
        if (!lastMsg.toolCalls) {
          lastMsg.toolCalls = [];
        }
        // Deep clone toolCalls to avoid modifying memory references directly
        const updatedToolCalls = [...lastMsg.toolCalls];

        for (const toolCall of enrichedToolCalls) {
          const index = updatedToolCalls.findIndex(
            (tc) => tc.id === toolCall.id,
          );
          if (index !== -1) {
            updatedToolCalls[index] = {
              ...updatedToolCalls[index],
              ...toolCall,
            };
          } else {
            updatedToolCalls.push(toolCall);
          }
        }

        lastMsg.toolCalls = updatedToolCalls;
        this.pushMessage(lastMsg);
      }
    } catch (error) {
      debugLogger.error(
        'Error adding tool call to message in chat history.',
        error,
      );
      throw error;
    }
  }

  saveSummary(summary: string): void {
    if (!this.conversationFile) return;
    try {
      this.updateMetadata({ summary });
    } catch (error) {
      debugLogger.error('Error saving summary to chat history.', error);
    }
  }

  recordDirectories(directories: readonly string[]): void {
    if (!this.conversationFile) return;
    try {
      this.updateMetadata({ directories: [...directories] });
    } catch (error) {
      debugLogger.error('Error saving directories to chat history.', error);
    }
  }

  getConversation(): ConversationRecord | null {
    if (!this.conversationFile) return null;
    return this.cachedConversation;
  }

  getConversationFilePath(): string | null {
    return this.conversationFile;
  }

  /**
   * Deletes a session file by sessionId, filename, or basename.
   * Derives an 8-character shortId to find and delete all associated files
   * (parent and subagents).
   *
   * @throws {Error} If shortId validation fails.
   */
  async deleteSession(sessionIdOrBasename: string): Promise<void> {
    try {
      const tempDir = this.context.config.storage.getProjectTempDir();
      const chatsDir = path.join(tempDir, 'chats');
      const shortId = this.deriveShortId(sessionIdOrBasename);

      // Using stat instead of existsSync for async sanity
      if (!(await fs.promises.stat(chatsDir).catch(() => null))) {
        return; // Nothing to delete
      }

      const matchingFiles = await this.getMatchingSessionFiles(
        chatsDir,
        shortId,
      );
      for (const file of matchingFiles) {
        await this.deleteSessionAndArtifacts(chatsDir, file, tempDir);
      }
    } catch (error) {
      debugLogger.error('Error deleting session file.', error);
      throw error;
    }
  }

  private deriveShortId(sessionIdOrBasename: string): string {
    let shortId = sessionIdOrBasename;
    if (sessionIdOrBasename.startsWith(SESSION_FILE_PREFIX)) {
      const withoutExt = sessionIdOrBasename.replace(/\.jsonl?$/, '');
      const parts = withoutExt.split('-');
      shortId = parts[parts.length - 1];
    } else if (sessionIdOrBasename.length >= 8) {
      shortId = sessionIdOrBasename.slice(0, 8);
    } else {
      throw new Error('Invalid sessionId or basename provided for deletion');
    }

    if (shortId.length !== 8) {
      throw new Error('Derived shortId must be exactly 8 characters');
    }

    return shortId;
  }

  private async getMatchingSessionFiles(
    chatsDir: string,
    shortId: string,
  ): Promise<string[]> {
    const files = await fs.promises.readdir(chatsDir);
    return files.filter(
      (f) =>
        f.startsWith(SESSION_FILE_PREFIX) &&
        (f.endsWith(`-${shortId}.json`) || f.endsWith(`-${shortId}.jsonl`)),
    );
  }

  /**
   * Deletes a single session file and its associated logs, tool-outputs, and directory.
   */
  private async deleteSessionAndArtifacts(
    chatsDir: string,
    file: string,
    tempDir: string,
  ): Promise<void> {
    const filePath = path.join(chatsDir, file);
    let fullSessionId: string | undefined;

    try {
      const CHUNK_SIZE = 4096;
      const buffer = Buffer.alloc(CHUNK_SIZE);
      let firstLine: string;
      let fd: fs.promises.FileHandle | undefined;
      try {
        fd = await fs.promises.open(filePath, 'r');
        const { bytesRead } = await fd.read(buffer, 0, CHUNK_SIZE, 0);
        if (bytesRead > 0) {
          const contentChunk = buffer.toString('utf8', 0, bytesRead);
          const newlineIndex = contentChunk.indexOf('\n');
          firstLine =
            newlineIndex !== -1
              ? contentChunk.substring(0, newlineIndex)
              : contentChunk;

          try {
            const content = JSON.parse(firstLine) as unknown;
            if (isSessionIdRecord(content)) {
              fullSessionId = content.sessionId;
            }
          } catch {
            // If first line parse fails, it might be a legacy pretty-printed JSON.
            // We'll fall back to full file read below.
          }
        }
      } finally {
        if (fd !== undefined) {
          await fd.close();
        }
      }

      // Fallback for legacy JSON files if we couldn't get sessionId from first line
      if (!fullSessionId) {
        try {
          const fileContent = await fs.promises.readFile(filePath, 'utf8');
          const parsed = JSON.parse(fileContent) as unknown;
          if (isSessionIdRecord(parsed)) {
            fullSessionId = parsed.sessionId;
          }
        } catch {
          // Ignore parse errors, we'll still try to unlink the file
        }
      }

      if (fullSessionId) {
        // Delegate to shared utility!
        await deleteSessionArtifactsAsync(fullSessionId, tempDir);
        await deleteSubagentSessionDirAndArtifactsAsync(
          fullSessionId,
          chatsDir,
          tempDir,
        );
      }
    } catch (error) {
      debugLogger.error(
        `Error deleting artifacts for session file ${file}:`,
        error,
      );
    } finally {
      // ALWAYS try to delete the session file itself
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (isNodeError(error) && error.code !== 'ENOENT') {
          debugLogger.error(`Error unlinking session file ${file}:`, error);
        }
      }

      // Best-effort removal of the metadata sidecar.
      try {
        await fs.promises.unlink(getSessionMetadataSidecarPath(filePath));
      } catch (error) {
        if (isNodeError(error) && error.code !== 'ENOENT') {
          debugLogger.error(
            `Error unlinking session metadata sidecar for ${file}:`,
            error,
          );
        }
      }
    }
  }

  /**
   * Asynchronously deletes the current session's chat file and tool outputs.
   * This encapsulates the session ID logic and uses non-blocking I/O to avoid
   * blocking the event loop on exit.
   */
  async deleteCurrentSessionAsync(): Promise<void> {
    if (!this.conversationFile) {
      return;
    }

    try {
      const tempDir = this.context.config.storage.getProjectTempDir();

      // Delete the conversation file directly using the tracked path.
      await fs.promises.unlink(this.conversationFile).catch(() => {
        // File may not exist; ignore.
      });

      // Best-effort removal of the metadata sidecar.
      await fs.promises
        .unlink(getSessionMetadataSidecarPath(this.conversationFile))
        .catch(() => {
          // File may not exist; ignore.
        });

      // Delegate tool-output and log cleanup to the shared utility.
      await deleteSessionArtifactsAsync(this.sessionId, tempDir);
    } catch (error) {
      debugLogger.error('Error deleting current session.', error);
      throw error;
    }
  }

  /**
   * Rewinds the conversation to the state just before the specified message ID.
   * All messages from (and including) the specified ID onwards are removed.
   */
  rewindTo(messageId: string): ConversationRecord | null {
    if (!this.conversationFile || !this.cachedConversation) return null;

    const messageIndex = this.cachedConversation.messages.findIndex(
      (m) => m.id === messageId,
    );

    if (messageIndex === -1) {
      debugLogger.error(
        'Message to rewind to not found in conversation history',
      );
      return this.cachedConversation;
    }

    this.cachedConversation.messages = this.cachedConversation.messages.slice(
      0,
      messageIndex,
    );
    this.appendRecord({ $rewindTo: messageId });
    this.writeSidecar();
    return this.cachedConversation;
  }

  updateMessagesFromHistory(history: readonly Content[]): void {
    if (!this.conversationFile || !this.cachedConversation) return;

    try {
      const partsMap = new Map<string, Part[]>();
      for (const content of history) {
        if (content.role === 'user' && content.parts) {
          const callIds = content.parts
            .map((p) => p.functionResponse?.id)
            .filter((id): id is string => !!id);

          if (callIds.length === 0) continue;

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

      for (const message of this.cachedConversation.messages) {
        let msgChanged = false;
        if (message.type === 'gemini' && message.toolCalls) {
          for (const toolCall of message.toolCalls) {
            const newParts = partsMap.get(toolCall.id);
            if (newParts !== undefined) {
              toolCall.result = newParts;
              msgChanged = true;
            }
          }
        }
        if (msgChanged) {
          // Push updated message to log
          this.pushMessage(message);
        }
      }
    } catch (error) {
      debugLogger.error(
        'Error updating conversation history from memory.',
        error,
      );
      throw error;
    }
  }
}

async function parseLegacyRecordFallback(
  filePath: string,
  options?: LoadConversationOptions,
): Promise<
  | (ConversationRecord & {
      messageCount?: number;
      userMessageCount?: number;
      firstUserMessage?: string;
      hasUserOrAssistantMessage?: boolean;
    })
  | null
> {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(fileContent) as unknown;

    const isLegacyRecord = (val: unknown): val is ConversationRecord =>
      typeof val === 'object' && val !== null && 'sessionId' in val;

    if (isLegacyRecord(parsed)) {
      const legacyRecord = parsed;
      if (options?.metadataOnly) {
        let fallbackFirstUserMessageStr: string | undefined;
        const firstUserMessage = legacyRecord.messages?.find(
          (m) => m.type === 'user',
        );
        if (firstUserMessage) {
          const rawContent = firstUserMessage.content;
          if (Array.isArray(rawContent)) {
            fallbackFirstUserMessageStr = rawContent
              .map((p: unknown) => (isTextPart(p) ? p['text'] : ''))
              .join('');
          } else if (typeof rawContent === 'string') {
            fallbackFirstUserMessageStr = rawContent;
          }
        }
        return {
          ...legacyRecord,
          messages: [],
          messageCount: legacyRecord.messages?.length || 0,
          userMessageCount:
            legacyRecord.messages?.filter((m) => m.type === 'user').length || 0,
          firstUserMessage: fallbackFirstUserMessageStr,
          hasUserOrAssistantMessage:
            legacyRecord.messages?.some(
              (m) => m.type === 'user' || m.type === 'gemini',
            ) || false,
        };
      }
      return {
        ...legacyRecord,
        userMessageCount:
          legacyRecord.messages?.filter((m) => m.type === 'user').length || 0,
        hasUserOrAssistantMessage:
          legacyRecord.messages?.some(
            (m) => m.type === 'user' || m.type === 'gemini',
          ) || false,
      };
    }
  } catch {
    // ignore legacy fallback parse error
  }
  return null;
}
