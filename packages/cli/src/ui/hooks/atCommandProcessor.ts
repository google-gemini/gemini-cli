/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PartListUnion } from '@google/genai';
import { Config, getErrorMessage } from '@gemini-code/server';
import {
  HistoryItem,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';

// Helper function to add history items (could be moved to a shared util if needed elsewhere)
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
  query: string; // Raw user input
  config: Config;
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  setDebugMessage: React.Dispatch<React.SetStateAction<string>>;
  getNextMessageId: (baseTimestamp: number) => number;
  userMessageTimestamp: number;
}

interface HandleAtCommandResult {
  processedQuery: PartListUnion; // Query to potentially send to Gemini
  shouldProceed: boolean; // Whether the main hook should continue processing
}

/**
 * Processes user input that might start with the '@' command to read files/directories.
 * If it's an '@' command, it attempts to read the specified path, updates the UI
 * with the tool call status, and prepares the query to be sent to the LLM.
 *
 * @returns An object containing the potentially modified query and a flag
 *          indicating if the main hook should proceed with the Gemini API call.
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

  if (!trimmedQuery.startsWith('@')) {
    // Not an '@' command, proceed as normal
    // Add the user message here before returning
    addHistoryItem(
      setHistory,
      { type: 'user', text: query },
      userMessageTimestamp,
    );
    // Use property shorthand for processedQuery
    return { processedQuery: query, shouldProceed: true };
  }

  // --- It is an '@' command ---
  const filePath = trimmedQuery.substring(1);

  if (!filePath) {
    // Handle case where it's just "@" - treat as normal input
    addHistoryItem(
      setHistory,
      { type: 'user', text: query },
      userMessageTimestamp,
    );
    // Use property shorthand for processedQuery
    return { processedQuery: query, shouldProceed: true }; // Send the "@" to the model
  }

  const toolRegistry = config.getToolRegistry();
  const readManyFilesTool = toolRegistry.getTool('read_many_files');

  // Add user message first, so it appears before potential errors/tool UI
  addHistoryItem(
    setHistory,
    { type: 'user', text: query },
    userMessageTimestamp,
  );

  if (!readManyFilesTool) {
    const errorTimestamp = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'error', text: 'Error: read_many_files tool not found.' },
      errorTimestamp,
    );
    // Use property shorthand for processedQuery
    return { processedQuery: query, shouldProceed: false }; // Don't proceed if tool is missing
  }

  // --- Path Handling for @ command ---
  let pathSpec = filePath;
  // Basic check: If no extension or ends with '/', assume directory and add globstar.
  if (!filePath.includes('.') || filePath.endsWith('/')) {
    pathSpec = filePath.endsWith('/') ? `${filePath}**` : `${filePath}/**`;
  }
  const toolArgs = { paths: [pathSpec] };
  const contentLabel =
    pathSpec === filePath ? filePath : `directory ${filePath}`; // Adjust label
  // --- End Path Handling ---

  let toolCallDisplay: IndividualToolCallDisplay;
  let processedQuery: PartListUnion = query; // Default to original query

  try {
    setDebugMessage(`Reading via @ command: ${pathSpec}`);
    const result = await readManyFilesTool.execute(toolArgs);
    const fileContent = result.llmContent || '';

    // Construct success UI
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Success,
      resultDisplay: result.returnDisplay,
      confirmationDetails: undefined,
    };

    // Prepend file content to the query sent to the model
    processedQuery = [
      {
        text: `--- Content from: ${contentLabel} ---
${fileContent}
--- End Content ---`,
      },
      // TODO: Handle cases like "@README.md explain this" by appending the rest of the query
    ];

    // Add the tool group UI
    const toolGroupId = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      toolGroupId,
    );

    // Use property shorthand for processedQuery
    return { processedQuery, shouldProceed: true }; // Proceed to Gemini
  } catch (error) {
    // Construct error UI
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Error,
      resultDisplay: `Error reading ${contentLabel}: ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };

    // Add the tool group UI and signal not to proceed
    const toolGroupId = getNextMessageId(userMessageTimestamp);
    addHistoryItem(
      setHistory,
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      toolGroupId,
    );

    // Use property shorthand for processedQuery
    return { processedQuery: query, shouldProceed: false }; // Don't proceed on error
  }
}
