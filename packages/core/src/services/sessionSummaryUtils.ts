/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { SessionSummaryService } from './sessionSummaryService.js';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  SESSION_FILE_PREFIX,
  type ConversationRecord,
  type MemoryScratchpad,
  type MessageRecord,
  type ToolCallRecord,
} from './chatRecordingService.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES_FOR_SUMMARY = 1;
const MAX_SCRATCHPAD_TOOLS = 6;
const MAX_SCRATCHPAD_PATHS = 4;
const MAX_WORKFLOW_SUMMARY_LENGTH = 160;
const VALIDATION_COMMAND_REGEX =
  /\b(test|tests|vitest|jest|pytest|cargo test|npm test|pnpm test|yarn test|bun test|lint|build|check|typecheck)\b/i;
const PATH_KEY_REGEX = /(path|file|dir|directory|cwd|root)/i;
const VALIDATION_TOOL_REGEX = /(test|lint|build|check)/i;

interface LoadedSession {
  sessionId?: string;
  projectHash?: string;
  startTime?: string;
  summary?: string;
  memoryScratchpad?: MemoryScratchpad;
  lastUpdated?: string;
  directories?: string[];
  kind?: 'main' | 'subagent';
  messages: ConversationRecord['messages'];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: unknown } {
  return isObjectRecord(obj) && prop in obj;
}

function isStringProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: string } {
  return hasProperty(obj, prop) && typeof obj[prop] === 'string';
}

function getStringProperty<T extends string>(
  obj: unknown,
  prop: T,
): string | undefined {
  return isStringProperty(obj, prop) ? obj[prop] : undefined;
}

function getStringArrayProperty<T extends string>(
  obj: unknown,
  prop: T,
): string[] | undefined {
  if (!hasProperty(obj, prop) || !Array.isArray(obj[prop])) {
    return undefined;
  }

  const values = obj[prop].filter(
    (value): value is string => typeof value === 'string',
  );
  return values.length > 0 ? values : [];
}

function getKindProperty(obj: unknown): ConversationRecord['kind'] | undefined {
  const kind = getStringProperty(obj, 'kind');
  return kind === 'main' || kind === 'subagent' ? kind : undefined;
}

function isMemoryValidationStatus(
  value: unknown,
): value is MemoryScratchpad['validationStatus'] {
  return value === 'passed' || value === 'failed' || value === 'unknown';
}

function parseMemoryScratchpad(value: unknown): MemoryScratchpad | undefined {
  if (!isObjectRecord(value) || value['version'] !== 1) {
    return undefined;
  }

  const workflowSummary = getStringProperty(value, 'workflowSummary');
  const toolSequence = getStringArrayProperty(value, 'toolSequence');
  const touchedPaths = getStringArrayProperty(value, 'touchedPaths');
  const validationStatus = isMemoryValidationStatus(value['validationStatus'])
    ? value['validationStatus']
    : undefined;

  return {
    version: 1,
    ...(workflowSummary ? { workflowSummary } : {}),
    ...(toolSequence ? { toolSequence } : {}),
    ...(touchedPaths ? { touchedPaths } : {}),
    ...(validationStatus ? { validationStatus } : {}),
  };
}

function isMessageRecord(value: unknown): value is MessageRecord {
  return isStringProperty(value, 'id');
}

function isMessageRecordArray(
  value: unknown,
): value is ConversationRecord['messages'] {
  return Array.isArray(value) && value.every(isMessageRecord);
}

function isSupportedSessionFile(fileName: string): boolean {
  return (
    fileName.startsWith(SESSION_FILE_PREFIX) &&
    (fileName.endsWith('.json') || fileName.endsWith('.jsonl'))
  );
}

