/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PartListUnion, PartUnion } from '@google/genai';
import {
  Config,
  getErrorMessage,
  isNodeError,
  unescapePath,
} from '@gemini-code/server';
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
 * Parses a query string to find the first '@<path>' command,
 * handling \ escaped spaces within the path.
 */
function parseAtCommand(
  query: string,
): { textBefore: string; atPath: string; textAfter: string } | null {
  let atIndex = -1;
  for (let i = 0; i < query.length; i++) {
    if (query[i] === '@' && (i === 0 || query[i - 1] !== '\\')) {
      atIndex = i;
      break;
    }
  }

  if (atIndex === -1) {
    return null;
  }

  const textBefore = query.substring(0, atIndex).trim();
  let pathEndIndex = atIndex + 1;
  let inEscape = false;

  while (pathEndIndex < query.length) {
    const char = query[pathEndIndex];
    if (inEscape) {
      inEscape = false;
    } else if (char === '\\') {
      inEscape = true;
    } else if (/\s/.test(char)) {
      break;
    }
    pathEndIndex++;
  }

  const rawAtPath = query.substring(atIndex, pathEndIndex);
  const textAfter = query.substring(pathEndIndex).trim();
  const atPath = unescapePath(rawAtPath);

  return { textBefore, atPath, textAfter };
}

/**
 * Processes user input potentially containing an '@<path>' command.
 * If found, it attempts to read the specified file/directory using the
 * 'read_many_files' tool, adds the user query and tool result/error to history,
 * and prepares the content for the LLM.
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
  const trimmedQuery = query.trim();
  const parsedCommand = parseAtCommand(trimmedQuery);

  // If no @ command, add user query normally and proceed to LLM
  if (!parsedCommand) {
    addItem({ type: 'user', text: query }, userMessageTimestamp);
    return { processedQuery: [{ text: query }], shouldProceed: true };
  }

  const { textBefore, atPath, textAfter } = parsedCommand;

  // Add the original user query to history first
  addItem({ type: 'user', text: query }, userMessageTimestamp);

  // If the atPath is just "@", pass the original query to the LLM
  if (atPath === '@') {
    onDebugMessage('Lone @ detected, passing directly to LLM.');
    return { processedQuery: [{ text: query }], shouldProceed: true };
  }

  const pathPart = atPath.substring(1); // Remove leading '@'

  // This error condition is for cases where pathPart becomes empty *after* the initial "@" check,
  // which is unlikely with the current parser but good for robustness.
  if (!pathPart) {
    addItem(
      { type: 'error', text: 'Error: No valid path specified after @ symbol.' },
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  const contentLabel = pathPart;

  const toolRegistry = config.getToolRegistry();
  const readManyFilesTool = toolRegistry.getTool('read_many_files');

  if (!readManyFilesTool) {
    addItem(
      { type: 'error', text: 'Error: read_many_files tool not found.' },
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  // Determine path spec (file or directory glob)
  let pathSpec = pathPart;
  try {
    const absolutePath = path.resolve(config.getTargetDir(), pathPart);
    const stats = await fs.stat(absolutePath);
    if (stats.isDirectory()) {
      pathSpec = pathPart.endsWith('/') ? `${pathPart}**` : `${pathPart}/**`;
      onDebugMessage(`Path resolved to directory, using glob: ${pathSpec}`);
    } else {
      onDebugMessage(`Path resolved to file: ${pathSpec}`);
    }
  } catch (error) {
    // If stat fails (e.g., not found), proceed with original path.
    // The tool itself will handle the error during execution.
    if (isNodeError(error) && error.code === 'ENOENT') {
      onDebugMessage(`Path not found, proceeding with original: ${pathSpec}`);
    } else {
      console.error(
        `Error stating path ${pathPart}: ${getErrorMessage(error)}`,
      );
      onDebugMessage(
        `Error stating path, proceeding with original: ${pathSpec}`,
      );
    }
  }

  const toolArgs = { paths: [pathSpec] };
  let toolCallDisplay: IndividualToolCallDisplay;

  try {
    const result = await readManyFilesTool.execute(toolArgs, signal);

    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Success,
      resultDisplay: result.returnDisplay,
      confirmationDetails: undefined,
    };

    // Prepare the query parts for the LLM
    const processedQueryParts: PartUnion[] = [];
    if (textBefore) {
      processedQueryParts.push({ text: textBefore });
    }

    // Process the result from the tool
    processedQueryParts.push('\n--- Content from: ${contentLabel} ---\n');
    if (Array.isArray(result.llmContent)) {
      for (const part of result.llmContent) {
        processedQueryParts.push(part);
      }
    } else {
      processedQueryParts.push(result.llmContent);
    }
    processedQueryParts.push('\n--- End of content ---\n');

    if (textAfter) {
      processedQueryParts.push({ text: textAfter });
    }
    const processedQuery: PartListUnion = processedQueryParts;

    // Add the successful tool result to history
    addItem(
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      userMessageTimestamp,
    );

    return { processedQuery, shouldProceed: true };
  } catch (error: unknown) {
    // Handle errors during tool execution
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Error,
      resultDisplay: `Error reading ${contentLabel}: ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };

    // Add the error tool result to history
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
