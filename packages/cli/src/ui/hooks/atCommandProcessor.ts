/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PartListUnion } from '@google/genai';
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

const addHistoryItem = (
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
  itemData: Omit<HistoryItem, 'id'>,
  id: number,
) => {
  setHistory((prevHistory) => [
    ...prevHistory,
    { ...itemData, id } as HistoryItem,
  ]);
};

interface HandleAtCommandParams {
  query: string;
  config: Config;
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  setDebugMessage: React.Dispatch<React.SetStateAction<string>>;
  getNextMessageId: (baseTimestamp: number) => number;
  userMessageTimestamp: number;
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
    // Find the first '@' that is not preceded by a '\'
    if (query[i] === '@' && (i === 0 || query[i - 1] !== '\\')) {
      atIndex = i;
      break;
    }
  }

  if (atIndex === -1) {
    return null; // No '@' command found
  }

  const textBefore = query.substring(0, atIndex).trim();
  let pathEndIndex = atIndex + 1;
  let inEscape = false;

  while (pathEndIndex < query.length) {
    const char = query[pathEndIndex];

    if (inEscape) {
      // Current char is escaped, move past it
      inEscape = false;
    } else if (char === '\\') {
      // Start of an escape sequence
      inEscape = true;
    } else if (/\s/.test(char)) {
      // Unescaped whitespace marks the end of the path
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
 * It finds the first '@<path>', checks if the path is a file or directory,
 * prepares the appropriate path specification for the read_many_files tool,
 * updates the UI, and prepares the query for the LLM, incorporating the
 * file content and surrounding text.
 *
 * @returns An object containing the potentially modified query (or null)
 *          and a flag indicating if the main hook should proceed.
 */
export async function handleAtCommand({
  query,
  config,
  setHistory,
  setDebugMessage,
  getNextMessageId,
  userMessageTimestamp,
}: HandleAtCommandParams): Promise<HandleAtCommandResult> {
  const trimmedQuery = query.trim();
  const parsedCommand = parseAtCommand(trimmedQuery);

  if (!parsedCommand) {
    // If no '@' was found, treat the whole query as user text and proceed
    // This allows users to just type text without an @ command
    addHistoryItem(
      setHistory,
      { type: 'user', text: query },
      userMessageTimestamp,
    );
    // Let the main hook decide what to do (likely send to LLM)
    return { processedQuery: [{ text: query }], shouldProceed: true };
    // Or, if an @ command is *required* when the function is called:
    /*
    const errorTimestamp = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'error', text: 'Error: Could not find @ command.' },
      errorTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
    */
  }

  const { textBefore, atPath, textAfter } = parsedCommand;

  // Add the original user query to history *before* processing
  addHistoryItem(
    setHistory,
    { type: 'user', text: query },
    userMessageTimestamp,
  );

  const pathPart = atPath.substring(1); // Remove the leading '@'

  if (!pathPart) {
    const errorTimestamp = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'error', text: 'Error: No path specified after @.' },
      errorTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  addHistoryItem(
    setHistory,
    { type: 'user', text: query },
    userMessageTimestamp,
  );

  if (!pathPart) {
    const errorTimestamp = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'error', text: 'Error: No path specified after @.' },
      errorTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  const toolRegistry = config.getToolRegistry();
  const readManyFilesTool = toolRegistry.getTool('read_many_files');

  if (!readManyFilesTool) {
    const errorTimestamp = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'error', text: 'Error: read_many_files tool not found.' },
      errorTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  // --- Path Handling for @ command ---
  let pathSpec = pathPart;
  const contentLabel = pathPart;

  try {
    // Resolve the path relative to the target directory
    const absolutePath = path.resolve(config.getTargetDir(), pathPart);
    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      // If it's a directory, ensure it ends with a globstar for recursive read
      pathSpec = pathPart.endsWith('/') ? `${pathPart}**` : `${pathPart}/**`;
      setDebugMessage(`Path resolved to directory, using glob: ${pathSpec}`);
    } else {
      // It's a file, use the original pathPart as pathSpec
      setDebugMessage(`Path resolved to file: ${pathSpec}`);
    }
  } catch (error) {
    // If stat fails (e.g., file/dir not found), proceed with the original pathPart.
    // The read_many_files tool will handle the error if it's invalid.
    if (isNodeError(error) && error.code === 'ENOENT') {
      setDebugMessage(`Path not found, proceeding with original: ${pathSpec}`);
    } else {
      // Log other stat errors but still proceed
      console.error(`Error stating path ${pathPart}:`, error);
      setDebugMessage(
        `Error stating path, proceeding with original: ${pathSpec}`,
      );
    }
  }

  const toolArgs = { paths: [pathSpec] };
  // --- End Path Handling ---

  let toolCallDisplay: IndividualToolCallDisplay;

  try {
    const result = await readManyFilesTool.execute(toolArgs);
    const fileContent = result.llmContent || '';

    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Success,
      resultDisplay: result.returnDisplay,
      confirmationDetails: undefined,
    };

    const processedQueryParts = [];
    if (textBefore) {
      processedQueryParts.push({ text: textBefore });
    }
    processedQueryParts.push({
      text: `\n--- Content from: ${contentLabel} ---\n${fileContent}\n--- End Content ---`,
    });
    if (textAfter) {
      processedQueryParts.push({ text: textAfter });
    }

    const processedQuery: PartListUnion = processedQueryParts;

    const toolGroupId = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      toolGroupId,
    );

    return { processedQuery, shouldProceed: true };
  } catch (error) {
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Error,
      resultDisplay: `Error reading ${contentLabel}: ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };

    const toolGroupId = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      toolGroupId,
    );

    return { processedQuery: null, shouldProceed: false };
  }
}