function getLoadedSessionTimestamp(session: LoadedSession): number {
  if (!session.lastUpdated) {
    return 0;
  }
  const parsed = Date.parse(session.lastUpdated);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseJsonSession(content: string): LoadedSession | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isObjectRecord(parsed) || !isMessageRecordArray(parsed['messages'])) {
      return null;
    }

    return {
      sessionId: getStringProperty(parsed, 'sessionId'),
      projectHash: getStringProperty(parsed, 'projectHash'),
      startTime: getStringProperty(parsed, 'startTime'),
      summary: getStringProperty(parsed, 'summary'),
      memoryScratchpad: parseMemoryScratchpad(parsed['memoryScratchpad']),
      lastUpdated: getStringProperty(parsed, 'lastUpdated'),
      directories: getStringArrayProperty(parsed, 'directories'),
      kind: getKindProperty(parsed),
      messages: parsed['messages'],
    };
  } catch {
    return null;
  }
}

function parseJsonlSession(content: string): LoadedSession | null {
  const messages: ConversationRecord['messages'] = [];
  const messageIndex = new Map<string, number>();
  let sessionId: string | undefined;
  let projectHash: string | undefined;
  let startTime: string | undefined;
  let summary: string | undefined;
  let memoryScratchpad: MemoryScratchpad | undefined;
  let lastUpdated: string | undefined;
  let directories: string[] | undefined;
  let kind: ConversationRecord['kind'] | undefined;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      return null;
    }

    if (!isObjectRecord(parsed)) {
      continue;
    }

    if (isStringProperty(parsed, '$rewindTo')) {
      const rewindTo = parsed['$rewindTo'];
      const rewindIndex = messageIndex.get(rewindTo);
      if (rewindIndex === undefined) {
        messages.length = 0;
        messageIndex.clear();
        continue;
      }

      messages.splice(rewindIndex);
      for (const [messageId, index] of [...messageIndex.entries()]) {
        if (index >= rewindIndex) {
          messageIndex.delete(messageId);
        }
      }
      continue;
    }

    if (isMessageRecord(parsed)) {
      const messageId = parsed['id'];
      const message = parsed;
      const existingIndex = messageIndex.get(messageId);
      if (existingIndex === undefined) {
        messageIndex.set(messageId, messages.length);
        messages.push(message);
      } else {
        messages[existingIndex] = message;
      }
      continue;
    }

    if ('$set' in parsed && isObjectRecord(parsed['$set'])) {
      const updates = parsed['$set'];
      sessionId = getStringProperty(updates, 'sessionId') ?? sessionId;
      projectHash = getStringProperty(updates, 'projectHash') ?? projectHash;
      startTime = getStringProperty(updates, 'startTime') ?? startTime;
      summary = getStringProperty(updates, 'summary') ?? summary;
      memoryScratchpad =
        parseMemoryScratchpad(updates['memoryScratchpad']) ?? memoryScratchpad;
      lastUpdated = getStringProperty(updates, 'lastUpdated') ?? lastUpdated;
      directories =
        getStringArrayProperty(updates, 'directories') ?? directories;
      kind = getKindProperty(updates) ?? kind;
      continue;
    }

    if (isMessageRecordArray(parsed['messages'])) {
      return {
        sessionId: getStringProperty(parsed, 'sessionId') ?? sessionId,
        projectHash: getStringProperty(parsed, 'projectHash') ?? projectHash,
        startTime: getStringProperty(parsed, 'startTime') ?? startTime,
        summary: getStringProperty(parsed, 'summary') ?? summary,
        memoryScratchpad:
          parseMemoryScratchpad(parsed['memoryScratchpad']) ?? memoryScratchpad,
        lastUpdated: getStringProperty(parsed, 'lastUpdated') ?? lastUpdated,
        directories:
          getStringArrayProperty(parsed, 'directories') ?? directories,
        kind: getKindProperty(parsed) ?? kind,
        messages: parsed['messages'],
      };
    }

    sessionId = getStringProperty(parsed, 'sessionId') ?? sessionId;
    projectHash = getStringProperty(parsed, 'projectHash') ?? projectHash;
    startTime = getStringProperty(parsed, 'startTime') ?? startTime;
    summary = getStringProperty(parsed, 'summary') ?? summary;
    memoryScratchpad =
      parseMemoryScratchpad(parsed['memoryScratchpad']) ?? memoryScratchpad;
    lastUpdated = getStringProperty(parsed, 'lastUpdated') ?? lastUpdated;
    directories = getStringArrayProperty(parsed, 'directories') ?? directories;
    kind = getKindProperty(parsed) ?? kind;
  }

  return {
    sessionId,
    projectHash,
    startTime,
    summary,
    memoryScratchpad,
    lastUpdated,
    directories,
    kind,
    messages,
  };
}

