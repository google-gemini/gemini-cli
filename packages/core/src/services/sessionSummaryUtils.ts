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
  loadConversationRecord,
  type ConversationRecord,
  type MemoryScratchpad,
  type ToolCallRecord,
} from './chatRecordingService.js';
import { CoreToolCallStatus } from '../scheduler/types.js';
import { SHELL_TOOL_NAME } from '../tools/definitions/base-declarations.js';
import { summarizeShellCommandForScratchpad } from './sessionScratchpadUtils.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES_FOR_SUMMARY = 1;
const MAX_SCRATCHPAD_TOOLS = 6;
const MAX_SCRATCHPAD_PATHS = 4;
const MAX_SCRATCHPAD_PATH_DEPTH = 6;
const MAX_WORKFLOW_SUMMARY_LENGTH = 160;
const VALIDATION_COMMAND_REGEX =
  /\b(test|tests|vitest|jest|pytest|cargo test|npm test|pnpm test|yarn test|bun test|lint|build|check|typecheck)\b/i;
const PATH_KEY_REGEX = /(path|file|dir|directory|cwd|root)/i;
const VALIDATION_TOOL_REGEX = /\b(test|lint|build|check|typecheck)\b/i;

type LoadedSession = ConversationRecord & {
  messageCount?: number;
  userMessageCount?: number;
  memoryScratchpadIsStale?: boolean;
};

interface SessionFileCandidate {
  filePath: string;
  mtimeMs: number;
}

function isSupportedSessionFile(fileName: string): boolean {
  return (
    fileName.startsWith(SESSION_FILE_PREFIX) &&
    (fileName.endsWith('.json') || fileName.endsWith('.jsonl'))
  );
}

async function listSessionFileCandidates(
  chatsDir: string,
): Promise<SessionFileCandidate[]> {
  const allFiles = await fs.readdir(chatsDir);
  const candidates: SessionFileCandidate[] = [];

  for (const fileName of allFiles) {
    if (!isSupportedSessionFile(fileName)) continue;

    const filePath = path.join(chatsDir, fileName);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      candidates.push({ filePath, mtimeMs: stat.mtimeMs });
    } catch {
      // Skip files that disappeared between readdir and stat.
    }
  }

  candidates.sort((a, b) => {
    const mtimeDelta = b.mtimeMs - a.mtimeMs;
    if (mtimeDelta !== 0) {
      return mtimeDelta;
    }

    return path.basename(b.filePath).localeCompare(path.basename(a.filePath));
  });

  return candidates;
}

function getSessionTimestampMs(session: LoadedSession): number {
  if (!session.lastUpdated) return 0;
  const parsed = Date.parse(session.lastUpdated);
  return Number.isNaN(parsed) ? 0 : parsed;
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
      !trimmed.startsWith('.') &&
      path.extname(trimmed).length === 0)
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
  depth = 0,
): void {
  if (
    paths.length >= MAX_SCRATCHPAD_PATHS ||
    depth > MAX_SCRATCHPAD_PATH_DEPTH
  ) {
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
      collectPathsFromValue(item, projectRoot, paths, keyHint, depth + 1);
      if (paths.length >= MAX_SCRATCHPAD_PATHS) {
        return;
      }
    }
    return;
  }

  if (typeof value !== 'object' || value === null) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    collectPathsFromValue(nestedValue, projectRoot, paths, key, depth + 1);
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

