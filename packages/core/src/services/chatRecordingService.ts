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
  deleteStoredSession,
} from '../utils/sessionOperations.js';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import type {
  PartListUnion,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { HistoryTurn } from '../core/agentChatHistory.js';
import { partListUnionToString } from '../core/geminiRequest.js';
import { isIgnoredUserContent } from '../utils/sessionUtils.js';
import {
  SESSION_FILE_PREFIX,
  MAX_HISTORY_MESSAGES,
  type TokensSummary,
  type ToolCallRecord,
  type ConversationRecordExtra,
  type MessageRecord,
  type ConversationRecord,
  type ResumedSessionData,
  type LoadConversationOptions,
  type RewindRecord,
  type MessagePatch,
  type MessagePatchRecord,
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

/**
 * Warning message shown when recording is disabled due to conversation exceeding
 * the maximum serializable size.
 */
const RANGE_WARNING_MESSAGE =
  'Chat recording disabled: Conversation exceeded maximum serializable size. ' +
  'The conversation will continue but will not be saved to disk.';

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

function isMessagePatchRecord(record: unknown): record is MessagePatchRecord {
  return isObjectProperty(record, '$patch');
}

function isMessageRecord(record: unknown): record is MessageRecord {
  return isStringProperty(record, 'id') && !hasProperty(record, '$patch');
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

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface ContentFingerprint {
  digest: string;
}

interface MessageMeta {
  id: string;
  type: MessageRecord['type'];
  isResumable: boolean;
  contentFp: ContentFingerprint;
}

interface ToolCallMeta {
  id: string;
  messageId: string;
  resultFp: ContentFingerprint;
}

function computeContentDigest(value: PartListUnion | null | undefined): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  let totalLen = 0;

  const mix = (code: number): void => {
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
    totalLen++;
  };

  const mixString = (str: string): void => {
    const len = str.length;
    mix(len);
    totalLen += len;
    for (let i = 0; i < len; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
  };

  const visit = (val: unknown): void => {
    if (val === null || val === undefined) {
      mix(0);
      return;
    }
    if (typeof val === 'string') {
      mix(1);
      mixString(val);
    } else if (typeof val === 'number') {
      mix(2);
      mixString(String(val));
    } else if (typeof val === 'boolean') {
      mix(3);
      mix(val ? 1 : 0);
    } else if (Array.isArray(val)) {
      mix(4);
      mix(val.length);
      for (let i = 0; i < val.length; i++) {
        visit(val[i]);
      }
    } else if (isRecordObject(val)) {
      mix(5);
      const keys = Object.keys(val).sort();
      mix(keys.length);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        mixString(k);
        visit(val[k]);
      }
    }
  };

  visit(value ?? []);

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${totalLen}:${h1 >>> 0}:${h2 >>> 0}`;
}

function createFingerprint(
  value: PartListUnion | null | undefined,
): ContentFingerprint {
  return {
    digest: computeContentDigest(value),
  };
}

function updateFingerprintIfChanged(
  fp: ContentFingerprint,
  nextValue: PartListUnion | null | undefined,
): boolean {
  const nextDigest = computeContentDigest(nextValue);
  if (nextDigest === fp.digest) {
    return false;
  }
  fp.digest = nextDigest;
  return true;
}

/**
 * Returns true when a stored message represents conversation content worth
 * surfacing in resume flows.
 */
export function isResumableMessageRecord(message: MessageRecord): boolean {
  const contentString = message.content
    ? partListUnionToString(message.content)
    : '';

  if (message.type === 'user') {
    return !isIgnoredUserContent(contentString.trim());
  }

  if (message.type === 'gemini') {
    return (
      contentString.trim().length > 0 ||
      (message.toolCalls?.length ?? 0) > 0 ||
      (message.thoughts?.length ?? 0) > 0
    );
  }

  return false;
}

export function hasResumableConversationContent(
  messages: readonly MessageRecord[],
): boolean {
  return messages.some((message) => isResumableMessageRecord(message));
}

type LoadedConversationResult = ConversationRecord & {
  messageCount?: number;
  userMessageCount?: number;
  firstUserMessage?: string;
  hasResumableContent?: boolean;
  memoryScratchpadIsStale?: boolean;
};

function createJsonlRecordAccumulator(options?: LoadConversationOptions) {
  let metadata: Partial<ConversationRecord> = {};
  const messagesMap = new Map<string, MessageRecord>();
  const messageIds: string[] = [];
  const messageKinds = new Map<
    string,
    { isUser: boolean; isResumable: boolean }
  >();
  let isTrackingMemoryScratchpadFreshness = false;
  let memoryScratchpadIsStale = false;
  let firstUserMessageStr: string | undefined;

  const applySinglePatch = (patch: MessagePatch) => {
    if (options?.metadataOnly) {
      if ('content' in patch && patch.content !== undefined) {
        const kind = messageKinds.get(patch.id);
        if (kind) {
          const contentStr = partListUnionToString(patch.content).trim();
          if (kind.isUser) {
            kind.isResumable = !isIgnoredUserContent(contentStr);
          } else if (contentStr.length > 0) {
            kind.isResumable = true;
          }
        }
      }
      return;
    }

    const existing = messagesMap.get(patch.id);
    if (!existing) return;

    if ('content' in patch && patch.content !== undefined) {
      existing.content = patch.content;
    }
    if (
      Array.isArray(patch.toolCalls) &&
      existing.type === 'gemini' &&
      existing.toolCalls
    ) {
      for (const tcPatch of patch.toolCalls) {
        const tc = existing.toolCalls.find((t) => t.id === tcPatch.id);
        if (tc && 'result' in tcPatch) {
          tc.result = tcPatch.result;
        }
      }
    }
  };

  const processLine = (line: string) => {
    if (!line.trim()) return;
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
      } else if (isMessagePatchRecord(record)) {
        if (isTrackingMemoryScratchpadFreshness) {
          memoryScratchpadIsStale = true;
        }
        const patchObj = record.$patch;
        if (isStringProperty(patchObj, 'id')) {
          applySinglePatch(patchObj as MessagePatch);
        }
        if (
          hasProperty(patchObj, 'updates') &&
          Array.isArray(patchObj.updates)
        ) {
          for (const update of patchObj.updates) {
            if (isStringProperty(update, 'id')) {
              applySinglePatch(update as MessagePatch);
            }
          }
        }
        if (
          hasProperty(patchObj, 'removeIds') &&
          Array.isArray(patchObj.removeIds)
        ) {
          for (const remId of patchObj.removeIds) {
            if (typeof remId !== 'string') continue;
            if (options?.metadataOnly) {
              const idx = messageIds.indexOf(remId);
              if (idx !== -1) {
                messageIds.splice(idx, 1);
              }
              messageKinds.delete(remId);
            } else {
              messagesMap.delete(remId);
            }
          }
        }
        if (
          hasProperty(patchObj, 'orderIds') &&
          Array.isArray(patchObj.orderIds)
        ) {
          if (options?.metadataOnly) {
            const orderSet = new Set<string>();
            const orderedIds: string[] = [];
            for (const id of patchObj.orderIds) {
              if (typeof id === 'string' && messageKinds.has(id)) {
                orderSet.add(id);
                orderedIds.push(id);
              }
            }
            const prefixIds = messageIds.filter((id) => !orderSet.has(id));
            messageIds.length = 0;
            messageIds.push(...prefixIds, ...orderedIds);
          } else {
            const orderSet = new Set<string>();
            const orderedEntries: Array<[string, MessageRecord]> = [];
            for (const id of patchObj.orderIds) {
              if (typeof id === 'string') {
                const msg = messagesMap.get(id);
                if (msg) {
                  orderSet.add(id);
                  orderedEntries.push([id, msg]);
                }
              }
            }
            const prefixEntries: Array<[string, MessageRecord]> = [];
            for (const [id, msg] of messagesMap) {
              if (!orderSet.has(id)) {
                prefixEntries.push([id, msg]);
              }
            }
            messagesMap.clear();
            for (const [id, msg] of prefixEntries) {
              messagesMap.set(id, msg);
            }
            for (const [id, msg] of orderedEntries) {
              messagesMap.set(id, msg);
            }
          }
        }
      } else if (isMessageRecord(record)) {
        if (isTrackingMemoryScratchpadFreshness) {
          memoryScratchpadIsStale = true;
        }
        const id = record.id;
        const isUser = hasProperty(record, 'type') && record.type === 'user';
        const isResumable = isResumableMessageRecord(record);
        if (options?.metadataOnly) {
          if (!messageKinds.has(id)) {
            messageIds.push(id);
          }
          messageKinds.set(id, { isUser, isResumable });
        }
        if (
          !firstUserMessageStr &&
          isUser &&
          hasProperty(record, 'content') &&
          record['content'] &&
          isResumable
        ) {
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
          if (options?.maxMessages && messagesMap.size > options.maxMessages) {
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
        if (
          hasProperty(record.$set, 'messages') &&
          Array.isArray(record.$set.messages)
        ) {
          messagesMap.clear();
          if (options?.metadataOnly) {
            messageIds.length = 0;
            messageKinds.clear();
          }
          for (const msg of record.$set.messages) {
            if (isMessageRecord(msg)) {
              const id = msg.id;
              const isUser = msg.type === 'user';
              const isResumable = isResumableMessageRecord(msg);

              if (options?.metadataOnly) {
                messageIds.push(id);
                messageKinds.set(id, {
                  isUser,
                  isResumable,
                });
              } else {
                messagesMap.set(id, msg);
              }

              if (
                !firstUserMessageStr &&
                isUser &&
                isResumable &&
                msg.content &&
                (Array.isArray(msg.content) || typeof msg.content === 'string')
              ) {
                if (Array.isArray(msg.content)) {
                  firstUserMessageStr = msg.content
                    .map((p: unknown) => (isTextPart(p) ? p.text : ''))
                    .join('');
                } else {
                  firstUserMessageStr = msg.content;
                }
              }
            }
          }
        }
        metadata = {
          ...metadata,
          ...record.$set,
        };
      } else if (isPartialMetadataRecord(record)) {
        metadata = { ...metadata, ...record };
        if (hasProperty(record, 'messages') && Array.isArray(record.messages)) {
          for (const msg of record.messages) {
            if (isMessageRecord(msg)) {
              const id = msg.id;
              const isUser = msg.type === 'user';
              const isResumable = isResumableMessageRecord(msg);

              if (options?.metadataOnly) {
                messageIds.push(id);
                messageKinds.set(id, {
                  isUser,
                  isResumable,
                });
              } else {
                messagesMap.set(id, msg);
              }

              if (
                !firstUserMessageStr &&
                isUser &&
                isResumable &&
                msg.content &&
                (Array.isArray(msg.content) || typeof msg.content === 'string')
              ) {
                if (Array.isArray(msg.content)) {
                  firstUserMessageStr = msg.content
                    .map((p: unknown) => (isTextPart(p) ? p.text : ''))
                    .join('');
                } else {
                  firstUserMessageStr = msg.content;
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore parse errors on individual lines
    }
  };

  const finalize = (): LoadedConversationResult | null => {
    if (!metadata.sessionId || !metadata.projectHash) {
      return null;
    }

    const loadedMessages = Array.from(messagesMap.values());
    const metadataFirstUserMessage =
      loadedMessages.find(
        (message) =>
          message.type === 'user' && isResumableMessageRecord(message),
      ) ?? null;
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
    const hasResumableContent = options?.metadataOnly
      ? Array.from(messageKinds.values()).some((m) => m.isResumable)
      : hasResumableConversationContent(loadedMessages);

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
        ? loadedMessages.length || messageIds.length
        : loadedMessages.length,
      userMessageCount,
      memoryScratchpadIsStale: isTrackingMemoryScratchpadFreshness
        ? memoryScratchpadIsStale
        : undefined,
      firstUserMessage: fallbackFirstUserMessage,
      hasResumableContent,
    };
  };

  return { processLine, finalize };
}

function loadConversationRecordSync(
  filePath: string,
  options?: LoadConversationOptions,
): LoadedConversationResult | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const accumulator = createJsonlRecordAccumulator(options);
    let start = 0;
    while (start < content.length) {
      const nl = content.indexOf('\n', start);
      const line = nl === -1 ? content.slice(start) : content.slice(start, nl);
      accumulator.processLine(line);
      if (nl === -1) break;
      start = nl + 1;
    }

    const result = accumulator.finalize();
    if (result) {
      return result;
    }
    return parseLegacyContentFallback(content, options);
  } catch (error) {
    debugLogger.error(
      'Error loading conversation record synchronously:',
      error,
    );
    return null;
  }
}

export async function loadConversationRecord(
  filePath: string,
  options?: LoadConversationOptions,
): Promise<LoadedConversationResult | null> {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const accumulator = createJsonlRecordAccumulator(options);
    for await (const line of rl) {
      accumulator.processLine(line);
    }

    const result = accumulator.finalize();
    if (result) {
      return result;
    }
    return await parseLegacyRecordFallback(filePath, options);
  } catch (error) {
    debugLogger.error('Error loading conversation record from JSONL:', error);
    return null;
  }
}

export class ChatRecordingService {
  private conversationFile: string | null = null;
  private cachedConversation: ConversationRecord | null = null;
  private sessionId: string;
  private projectHash: string;
  private kind?: 'main' | 'subagent';
  private queuedThoughts: Array<ThoughtSummary & { timestamp: string }> = [];
  private queuedTokens: TokensSummary | null = null;
  private context: AgentLoopContext;
  private messageOrder: string[] = [];
  private messageMetaMap = new Map<string, MessageMeta>();
  private toolCallMetaMap = new Map<string, ToolCallMeta>();
  private hasEvictedMessages = false;
  private fullConversationCache: WeakRef<ConversationRecord> | null = null;
  private isCacheDirty = true;

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

          this.rebuildIndexAndWindow(this.cachedConversation.messages);

          // Update the session ID in the existing file
          this.updateMetadata({ sessionId: this.sessionId });
        } else {
          // The file could not be reloaded (missing, corrupt metadata, or an
          // I/O error). Fall back to the in-memory conversation we were handed
          // rather than failing the caller, and rewrite a clean file from it.
          debugLogger.warn(
            'Failed to reload resumed session data from file; falling back ' +
              'to the in-memory conversation.',
          );
          this.cachedConversation = {
            ...resumedSessionData.conversation,
            messages: [...(resumedSessionData.conversation.messages ?? [])],
          };
          this.projectHash = this.cachedConversation.projectHash;
          this.rewriteConversationFile(this.cachedConversation);
          this.rebuildIndexAndWindow(this.cachedConversation.messages);
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
          const shortId = safeSessionId.slice(0, 8);
          filename = `${SESSION_FILE_PREFIX}${timestamp}-${shortId}.jsonl`;
          let collisionIndex = 1;
          while (fs.existsSync(path.join(chatsDir, filename))) {
            filename = `${SESSION_FILE_PREFIX}${timestamp}-${collisionIndex++}-${shortId}.jsonl`;
          }
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
        this.rebuildIndexAndWindow([]);
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

  private indexMessage(msg: MessageRecord): void {
    if (!this.messageMetaMap.has(msg.id)) {
      this.messageOrder.push(msg.id);
    }
    this.messageMetaMap.set(msg.id, {
      id: msg.id,
      type: msg.type,
      isResumable: isResumableMessageRecord(msg),
      contentFp: createFingerprint(msg.content),
    });
    if (msg.type === 'gemini' && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        this.toolCallMetaMap.set(tc.id, {
          id: tc.id,
          messageId: msg.id,
          resultFp: createFingerprint(tc.result),
        });
      }
    }
  }

  private trimCachedMessages(): void {
    if (!this.cachedConversation) return;
    const msgs = this.cachedConversation.messages;
    if (msgs.length > MAX_HISTORY_MESSAGES) {
      const excess = msgs.length - MAX_HISTORY_MESSAGES;
      msgs.splice(0, excess);
    }
    this.hasEvictedMessages = msgs.length < this.messageOrder.length;
  }

  private rebuildIndexAndWindow(messages: readonly MessageRecord[]): void {
    this.messageOrder = [];
    this.messageMetaMap.clear();
    this.toolCallMetaMap.clear();

    for (const msg of messages) {
      this.indexMessage(msg);
    }

    if (this.cachedConversation) {
      this.cachedConversation.messages =
        messages.length > MAX_HISTORY_MESSAGES
          ? messages.slice(-MAX_HISTORY_MESSAGES)
          : [...messages];
      this.hasEvictedMessages =
        this.cachedConversation.messages.length < this.messageOrder.length;
    } else {
      this.hasEvictedMessages = false;
    }
  }

  private appendRecord(record: unknown): void {
    if (!this.conversationFile) return;
    this.isCacheDirty = true;
    this.fullConversationCache = null;
    try {
      const line = JSON.stringify(record) + '\n';
      fs.mkdirSync(path.dirname(this.conversationFile), { recursive: true });
      fs.appendFileSync(this.conversationFile, line);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOSPC') {
        this.conversationFile = null;
        debugLogger.warn(ENOSPC_WARNING_MESSAGE);
      } else if (error instanceof RangeError || error instanceof TypeError) {
        this.conversationFile = null;
        const message = error instanceof RangeError ? RANGE_WARNING_MESSAGE : 'Chat recording disabled: Conversation data could not be serialized.';
        debugLogger.warn(message, error);
      } else {
        throw error;
      }
    }
  }

  /**
   * Rewrites the session file from an in-memory record. Any existing
   * (unreadable) file is preserved alongside rather than destroyed, and the
   * new file is written atomically (temp file + rename).
   */
  private rewriteConversationFile(conversation: ConversationRecord): void {
    if (!this.conversationFile) return;
    this.isCacheDirty = true;
    this.fullConversationCache = null;

    // Normalize legacy `.json` paths to the `.jsonl` format we write.
    if (this.conversationFile.endsWith('.json')) {
      this.conversationFile = this.conversationFile + 'l';
    }

    const { messages, memoryScratchpad, ...metadata } = conversation;
    const lines: string[] = [JSON.stringify(metadata)];
    for (const msg of messages) {
      lines.push(JSON.stringify(msg));
    }
    if (memoryScratchpad) {
      lines.push(JSON.stringify({ $set: { memoryScratchpad } }));
    }
    const content = lines.join('\n') + '\n';

    try {
      fs.mkdirSync(path.dirname(this.conversationFile), { recursive: true });

      // The existing file was unreadable, but it may have been only
      // transiently so (a lock or I/O blip) rather than truly corrupt. Keep
      // its bytes rather than destroying them.
      if (fs.existsSync(this.conversationFile)) {
        const backup = `${this.conversationFile}.unreadable-${Date.now()}`;
        try {
          fs.renameSync(this.conversationFile, backup);
          debugLogger.warn(
            `Preserved the unreadable session file at ${backup}.`,
          );
        } catch (backupError) {
          debugLogger.error(
            'Failed to preserve the unreadable session file.',
            backupError,
          );
        }
      }

      const tempFile = `${this.conversationFile}.tmp-${process.pid}`;
      try {
        fs.writeFileSync(tempFile, content);
        fs.renameSync(tempFile, this.conversationFile);
      } catch (error) {
        // The rename did not complete, so the temp file would be left behind.
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors so the original failure still surfaces.
        }
        throw error;
      }
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOSPC') {
        this.conversationFile = null;
        debugLogger.warn(ENOSPC_WARNING_MESSAGE);
      } else {
        throw error;
      }
    }
  }

  private updateMetadata(
    updates: Partial<Omit<ConversationRecord, 'messages'>>,
  ): void {
    if (!this.cachedConversation) return;
    Object.assign(this.cachedConversation, updates);
    this.appendRecord({ $set: updates });
  }

  private pushMessage(msg: MessageRecord): void {
    if (!this.cachedConversation) return;

    // We append the full message to the log
    this.appendRecord(msg);

    // Update lightweight session index
    this.indexMessage(msg);

    // Now update bounded in-memory window
    const index = this.cachedConversation.messages.findIndex(
      (m) => m.id === msg.id,
    );
    if (index !== -1) {
      this.cachedConversation.messages[index] = msg;
    } else {
      this.cachedConversation.messages.push(msg);
    }
    this.trimCachedMessages();
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
    id?: string,
  ): MessageRecord {
    return {
      id: id || randomUUID(),
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
    id?: string;
  }): string {
    if (!this.conversationFile || !this.cachedConversation)
      return message.id || randomUUID();

    try {
      const msg = this.newMessage(
        message.type,
        message.content,
        message.displayContent,
        message.id,
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
      return msg.id;
    } catch (error) {
      debugLogger.error('Error saving message to chat history.', error);
      throw error;
    }
  }

  /**
   * Records a synthetic message (e.g. Binary Received, Snapshot/Summary)
   * and returns its durable ID.
   */
  recordSyntheticMessage(
    type: ConversationRecordExtra['type'],
    content: PartListUnion,
    id?: string,
  ): string {
    return this.recordMessage({
      model: undefined,
      type,
      content,
      id,
    });
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
    if (!this.conversationFile || !this.cachedConversation) return null;
    if (!this.hasEvictedMessages) {
      return this.cachedConversation;
    }
    const cachedFull = !this.isCacheDirty
      ? this.fullConversationCache?.deref()
      : undefined;
    if (cachedFull) {
      return cachedFull;
    }
    const loaded = loadConversationRecordSync(this.conversationFile);
    if (loaded) {
      const fullRecord: ConversationRecord = {
        ...this.cachedConversation,
        messages: loaded.messages,
      };
      this.fullConversationCache = new WeakRef(fullRecord);
      this.isCacheDirty = false;
      return fullRecord;
    }
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
    return deleteStoredSession(this.context.config, sessionIdOrBasename);
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

      // Delegate tool-output and log cleanup to the shared utility.
      await deleteSessionArtifactsAsync(this.sessionId, tempDir);
    } catch (error) {
      debugLogger.error('Error deleting current session.', error);
      throw error;
    }
  }

  /**
   * Deletes the current session only if it has no resumable conversation
   * content. This removes abandoned startup-only sessions while preserving any
   * session with a real user prompt, model response, or tool activity.
   */
  async deleteCurrentSessionIfNotResumableAsync(): Promise<void> {
    if (!this.conversationFile || !this.cachedConversation) {
      return;
    }

    if (
      hasResumableConversationContent(this.cachedConversation.messages) ||
      Array.from(this.messageMetaMap.values()).some((m) => m.isResumable)
    ) {
      return;
    }

    await this.deleteCurrentSessionAsync();
  }

  /**
   * Rewinds the conversation to the state just before the specified message ID.
   * All messages from (and including) the specified ID onwards are removed.
   */
  rewindTo(messageId: string): ConversationRecord | null {
    if (!this.conversationFile || !this.cachedConversation) return null;

    const orderIndex = this.messageOrder.indexOf(messageId);
    if (orderIndex === -1) {
      debugLogger.error(
        'Message to rewind to not found in conversation history',
      );
      return this.getConversation();
    }

    let rewoundMessages: MessageRecord[];
    if (!this.hasEvictedMessages) {
      const messageIndex = this.cachedConversation.messages.findIndex(
        (m) => m.id === messageId,
      );
      rewoundMessages =
        messageIndex !== -1
          ? this.cachedConversation.messages.slice(0, messageIndex)
          : [];
    } else if (orderIndex === 0) {
      rewoundMessages = [];
    } else {
      const fullConversation = loadConversationRecordSync(
        this.conversationFile,
      );
      const allMessages =
        fullConversation?.messages ?? this.cachedConversation.messages;
      const messageIndex = allMessages.findIndex((m) => m.id === messageId);
      rewoundMessages =
        messageIndex !== -1 ? allMessages.slice(0, messageIndex) : [];
    }

    this.appendRecord({ $rewindTo: messageId });
    this.rebuildIndexAndWindow(rewoundMessages);

    if (!this.hasEvictedMessages) {
      return this.cachedConversation;
    }
    return {
      ...this.cachedConversation,
      messages: rewoundMessages,
    };
  }

  updateMessagesFromHistory(history: readonly HistoryTurn[]): void {
    if (!this.conversationFile || !this.cachedConversation) return;

    try {
      const previousMessageOrder = [...this.messageOrder];
      let anyChange = false;
      let newMessagesAdded = false;
      const patchesByMsgId = new Map<string, MessagePatch>();

      const getOrCreatePatch = (id: string): MessagePatch => {
        let patch = patchesByMsgId.get(id);
        if (!patch) {
          patch = { id };
          patchesByMsgId.set(id, patch);
        }
        return patch;
      };

      // 1. Sync content and IDs
      for (const turn of history) {
        const turnParts = turn.content.parts || [];
        const existingMeta = this.messageMetaMap.get(turn.id);

        if (existingMeta) {
          const contentChanged = updateFingerprintIfChanged(
            existingMeta.contentFp,
            turnParts,
          );
          if (contentChanged) {
            anyChange = true;
            const cachedIdx = this.cachedConversation.messages.findIndex(
              (m) => m.id === turn.id,
            );
            if (cachedIdx !== -1) {
              this.cachedConversation.messages[cachedIdx] = {
                ...this.cachedConversation.messages[cachedIdx],
                content: turnParts,
              };
            }
            const patch = getOrCreatePatch(turn.id);
            patch.content = turnParts;
            const contentStr = partListUnionToString(turnParts).trim();
            if (existingMeta.type === 'user') {
              existingMeta.isResumable = !isIgnoredUserContent(contentStr);
            } else if (
              existingMeta.type === 'gemini' &&
              contentStr.length > 0
            ) {
              existingMeta.isResumable = true;
            }
          }
        } else {
          anyChange = true;
          newMessagesAdded = true;
          const newMsg = this.newMessage(
            turn.content.role === 'user' ? 'user' : 'gemini',
            turnParts,
            undefined,
            turn.id,
          );
          this.appendRecord(newMsg);
          this.indexMessage(newMsg);
          this.cachedConversation.messages.push(newMsg);
        }
      }

      // 2. Specialized 'Masking Sync' for tool call results
      // If a user turn in history contains a functionResponse, we update the
      // corresponding ToolCallRecord in the preceding gemini message.
      for (const turn of history) {
        if (turn.content.role !== 'user') continue;
        const turnParts = turn.content.parts || [];
        for (const part of turnParts) {
          if (part.functionResponse) {
            const callId = part.functionResponse.id;
            if (!callId) continue;
            const tcMeta = this.toolCallMetaMap.get(callId);
            if (tcMeta) {
              if (updateFingerprintIfChanged(tcMeta.resultFp, turnParts)) {
                anyChange = true;
                const geminiMsg = this.cachedConversation.messages.find(
                  (m) => m.id === tcMeta.messageId && m.type === 'gemini',
                );
                if (
                  geminiMsg &&
                  geminiMsg.type === 'gemini' &&
                  geminiMsg.toolCalls
                ) {
                  const tc = geminiMsg.toolCalls.find((t) => t.id === callId);
                  if (tc) {
                    tc.result = turnParts;
                  }
                }
                const patch = getOrCreatePatch(tcMeta.messageId);
                if (!patch.toolCalls) {
                  patch.toolCalls = [];
                }
                const existingTcPatch = patch.toolCalls.find(
                  (t) => t.id === callId,
                );
                if (existingTcPatch) {
                  existingTcPatch.result = turnParts;
                } else {
                  patch.toolCalls.push({ id: callId, result: turnParts });
                }
              }
            }
          }
        }
      }

      // 3. Reconcile removals, rollbacks, and ordering
      const historyIds = history.map((t) => t.id);
      const historyIdSet = new Set(historyIds);
      const removedIds = previousMessageOrder.filter(
        (id) => !historyIdSet.has(id),
      );

      if (removedIds.length > 0) {
        const removedSet = new Set(removedIds);
        for (const remId of removedIds) {
          this.messageMetaMap.delete(remId);
        }
        for (const [tcId, tcMeta] of this.toolCallMetaMap) {
          if (removedSet.has(tcMeta.messageId)) {
            this.toolCallMetaMap.delete(tcId);
          }
        }
      }

      const remainingOrder = this.messageOrder.filter((id) =>
        historyIdSet.has(id),
      );
      const orderChanged =
        remainingOrder.length !== historyIds.length ||
        remainingOrder.some((id, idx) => id !== historyIds[idx]);

      const isPureTailRollback =
        removedIds.length > 0 &&
        !newMessagesAdded &&
        patchesByMsgId.size === 0 &&
        !orderChanged &&
        previousMessageOrder.length === historyIds.length + removedIds.length &&
        previousMessageOrder
          .slice(historyIds.length)
          .every((id, idx) => id === removedIds[idx]);

      if (isPureTailRollback) {
        this.appendRecord({ $rewindTo: removedIds[0] });
        anyChange = true;
      } else if (
        patchesByMsgId.size > 0 ||
        removedIds.length > 0 ||
        orderChanged
      ) {
        const patchPayload: MessagePatchRecord['$patch'] = {};
        if (patchesByMsgId.size > 0) {
          patchPayload.updates = Array.from(patchesByMsgId.values());
        }
        if (removedIds.length > 0) {
          patchPayload.removeIds = removedIds;
        }
        if (orderChanged) {
          patchPayload.orderIds = historyIds;
        }
        this.appendRecord({ $patch: patchPayload });
        anyChange = true;
      }

      let reloadedFromDisk = false;
      if (
        this.hasEvictedMessages &&
        this.conversationFile &&
        (removedIds.length > 0 || orderChanged)
      ) {
        const fullConversation = loadConversationRecordSync(
          this.conversationFile,
        );
        if (fullConversation) {
          const msgMap = new Map(
            fullConversation.messages.map((m) => [m.id, m]),
          );
          this.cachedConversation.messages = historyIds
            .map((id) => msgMap.get(id))
            .filter((m): m is MessageRecord => m !== undefined);
          reloadedFromDisk = true;
        }
      }

      if (!reloadedFromDisk) {
        if (removedIds.length > 0) {
          const removedSet = new Set(removedIds);
          this.cachedConversation.messages =
            this.cachedConversation.messages.filter(
              (m) => !removedSet.has(m.id),
            );
        }
        if (orderChanged) {
          const cachedById = new Map(
            this.cachedConversation.messages.map((m) => [m.id, m]),
          );
          this.cachedConversation.messages = historyIds
            .map((id) => cachedById.get(id))
            .filter((m): m is MessageRecord => m !== undefined);
        }
      }

      this.messageOrder = historyIds;
      this.trimCachedMessages();

      if (anyChange) {
        this.updateMetadata({
          lastUpdated: new Date().toISOString(),
        });
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

function parseLegacyContentFallback(
  fileContent: string,
  options?: LoadConversationOptions,
): LoadedConversationResult | null {
  try {
    const parsed = JSON.parse(fileContent) as unknown;

    const isLegacyRecord = (val: unknown): val is ConversationRecord =>
      typeof val === 'object' && val !== null && 'sessionId' in val;

    if (isLegacyRecord(parsed)) {
      const legacyRecord = parsed;
      if (options?.metadataOnly) {
        let fallbackFirstUserMessageStr: string | undefined;
        const firstUserMessage = legacyRecord.messages?.find(
          (m) => m.type === 'user' && isResumableMessageRecord(m),
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
          hasResumableContent:
            legacyRecord.messages?.some((m) => isResumableMessageRecord(m)) ||
            false,
        };
      }
      return {
        ...legacyRecord,
        userMessageCount:
          legacyRecord.messages?.filter((m) => m.type === 'user').length || 0,
        hasResumableContent:
          legacyRecord.messages?.some((m) => isResumableMessageRecord(m)) ||
          false,
      };
    }
  } catch {
    // ignore legacy fallback parse error
  }
  return null;
}

async function parseLegacyRecordFallback(
  filePath: string,
  options?: LoadConversationOptions,
): Promise<LoadedConversationResult | null> {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    return parseLegacyContentFallback(fileContent, options);
  } catch {
    return null;
  }
}
