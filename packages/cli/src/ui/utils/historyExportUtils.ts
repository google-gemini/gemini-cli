/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { Content } from '@google/genai';

/**
 * Serializes chat history to a Markdown string.
 */
export function serializeHistoryToMarkdown(history: Content[]): string {
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
  history: Content[];
  filePath: string;
}

/**
 * Exports chat history to a file (JSON or Markdown).
 */
export async function exportHistoryToFile(
  options: ExportHistoryOptions,
): Promise<void> {
  const { history, filePath } = options;
  const extension = path.extname(filePath).toLowerCase();

  let content: string;
  if (extension === '.json') {
    content = JSON.stringify(history, null, 2);
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
