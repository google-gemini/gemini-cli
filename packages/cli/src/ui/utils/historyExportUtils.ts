/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { Content } from '@google/genai';
import type {
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';

/**
 * Serializes chat history to a Markdown string.
 */
export function serializeHistoryToMarkdown(
  history: readonly Content[],
): string {
  return history
    .map((item) => {
      const text =
        item.parts
          ?.map((part) => {
            if (part.text) {
              return part.text;
            }
            if (part.functionCall) {
              return (
                `**Tool Command**:\n` +
                '```json\n' +
                JSON.stringify(part.functionCall, null, 2) +
                '\n```'
              );
            }
            if (part.functionResponse) {
              return (
                `**Tool Response**:\n` +
                '```json\n' +
                JSON.stringify(part.functionResponse, null, 2) +
                '\n```'
              );
            }
            return '';
          })
          .join('') || '';
      const roleIcon = item.role === 'user' ? '🧑‍💻' : '✨';
      return `## ${(item.role || 'model').toUpperCase()} ${roleIcon}\n\n${text}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Options for exporting chat history.
 */
export interface ExportHistoryOptions {
  /** The standard history array used for model requests. */
  history: readonly Content[];
  /** The file path to export to. */
  filePath: string;
  /** Optional subagent trajectories to include. */
  trajectories?: Record<string, ConversationRecord>;
  /**
   * Optional full message records which contain metadata like agentId for tool calls,
   * providing the link between history and trajectories.
   */
  messages?: MessageRecord[];
}

/**
 * Exports chat history to a file (JSON or Markdown).
 */
export async function exportHistoryToFile(
  options: ExportHistoryOptions,
): Promise<void> {
  const { history, filePath, trajectories, messages } = options;
  const extension = path.extname(filePath).toLowerCase();

  let content: string;
  if (extension === '.json') {
    if (trajectories && Object.keys(trajectories).length > 0) {
      content = JSON.stringify({ history, messages, trajectories }, null, 2);
    } else {
      content = JSON.stringify(history, null, 2);
    }
  } else if (extension === '.md') {
    content = serializeHistoryToMarkdown(history);
  } else {
    throw new Error(
      `Unsupported file extension: ${extension}. Use .json or .md.`,
    );
  }

  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(filePath, content, 'utf-8');
}