function getToolSequenceEntry(toolCall: ToolCallRecord): string {
  const toolName = normalizeToolName(toolCall.name);
  if (toolName !== SHELL_TOOL_NAME) {
    return toolName;
  }

  const command = getToolCallCommand(toolCall);
  const commandSummary = command
    ? summarizeShellCommandForScratchpad(command)
    : undefined;
  return commandSummary ? `${toolName}: ${commandSummary}` : toolName;
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

  if (toolCall.status === CoreToolCallStatus.Success) {
    return 'passed';
  }
  if (
    toolCall.status === CoreToolCallStatus.Error ||
    toolCall.status === CoreToolCallStatus.Cancelled
  ) {
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
  if (summary.length === 0) {
    return undefined;
  }
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
        getToolSequenceEntry(toolCall),
        MAX_SCRATCHPAD_TOOLS,
      );
      collectPathsFromValue(toolCall.args, projectRoot, touchedPaths);

      const toolValidationStatus = getValidationStatusForToolCall(toolCall);
      if (toolValidationStatus) {
        validationStatus = toolValidationStatus;
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

function hasCurrentMemoryScratchpad(session: LoadedSession): boolean {
  return Boolean(
    session.memoryScratchpad && session.memoryScratchpadIsStale !== true,
  );
}

function hasSessionSummaryMetadata(session: LoadedSession): boolean {
  return hasCurrentMemoryScratchpad(session);
}

function getLoadedMessageCount(session: LoadedSession): number {
  return session.messageCount ?? session.messages.length;
}

/**
 * Generates and saves a summary for a session file.
 */
async function generateAndSaveSummary(
  config: Config,
  sessionPath: string,
): Promise<void> {
  const conversation = await loadConversationRecord(sessionPath);
  if (!conversation) {
    debugLogger.debug(`[SessionSummary] Could not read session ${sessionPath}`);
    return;
  }

  // Skip if workflow metadata already exists; memory extraction can use the
  // scratchpad even when summary generation was unavailable.
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

  let scratchpadSourceConversation = conversation;

  // Re-read the file before writing to handle race conditions. For JSONL we
  // only need the metadata; for legacy JSON we need the full record so we can
  // round-trip the messages back to disk.
  const isJsonl = sessionPath.endsWith('.jsonl');
  const freshConversation = await loadConversationRecord(sessionPath, {
    metadataOnly: isJsonl,
  });
  if (!freshConversation) {
    debugLogger.debug(`[SessionSummary] Could not re-read ${sessionPath}`);
    return;
  }

  // Check if summary metadata was added by another process
  if (hasSessionSummaryMetadata(freshConversation)) {
    debugLogger.debug(
      `[SessionSummary] Summary metadata was added by another process for ${sessionPath}`,
    );
    return;
  }

  if (
    !hasCurrentMemoryScratchpad(freshConversation) &&
    (getLoadedMessageCount(freshConversation) !==
      getLoadedMessageCount(conversation) ||
      freshConversation.lastUpdated !== conversation.lastUpdated)
  ) {
    const latestConversation = await loadConversationRecord(sessionPath);
    if (!latestConversation) {
      debugLogger.debug(`[SessionSummary] Could not re-read ${sessionPath}`);
      return;
    }
    if (hasSessionSummaryMetadata(latestConversation)) {
      debugLogger.debug(
        `[SessionSummary] Summary metadata was added by another process for ${sessionPath}`,
      );
      return;
    }
    scratchpadSourceConversation = latestConversation;
  }

  const metadataUpdate: Partial<ConversationRecord> = {};
  if (!freshConversation.summary && summary) {
    metadataUpdate.summary = summary;
  }
  if (!hasCurrentMemoryScratchpad(freshConversation)) {
    metadataUpdate.memoryScratchpad = buildMemoryScratchpad(
      scratchpadSourceConversation.messages,
      config.getProjectRoot(),
    );
  }

  if (Object.keys(metadataUpdate).length === 0) {
    return;
  }

  if (isJsonl) {
    await fs.appendFile(
      sessionPath,
      `${JSON.stringify({ $set: metadataUpdate })}\n`,
    );
  } else {
    const lastUpdated = freshConversation.lastUpdated;
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
 * Finds the most recently updated previous session that still needs workflow metadata.
 * Returns the path if it needs a scratchpad, null otherwise.
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

    const sessionFiles = await listSessionFileCandidates(chatsDir);
    if (sessionFiles.length === 0) {
      debugLogger.debug('[SessionSummary] No session files found');
      return null;
    }

    let bestPreviousSession: {
      filePath: string;
      conversation: LoadedSession;
    } | null = null;

    for (const { filePath, mtimeMs } of sessionFiles) {
      const bestTimestamp = bestPreviousSession
        ? getSessionTimestampMs(bestPreviousSession.conversation)
        : null;
      if (
        bestPreviousSession &&
        bestTimestamp !== null &&
        bestTimestamp > 0 &&
        mtimeMs < bestTimestamp
      ) {
        break;
      }

      try {
        const conversation = await loadConversationRecord(filePath, {
          metadataOnly: true,
        });
        if (!conversation) continue;
        if (conversation.sessionId === config.getSessionId()) continue;
        if (conversation.kind === 'subagent') continue;
        if (hasSessionSummaryMetadata(conversation)) continue;

        // Only generate summaries for sessions with more than 1 user message.
        // `loadConversationRecord` populates `userMessageCount` in metadataOnly
        // mode; fall back to scanning messages for the legacy fallback path.
        const userMessageCount =
          conversation.userMessageCount ??
          conversation.messages.filter((message) => message.type === 'user')
            .length;
        if (userMessageCount <= MIN_MESSAGES_FOR_SUMMARY) {
          continue;
        }

        if (
          !bestPreviousSession ||
          getSessionTimestampMs(conversation) >
            getSessionTimestampMs(bestPreviousSession.conversation) ||
          (getSessionTimestampMs(conversation) ===
            getSessionTimestampMs(bestPreviousSession.conversation) &&
            path
              .basename(filePath)
              .localeCompare(path.basename(bestPreviousSession.filePath)) > 0)
        ) {
          bestPreviousSession = { filePath, conversation };
        }
      } catch {
        // Ignore unreadable session files
      }
    }

    if (!bestPreviousSession) {
      debugLogger.debug(
        '[SessionSummary] No previous session needs summary generation',
      );
      return null;
    }

    return bestPreviousSession.filePath;
  } catch (error) {
    debugLogger.debug(
      `[SessionSummary] Error finding previous session: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Generates summary metadata for the previous session if it lacks a scratchpad.
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
