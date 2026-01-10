/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';
import fs from 'node:fs/promises';
import * as Diff from 'diff';
import {
  coreEvents,
  debugLogger,
  getFileDiffFromResultDisplay,
  computeAddedAndRemovedLines,
} from '@google/gemini-cli-core';

export interface FileChangeDetail {
  fileName: string;
  diff: string;
}

export interface FileChangeStats {
  addedLines: number;
  removedLines: number;
  fileCount: number;
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
        const fileDiff = getFileDiffFromResultDisplay(toolCall.resultDisplay);
        if (fileDiff) {
          hasEdits = true;
          const stats = fileDiff.diffStat;
          const calculations = computeAddedAndRemovedLines(stats);
          addedLines += calculations.addedLines;
          removedLines += calculations.removedLines;

          files.add(fileDiff.fileName);
        }
      }
    }
  }

  if (!hasEdits) return null;

  return {
    addedLines,
    removedLines,
    fileCount: files.size,
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
        const fileDiff = getFileDiffFromResultDisplay(toolCall.resultDisplay);
        if (fileDiff) {
          hasEdits = true;
          const stats = fileDiff.diffStat;
          const calculations = computeAddedAndRemovedLines(stats);
          addedLines += calculations.addedLines;
          removedLines += calculations.removedLines;
          files.add(fileDiff.fileName);
          details.push({
            fileName: fileDiff.fileName,
            diff: fileDiff.fileDiff,
          });
        }
      }
    }
  }

  if (!hasEdits) return null;

  return {
    addedLines,
    removedLines,
    fileCount: files.size,
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

  if (messageIndex === -1) {
    debugLogger.error('Requested message to rewind to was not found ');
    return;
  }

  // Iterate backwards from the end to the message being rewound (exclusive of the messageId itself)
  for (let i = conversation.messages.length - 1; i > messageIndex; i--) {
    const msg = conversation.messages[i];
    if (msg.type === 'gemini' && msg.toolCalls) {
      for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
        const toolCall = msg.toolCalls[j];
        const fileDiff = getFileDiffFromResultDisplay(toolCall.resultDisplay);
        if (fileDiff) {
          const { filePath, fileName, newContent, originalContent, isNewFile } =
            fileDiff;
          try {
            let currentContent: string | null = null;
            try {
              currentContent = await fs.readFile(filePath, 'utf8');
            } catch (e) {
              const error = e as Error;
              if ('code' in error && error.code === 'ENOENT') {
                // File does not exist, which is fine in some revert scenarios.
                debugLogger.debug(
                  `File ${fileName} not found during revert, proceeding as it may be a new file deletion.`,
                );
              } else {
                // Other read errors are unexpected.
                coreEvents.emitFeedback(
                  'error',
                  `Error reading ${fileName} during revert: ${error.message}`,
                  e,
                );
                // Continue to next tool call
                return;
              }
            }
            // 1. Exact Match: Safe to revert directly
            if (currentContent === newContent) {
              if (!isNewFile) {
                await fs.writeFile(filePath, originalContent ?? '');
              } else {
                // Original content was null (new file), so we delete the file
                await fs.unlink(filePath);
              }
            }
            // 2. Mismatch: Attempt Smart Revert (Patch)
            else if (currentContent !== null) {
              const originalText = originalContent ?? '';

              // Create a patch that transforms Agent -> Original
              const undoPatch = Diff.createPatch(
                fileName,
                newContent,
                originalText,
              );

              // Apply that patch to the Current content
              const patchedContent = Diff.applyPatch(currentContent, undoPatch);

              if (typeof patchedContent === 'string') {
                if (patchedContent === '' && isNewFile) {
                  // If the result is empty and the file didn't exist originally, delete it
                  await fs.unlink(filePath);
                } else {
                  await fs.writeFile(filePath, patchedContent);
                }
              } else {
                // Patch failed
                coreEvents.emitFeedback(
                  'warning',
                  `Smart revert for ${fileName} failed. The file may have been modified in a way that conflicts with the undo operation.`,
                );
              }
            } else {
              // File was deleted by the user, but we expected content.
              // This can happen if a file created by the agent is deleted before rewind.
              coreEvents.emitFeedback(
                'warning',
                `Cannot revert changes for ${fileName} because it was not found on disk. This is expected if a file created by the agent was deleted before rewind`,
              );
            }
          } catch (e) {
            coreEvents.emitFeedback(
              'error',
              `An unexpected error occurred while reverting ${fileName}.`,
              e,
            );
          }
        }
      }
    }
  }
}
