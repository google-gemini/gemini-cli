/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PartListUnion, PartUnion } from '@google/genai';
import { Config, getErrorMessage } from '@google/gemini-cli-core';
import {
  HistoryItem,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';

interface HandleAtCommandParams {
  query: string;
  config: Config;
  addItem: UseHistoryManagerReturn['addItem'];
  onDebugMessage: (message: string) => void;
  messageId: number;
  signal: AbortSignal;
}

interface HandleAtCommandResult {
  processedQuery: PartListUnion | null;
  shouldProceed: boolean;
}

/**
 * Processes user input potentially containing one or more '@<path>' commands.
 * If found, it attempts to read the specified files/directories using the
 * 'read_many_files' tool. The user query is modified to include resolved paths,
 * and the content of the files is appended in a structured block.
 *
 * @returns An object indicating whether the main hook should proceed with an
 *          LLM call and the processed query parts (including file content).
 */
export async function handleAtCommand({
  query,
  config,
  addItem,
  onDebugMessage,
  messageId: userMessageTimestamp,
  signal,
}: HandleAtCommandParams): Promise<HandleAtCommandResult> {
  // This regex finds all occurrences of '@' followed by a path.
  // A path is a sequence of non-whitespace characters, or any character
  // escaped with a backslash.
  // It uses a positive lookbehind `(?<=\s)` to ensure the '@' is preceded
  // by whitespace, or `^` to catch commands at the start of the string.
  const atCommandRegex = /(^|(?<=\s))@(?:\\ |[^\s])+/g;
  const atPathCommandParts = query.match(atCommandRegex) || [];

  if (atPathCommandParts.length === 0) {
    addItem({ type: 'user', text: query }, userMessageTimestamp);
    return { processedQuery: [{ text: query }], shouldProceed: true };
  }

  addItem({ type: 'user', text: query }, userMessageTimestamp);

  const toolRegistry = await config.getToolRegistry();
  const readManyFilesTool = toolRegistry.getTool('read_many_files');

  if (!readManyFilesTool) {
    addItem(
      { type: 'error', text: 'Error: read_many_files tool not found.' },
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  const processedQueryParts: PartUnion[] = [{ text: query }];

  const toolArgs = {
    paths: atPathCommandParts.map((part) => part.substring(1)),
  };
  let toolCallDisplay: IndividualToolCallDisplay;

  try {
    const result = await readManyFilesTool.execute(toolArgs, signal);
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Success,
      resultDisplay:
        result.returnDisplay ||
        `Successfully read: ${atPathCommandParts.join(', ')}`,
      confirmationDetails: undefined,
    };

    if (Array.isArray(result.llmContent)) {
      const fileContentRegex = /^--- (.*?) ---\n\n([\s\S]*?)\n\n$/;
      processedQueryParts.push({
        text: '\n--- Content from referenced files ---',
      });
      for (const part of result.llmContent) {
        if (typeof part === 'string') {
          const match = fileContentRegex.exec(part);
          if (match) {
            const filePathSpecInContent = match[1]; // This is a resolved pathSpec
            const fileActualContent = match[2].trim();
            processedQueryParts.push({
              text: `\nContent from @${filePathSpecInContent}:\n`,
            });
            processedQueryParts.push({ text: fileActualContent });
          } else {
            processedQueryParts.push({ text: part });
          }
        } else {
          // part is a Part object.
          processedQueryParts.push(part);
        }
      }
      processedQueryParts.push({ text: '\n--- End of content ---' });
    } else {
      onDebugMessage(
        'read_many_files tool returned no content or empty content.',
      );
    }

    addItem(
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      userMessageTimestamp,
    );
    return { processedQuery: processedQueryParts, shouldProceed: true };
  } catch (error: unknown) {
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Error,
      resultDisplay: `Error reading files (${atPathCommandParts.join(', ')}): ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };
    addItem(
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }
}
