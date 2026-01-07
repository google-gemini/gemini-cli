/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  FileDiff,
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';
import fs from 'node:fs/promises';
import * as Diff from 'diff';
import { coreEvents } from '@google/gemini-cli-core';
export interface FileChangeDetail {
  fileName: string;
  diff: string;
}

export interface FileChangeStats {
  addedLines: number;
  removedLines: number;
  fileCount: number;
  firstFileName: string;
  details?: FileChangeDetail[];
}

/**
 * Calculates file change statistics for a single turn.
 * A turn is defined as the sequence of messages starting after the given user message
 * and continuing until the next user message or the end of the conversation.
 *
 * @param conversation The full conversation record.
 * @param userMessage The starting user message for the turn.
 * @returns Statistics about lines added/removed and files touched, or null if no edits occurred.
 */
export function calculateTurnStats(
  conversation: ConversationRecord,
  userMessage: MessageRecord,
): FileChangeStats | null {
  const msgIndex = conversation.messages.indexOf(userMessage);
  if (msgIndex === -1) return null;

  let addedLines = 0;
  let removedLines = 0;
  const files = new Set<string>();
  let hasEdits = false;

  // Look ahead until the next user message (single turn)
  for (let i = msgIndex + 1; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i];
    if (msg.type === 'user') break; // Stop at next user message

    if (msg.type === 'gemini' && msg.toolCalls) {
      for (const toolCall of msg.toolCalls) {
        const result = toolCall.resultDisplay;
        if (
          result &&
          typeof result === 'object' &&
          'diffStat' in result &&
          result.diffStat
        ) {
          hasEdits = true;
          const stats = result.diffStat;
          addedLines += stats.model_added_lines + stats.user_added_lines;
          removedLines += stats.model_removed_lines + stats.user_removed_lines;
          if ('fileName' in result && typeof result.fileName === 'string') {
            files.add(result.fileName);
          }
        }
      }
    }
  }

  if (!hasEdits) return null;

  return {
    addedLines,
    removedLines,
    fileCount: files.size,
    firstFileName: files.values().next().value as string,
  };
}

/**
 * Calculates the cumulative file change statistics from a specific message
 * to the end of the conversation.
 *
 * @param conversation The full conversation record.
 * @param userMessage The message to start calculating impact from (exclusive).
 * @returns Aggregate statistics about lines added/removed and files touched, or null if no edits occurred.
 */
export function calculateRewindImpact(
  conversation: ConversationRecord,
  userMessage: MessageRecord,
): FileChangeStats | null {
  const msgIndex = conversation.messages.indexOf(userMessage);
  if (msgIndex === -1) return null;

  let addedLines = 0;
  let removedLines = 0;
  const files = new Set<string>();
  const details: FileChangeDetail[] = [];
  let hasEdits = false;

  // Look ahead to the end of conversation (cumulative)
  for (let i = msgIndex + 1; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i];
    // Do NOT break on user message - we want total impact

    if (msg.type === 'gemini' && msg.toolCalls) {
      for (const toolCall of msg.toolCalls) {
        const result = toolCall.resultDisplay;
        if (
          result &&
          typeof result === 'object' &&
          'diffStat' in result &&
          result.diffStat
        ) {
          hasEdits = true;
          const stats = result.diffStat;
          addedLines += stats.model_added_lines + stats.user_added_lines;
          removedLines += stats.model_removed_lines + stats.user_removed_lines;
          if ('fileName' in result && typeof result.fileName === 'string') {
            files.add(result.fileName);
            if ('fileDiff' in result && typeof result.fileDiff === 'string') {
              details.push({
                fileName: result.fileName,
                diff: result.fileDiff,
              });
            }
          }
        }
      }
    }
  }

  if (!hasEdits) return null;

  return {
    addedLines,
    removedLines,
    fileCount: files.size,
    firstFileName: files.values().next().value as string,
    details,
  };
}

/**
 * Reverts file changes made by the model from the end of the conversation
 * back to a specific target message.
 *
 * It iterates backwards through the conversation history and attempts to undo
 * any file modifications. It handles cases where the user might have subsequently
 * modified the file by attempting a smart patch (using the `diff` library).
 *
 * @param conversation The full conversation record.
 * @param targetMessageId The ID of the message to revert back to. Changes *after* this message will be undone.
 */
export async function revertFileChanges(
  conversation: ConversationRecord,
  targetMessageId: string,
): Promise<void> {
  const messageIndex = conversation.messages.findIndex(
    (m) => m.id === targetMessageId,
  );

  if (messageIndex === -1) return;

  // Iterate backwards from the end to the message being rewound (exclusive of the messageId itself)
  for (let i = conversation.messages.length - 1; i > messageIndex; i--) {
    const msg = conversation.messages[i];
    if (msg.type === 'gemini' && msg.toolCalls) {
      for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
        const toolCall = msg.toolCalls[j];
        const result = toolCall.resultDisplay as FileDiff | undefined;

        if (
          result &&
          typeof result === 'object' &&
          'diffStat' in result &&
          'fileName' in result &&
          'newContent' in result &&
          'originalContent' in result
        ) {
          const filePath = result.filePath;

          try {
            let currentContent: string | null = null;
            try {
              currentContent = await fs.readFile(filePath, 'utf8');
            } catch (e) {
              // File might not exist
              coreEvents.emitFeedback(
                'error',
                `File does not exist : ${e instanceof Error ? e.message : String(e)}`,
                e,
              );
            }

            // 1. Exact Match: Safe to revert directly
            if (
              currentContent === result.newContent ||
              (currentContent === null && result.newContent === '')
            ) {
              if (!result.isNewFile) {
                await fs.writeFile(filePath, result.originalContent ?? '');
              } else {
                // Original content was null (new file), so we delete the file
                await fs.unlink(filePath);
              }
            }
            // 2. Mismatch: Attempt Smart Revert (Patch)
            else if (currentContent !== null) {
              const originalText = result.originalContent ?? '';
              const agentText = result.newContent;

              // Create a patch that transforms Agent -> Original
              const undoPatch = Diff.createPatch(
                result.fileName,
                agentText,
                originalText,
              );

              // Apply that patch to the Current content
              const patchedContent = Diff.applyPatch(currentContent, undoPatch);

              if (typeof patchedContent === 'string') {
                // Patch succeeded!
                if (patchedContent === '' && result.isNewFile) {
                  // If the result is empty and the file didn't exist originally, delete it
                  await fs.unlink(filePath);
                } else {
                  await fs.writeFile(filePath, patchedContent);
                }
              } else {
                // Patch failed
                coreEvents.emitFeedback(
                  'warning',
                  `Failed to revert changes for ${result.fileName}: user has modified lines that model has modified`,
                );
              }
            } else {
              // File deleted by user, but we expected content.
              coreEvents.emitFeedback(
                'warning',
                `File ${result.fileName} missing, cannot revert.`,
              );
            }
          } catch (e) {
            coreEvents.emitFeedback(
              'error',
              `Error reverting ${result.fileName}:`,
              e,
            );
          }
        }
      }
    }
  }
}