function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : 'unknown_tool';
}

function pushUniqueLimited(
  target: string[],
  value: string,
  limit: number,
): void {
  if (!value || target.includes(value) || target.length >= limit) {
    return;
  }
  target.push(value);
}

function normalizePathCandidate(
  candidate: string,
  projectRoot: string,
): string | null {
  const trimmed = candidate.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 240 ||
    trimmed.includes('\n') ||
    (!trimmed.includes('/') &&
      !trimmed.includes('\\') &&
      !trimmed.startsWith('.'))
  ) {
    return null;
  }

  let normalized = trimmed.replace(/\\/g, '/');
  if (path.isAbsolute(trimmed)) {
    const relative = path.relative(projectRoot, trimmed);
    normalized =
      relative && !relative.startsWith('..') && !path.isAbsolute(relative)
        ? relative.replace(/\\/g, '/')
        : path.basename(trimmed);
  }

  if (normalized.length > 120) {
    normalized = normalized.split('/').slice(-3).join('/');
  }

  return normalized.length > 0 ? normalized : null;
}

function collectPathsFromValue(
  value: unknown,
  projectRoot: string,
  paths: string[],
  keyHint?: string,
): void {
  if (paths.length >= MAX_SCRATCHPAD_PATHS) {
    return;
  }

  if (typeof value === 'string') {
    if (!keyHint || !PATH_KEY_REGEX.test(keyHint)) {
      return;
    }

    const normalized = normalizePathCandidate(value, projectRoot);
    if (normalized) {
      pushUniqueLimited(paths, normalized, MAX_SCRATCHPAD_PATHS);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPathsFromValue(item, projectRoot, paths, keyHint);
      if (paths.length >= MAX_SCRATCHPAD_PATHS) {
        return;
      }
    }
    return;
  }

  if (!isObjectRecord(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    collectPathsFromValue(nestedValue, projectRoot, paths, key);
    if (paths.length >= MAX_SCRATCHPAD_PATHS) {
      return;
    }
  }
}

function getToolCallCommand(toolCall: ToolCallRecord): string | undefined {
  for (const key of ['command', 'cmd', 'script']) {
    const value = toolCall.args[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function getValidationStatusForToolCall(
  toolCall: ToolCallRecord,
): MemoryScratchpad['validationStatus'] | undefined {
  const command = getToolCallCommand(toolCall);
  const isValidationTool =
    VALIDATION_TOOL_REGEX.test(toolCall.name) ||
    (command ? VALIDATION_COMMAND_REGEX.test(command) : false);
  if (!isValidationTool) {
    return undefined;
  }

  if (toolCall.status === 'success') {
    return 'passed';
  }
  if (toolCall.status === 'error' || toolCall.status === 'cancelled') {
    return 'failed';
  }
  return 'unknown';
}

function buildWorkflowSummary(
  toolSequence: string[],
  touchedPaths: string[],
  validationStatus?: MemoryScratchpad['validationStatus'],
): string | undefined {
  const parts: string[] = [];

  if (toolSequence.length > 0) {
    parts.push(toolSequence.join(' -> '));
  }
  if (touchedPaths.length > 0) {
    parts.push(`paths ${touchedPaths.join(', ')}`);
  }
  if (validationStatus === 'passed') {
    parts.push('validated');
  } else if (validationStatus === 'failed') {
    parts.push('validation failed');
  }

  if (parts.length === 0) {
    return undefined;
  }

  const summary = parts.join(' | ');
  return summary.length > MAX_WORKFLOW_SUMMARY_LENGTH
    ? `${summary.slice(0, MAX_WORKFLOW_SUMMARY_LENGTH - 3)}...`
    : summary;
}

function buildMemoryScratchpad(
  messages: ConversationRecord['messages'],
  projectRoot: string,
): MemoryScratchpad {
  const toolSequence: string[] = [];
  const touchedPaths: string[] = [];
  let validationStatus: MemoryScratchpad['validationStatus'];

  for (const message of messages) {
    if (message.type !== 'gemini' || !message.toolCalls) {
      continue;
    }

    for (const toolCall of message.toolCalls) {
      pushUniqueLimited(
        toolSequence,
        normalizeToolName(toolCall.name),
        MAX_SCRATCHPAD_TOOLS,
      );
      collectPathsFromValue(toolCall.args, projectRoot, touchedPaths);

      const toolValidationStatus = getValidationStatusForToolCall(toolCall);
      if (toolValidationStatus === 'failed') {
        validationStatus = 'failed';
      } else if (
        toolValidationStatus === 'passed' &&
        validationStatus !== 'failed'
      ) {
        validationStatus = 'passed';
      } else if (!validationStatus && toolValidationStatus === 'unknown') {
        validationStatus = 'unknown';
      }
    }
  }

  const workflowSummary = buildWorkflowSummary(
    toolSequence,
    touchedPaths,
    validationStatus,
  );

  return {
    version: 1,
    ...(workflowSummary ? { workflowSummary } : {}),
    ...(toolSequence.length > 0 ? { toolSequence } : {}),
    ...(touchedPaths.length > 0 ? { touchedPaths } : {}),
    ...(validationStatus ? { validationStatus } : {}),
  };
}

function hasSessionSummaryMetadata(session: LoadedSession): boolean {
  return Boolean(session.summary && session.memoryScratchpad);
}

async function loadSessionForSummary(
  sessionPath: string,
): Promise<LoadedSession | null> {
  const content = await fs.readFile(sessionPath, 'utf-8');
  return sessionPath.endsWith('.jsonl')
    ? parseJsonlSession(content)
    : parseJsonSession(content);
}

/**
 * Generates and saves a summary for a session file.
 */
async function generateAndSaveSummary(
  config: Config,
  sessionPath: string,
): Promise<void> {
  const conversation = await loadSessionForSummary(sessionPath);
  if (!conversation) {
    debugLogger.debug(`[SessionSummary] Could not read session ${sessionPath}`);
    return;
  }

  // Skip if both summary metadata fields already exist.
  if (hasSessionSummaryMetadata(conversation)) {
    debugLogger.debug(
      `[SessionSummary] Summary metadata already exists for ${sessionPath}, skipping`,
    );
    return;
  }

  // Skip if no messages
  if (conversation.messages.length === 0) {
    debugLogger.debug(
      `[SessionSummary] No messages to summarize in ${sessionPath}`,
    );
    return;
  }

  let summary = conversation.summary;
  if (!summary) {
    const contentGenerator = config.getContentGenerator();
    if (!contentGenerator) {
      debugLogger.debug(
        '[SessionSummary] Content generator not available, skipping summary generation',
      );
    } else {
      const baseLlmClient = new BaseLlmClient(contentGenerator, config);
      const summaryService = new SessionSummaryService(baseLlmClient);
      summary =
        (await summaryService.generateSummary({
          messages: conversation.messages,
        })) ?? undefined;

      if (!summary) {
        debugLogger.warn(
          `[SessionSummary] Failed to generate summary for ${sessionPath}`,
        );
      }
    }
  }

  const memoryScratchpad =
    conversation.memoryScratchpad ??
    buildMemoryScratchpad(conversation.messages, config.getProjectRoot());

  // Re-read the file before writing to handle race conditions
  const freshConversation = await loadSessionForSummary(sessionPath);
  if (!freshConversation) {
    debugLogger.debug(`[SessionSummary] Could not re-read ${sessionPath}`);
    return;
  }

  if (hasSessionSummaryMetadata(freshConversation)) {
    debugLogger.debug(
      `[SessionSummary] Summary metadata was added by another process for ${sessionPath}`,
    );
    return;
  }

  const metadataUpdate: Partial<ConversationRecord> = {};
  if (!freshConversation.summary && summary) {
    metadataUpdate.summary = summary;
  }
  if (!freshConversation.memoryScratchpad) {
    metadataUpdate.memoryScratchpad = memoryScratchpad;
  }

  if (Object.keys(metadataUpdate).length === 0) {
    return;
  }

  const lastUpdated = new Date().toISOString();
  metadataUpdate.lastUpdated = lastUpdated;
  if (sessionPath.endsWith('.jsonl')) {
    await fs.appendFile(
      sessionPath,
      `${JSON.stringify({ $set: metadataUpdate })}\n`,
    );
  } else {
    await fs.writeFile(
      sessionPath,
      JSON.stringify(
        {
          ...freshConversation,
          ...metadataUpdate,
          lastUpdated,
        },
        null,
        2,
      ),
    );
  }
  debugLogger.debug(
    `[SessionSummary] Saved summary metadata for ${sessionPath}${summary ? `: "${summary}"` : ''}`,
  );
}

/**
 * Finds the most recently created session that needs summary metadata.
 * Returns the path if it needs a summary or scratchpad, null otherwise.
 */
export async function getPreviousSession(
  config: Config,
): Promise<string | null> {
  try {
    const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');

    // Check if chats directory exists
    try {
      await fs.access(chatsDir);
    } catch {
      debugLogger.debug('[SessionSummary] No chats directory found');
      return null;
    }

    // List session files
    const allFiles = await fs.readdir(chatsDir);
    const sessionFiles = allFiles.filter(isSupportedSessionFile);

    if (sessionFiles.length === 0) {
      debugLogger.debug('[SessionSummary] No session files found');
      return null;
    }

    const sessions: Array<{ filePath: string; conversation: LoadedSession }> =
      [];
    for (const sessionFile of sessionFiles) {
      const filePath = path.join(chatsDir, sessionFile);
      try {
        const conversation = await loadSessionForSummary(filePath);
        if (conversation) {
          sessions.push({ filePath, conversation });
        }
      } catch {
        // Ignore unreadable session files
      }
    }

    if (sessions.length === 0) {
      debugLogger.debug('[SessionSummary] Could not read most recent session');
      return null;
    }

    sessions.sort((a, b) => {
      const timestampDelta =
        getLoadedSessionTimestamp(b.conversation) -
        getLoadedSessionTimestamp(a.conversation);
      if (timestampDelta !== 0) {
        return timestampDelta;
      }
      return path.basename(b.filePath).localeCompare(path.basename(a.filePath));
    });

    const { filePath, conversation } = sessions[0];
    if (hasSessionSummaryMetadata(conversation)) {
      debugLogger.debug(
        '[SessionSummary] Most recent session already has summary metadata',
      );
      return null;
    }

    // Only generate summaries for sessions with more than 1 user message
    const userMessageCount = conversation.messages.filter(
      (message) => message.type === 'user',
    ).length;
    if (userMessageCount <= MIN_MESSAGES_FOR_SUMMARY) {
      debugLogger.debug(
        `[SessionSummary] Most recent session has ${userMessageCount} user message(s), skipping (need more than ${MIN_MESSAGES_FOR_SUMMARY})`,
      );
      return null;
    }

    return filePath;
  } catch (error) {
    debugLogger.debug(
      `[SessionSummary] Error finding previous session: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Generates summary for the previous session if it lacks one.
 * This is designed to be called fire-and-forget on startup.
 */
export async function generateSummary(config: Config): Promise<void> {
  try {
    const sessionPath = await getPreviousSession(config);
    if (sessionPath) {
      await generateAndSaveSummary(config, sessionPath);
    }
  } catch (error) {
    // Log but don't throw - we want graceful degradation
    debugLogger.warn(
      `[SessionSummary] Error generating summary: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
