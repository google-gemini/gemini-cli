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
} from '@google/gemini-cli-core';
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

interface AtCommandPart {
  type: 'text' | 'atPath';
  content: string;
}

/**
 * Parses a query string to find all '@<path>' commands and text segments.
 * Handles \ escaped spaces within paths.
 */
function parseAllAtCommands(query: string): AtCommandPart[] {
  const parts: AtCommandPart[] = [];
  let currentIndex = 0;

  while (currentIndex < query.length) {
    let atIndex = -1;
    let nextSearchIndex = currentIndex;
    // Find next unescaped '@'
    while (nextSearchIndex < query.length) {
      if (
        query[nextSearchIndex] === '@' &&
        (nextSearchIndex === 0 || query[nextSearchIndex - 1] !== '\\')
      ) {
        atIndex = nextSearchIndex;
        break;
      }
      nextSearchIndex++;
    }

    if (atIndex === -1) {
      // No more @
      if (currentIndex < query.length) {
        parts.push({ type: 'text', content: query.substring(currentIndex) });
      }
      break;
    }

    // Add text before @
    if (atIndex > currentIndex) {
      parts.push({
        type: 'text',
        content: query.substring(currentIndex, atIndex),
      });
    }

    // Parse @path
    let pathEndIndex = atIndex + 1;
    let inEscape = false;
    while (pathEndIndex < query.length) {
      const char = query[pathEndIndex];
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (/\s/.test(char)) {
        // Path ends at first whitespace not escaped
        break;
      }
      pathEndIndex++;
    }
    const rawAtPath = query.substring(atIndex, pathEndIndex);
    // unescapePath expects the @ symbol to be present, and will handle it.
    const atPath = unescapePath(rawAtPath);
    parts.push({ type: 'atPath', content: atPath });
    currentIndex = pathEndIndex;
  }
  // Filter out empty text parts that might result from consecutive @paths or leading/trailing spaces
  return parts.filter(
    (part) => !(part.type === 'text' && part.content.trim() === ''),
  );
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
  const commandParts = parseAllAtCommands(query);
  const atPathCommandParts = commandParts.filter(
    (part) => part.type === 'atPath',
  );

  if (atPathCommandParts.length === 0) {
    addItem({ type: 'user', text: query }, userMessageTimestamp);
    return { processedQuery: [{ text: query }], shouldProceed: true };
  }

  addItem({ type: 'user', text: query }, userMessageTimestamp);

  // Get centralized file discovery service
  const fileDiscovery = config.getFileService();
  const respectGitIgnore = config.getFileFilteringRespectGitIgnore();

  const pathSpecsToRead: string[] = [];
  const atPathToResolvedSpecMap = new Map<string, string>();
  const contentLabelsForDisplay: string[] = [];
  const ignoredPaths: string[] = [];

  const toolRegistry = await config.getToolRegistry();
  const readManyFilesTool = toolRegistry.getTool('read_many_files');
  const globTool = toolRegistry.getTool('glob');

  if (!readManyFilesTool) {
    addItem(
      { type: 'error', text: 'Error: read_many_files tool not found.' },
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  for (const atPathPart of atPathCommandParts) {
    const originalAtPath = atPathPart.content; // e.g., "@file.txt" or "@"

    if (originalAtPath === '@') {
      onDebugMessage(
        'Lone @ detected, will be treated as text in the modified query.',
      );
      continue;
    }

    const pathName = originalAtPath.substring(1);
    if (!pathName) {
      // This case should ideally not be hit if parseAllAtCommands ensures content after @
      // but as a safeguard:
      addItem(
        {
          type: 'error',
          text: `Error: Invalid @ command '${originalAtPath}'. No path specified.`,
        },
        userMessageTimestamp,
      );
      // Decide if this is a fatal error for the whole command or just skip this @ part
      // For now, let's be strict and fail the command if one @path is malformed.
      return { processedQuery: null, shouldProceed: false };
    }

    // Check if path should be ignored based on filtering options
    if (fileDiscovery.shouldIgnoreFile(pathName, { respectGitIgnore })) {
      const reason = respectGitIgnore ? 'git-ignored' : 'custom-ignored';
      onDebugMessage(`Path ${pathName} is ${reason} and will be skipped.`);
      ignoredPaths.push(pathName);
      continue;
    }

    let currentPathSpec = pathName;
    let resolvedSuccessfully = false;

    try {
      const absolutePath = path.resolve(config.getTargetDir(), pathName);
      const stats = await fs.stat(absolutePath);
      if (stats.isDirectory()) {
        currentPathSpec = pathName.endsWith('/')
          ? `${pathName}**`
          : `${pathName}/**`;
        onDebugMessage(
          `Path ${pathName} resolved to directory, using glob: ${currentPathSpec}`,
        );
      } else {
        onDebugMessage(`Path ${pathName} resolved to file: ${currentPathSpec}`);
      }
      resolvedSuccessfully = true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        if (config.getEnableRecursiveFileSearch() && globTool) {
          onDebugMessage(
            `Path ${pathName} not found directly, attempting glob search.`,
          );
          try {
            const globResult = await globTool.execute(
              { pattern: `**/*${pathName}*`, path: config.getTargetDir() },
              signal,
            );
            if (
              globResult.llmContent &&
              typeof globResult.llmContent === 'string' &&
              !globResult.llmContent.startsWith('No files found') &&
              !globResult.llmContent.startsWith('Error:')
            ) {
              const lines = globResult.llmContent.split('\n');
              if (lines.length > 1 && lines[1]) {
                const firstMatchAbsolute = lines[1].trim();
                currentPathSpec = path.relative(
                  config.getTargetDir(),
                  firstMatchAbsolute,
                );
                onDebugMessage(
                  `Glob search for ${pathName} found ${firstMatchAbsolute}, using relative path: ${currentPathSpec}`,
                );
                resolvedSuccessfully = true;
              } else {
                onDebugMessage(
                  `Glob search for '**/*${pathName}*' did not return a usable path. Path ${pathName} will be skipped.`,
                );
              }
            } else {
              onDebugMessage(
                `Glob search for '**/*${pathName}*' found no files or an error. Path ${pathName} will be skipped.`,
              );
            }
          } catch (globError) {
            console.error(
              `Error during glob search for ${pathName}: ${getErrorMessage(globError)}`,
            );
            onDebugMessage(
              `Error during glob search for ${pathName}. Path ${pathName} will be skipped.`,
            );
          }
        } else {
          onDebugMessage(
            `Glob tool not found. Path ${pathName} will be skipped.`,
          );
        }
      } else {
        console.error(
          `Error stating path ${pathName}: ${getErrorMessage(error)}`,
        );
        onDebugMessage(
          `Error stating path ${pathName}. Path ${pathName} will be skipped.`,
        );
      }
    }

    if (resolvedSuccessfully) {
      pathSpecsToRead.push(currentPathSpec);
      atPathToResolvedSpecMap.set(originalAtPath, currentPathSpec);
      contentLabelsForDisplay.push(pathName);
    }
  }

  // Construct the initial part of the query for the LLM
  let initialQueryText = '';
  for (let i = 0; i < commandParts.length; i++) {
    const part = commandParts[i];
    if (part.type === 'text') {
      initialQueryText += part.content;
    } else {
      // type === 'atPath'
      const resolvedSpec = atPathToResolvedSpecMap.get(part.content);
      if (
        i > 0 &&
        initialQueryText.length > 0 &&
        !initialQueryText.endsWith(' ') &&
        resolvedSpec
      ) {
        // Add space if previous part was text and didn't end with space, or if previous was @path
        const prevPart = commandParts[i - 1];
        if (
          prevPart.type === 'text' ||
          (prevPart.type === 'atPath' &&
            atPathToResolvedSpecMap.has(prevPart.content))
        ) {
          initialQueryText += ' ';
        }
      }
      if (resolvedSpec) {
        initialQueryText += `@${resolvedSpec}`;
      } else {
        // If not resolved for reading (e.g. lone @ or invalid path that was skipped),
        // add the original @-string back, ensuring spacing if it's not the first element.
        if (
          i > 0 &&
          initialQueryText.length > 0 &&
          !initialQueryText.endsWith(' ') &&
          !part.content.startsWith(' ')
        ) {
          initialQueryText += ' ';
        }
        initialQueryText += part.content;
      }
    }
  }
  initialQueryText = initialQueryText.trim();

  // Inform user about ignored paths
  if (ignoredPaths.length > 0) {
    const ignoreType = respectGitIgnore ? 'git-ignored' : 'custom-ignored';
    onDebugMessage(
      `Ignored ${ignoredPaths.length} ${ignoreType} files: ${ignoredPaths.join(', ')}`,
    );
  }

  // Fallback for lone "@" or completely invalid @-commands resulting in empty initialQueryText
  if (pathSpecsToRead.length === 0) {
    onDebugMessage('No valid file paths found in @ commands to read.');
    if (initialQueryText === '@' && query.trim() === '@') {
      // If the only thing was a lone @, pass original query (which might have spaces)
      return { processedQuery: [{ text: query }], shouldProceed: true };
    } else if (!initialQueryText && query) {
      // If all @-commands were invalid and no surrounding text, pass original query
      return { processedQuery: [{ text: query }], shouldProceed: true };
    }
    // Otherwise, proceed with the (potentially modified) query text that doesn't involve file reading
    return {
      processedQuery: [{ text: initialQueryText || query }],
      shouldProceed: true,
    };
  }

  const processedQueryParts: PartUnion[] = [{ text: initialQueryText }];

  const toolArgs = {
    paths: pathSpecsToRead,
    respect_git_ignore: respectGitIgnore, // Use configuration setting
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
        `Successfully read: ${contentLabelsForDisplay.join(', ')}`,
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
      resultDisplay: `Error reading files (${contentLabelsForDisplay.join(', ')}): ${getErrorMessage(error)}`,
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
