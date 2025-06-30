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

interface HandleEnhancedAtCommandParams {
  query: string;
  config: Config;
  addItem: UseHistoryManagerReturn['addItem'];
  onDebugMessage: (message: string) => void;
  messageId: number;
  signal: AbortSignal;
}

interface HandleEnhancedAtCommandResult {
  processedQuery: PartListUnion | null;
  shouldProceed: boolean;
  isContextCommand: boolean;
  contextCommand?: string;
  contextArgs?: string[];
  resolvedFilePaths?: string[];
}

interface AtCommandPart {
  type: 'text' | 'atPath' | 'contextCommand';
  content: string;
  command?: string;
  args?: string[];
}

/**
 * Parses a query string to find all '@<path>' commands, context management commands, and text segments.
 * Handles \ escaped spaces within paths and consecutive @ commands without spaces.
 */
function parseEnhancedAtCommands(query: string): AtCommandPart[] {
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

    // Parse @command or @path - updated to stop at next @ or whitespace
    let commandEndIndex = atIndex + 1;
    let inEscape = false;
    while (commandEndIndex < query.length) {
      const char = query[commandEndIndex];
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (char === '@') {
        // Always stop at next @
        break;
      } else if (/\s/.test(char)) {
        // For context commands with arguments, continue parsing after whitespace
        const commandContent = query.substring(atIndex + 1, commandEndIndex);
        const contextCommands = [
          'list',
          'show',
          'status',
          'remove',
          'clear',
          'clear-all',
          'help',
        ];
        const isContextCommand = contextCommands.includes(commandContent);

        if (
          isContextCommand &&
          (commandContent === 'remove' || commandContent === 'clear')
        ) {
          // For commands that expect arguments, continue parsing
          commandEndIndex++;
          continue;
        } else {
          // For other commands or file paths, stop at whitespace
          break;
        }
      }
      commandEndIndex++;
    }

    const rawAtCommand = query.substring(atIndex, commandEndIndex);
    const commandContent = rawAtCommand.substring(1); // Remove @

    // Check if this is a context management command
    // First, check for exact matches (like @list, @status, etc.)
    const contextCommands = [
      'list',
      'show',
      'status',
      'remove',
      'clear',
      'clear-all',
      'help',
    ];
    const isExactContextCommand = contextCommands.includes(commandContent);

    // Then check for commands with arguments (like @remove filename)
    const isContextCommandWithArgs = contextCommands.some((cmd) =>
      commandContent.startsWith(cmd + ' '),
    );

    if (isExactContextCommand || isContextCommandWithArgs) {
      const commandParts = commandContent.split(' ');
      const command = commandParts[0];
      const args = commandParts.slice(1);
      parts.push({
        type: 'contextCommand',
        content: rawAtCommand,
        command,
        args,
      });
    } else {
      // Regular file path
      const atPath = unescapePath(rawAtCommand);
      parts.push({ type: 'atPath', content: atPath });
    }

    currentIndex = commandEndIndex;
  }

  // Filter out empty text parts
  return parts.filter(
    (part) => !(part.type === 'text' && part.content.trim() === ''),
  );
}

/**
 * Enhanced @ command processor that integrates with file context management.
 * Handles both file inclusion and context management commands.
 */
export async function handleEnhancedAtCommand({
  query,
  config,
  addItem,
  onDebugMessage,
  messageId: userMessageTimestamp,
  signal,
}: HandleEnhancedAtCommandParams): Promise<HandleEnhancedAtCommandResult> {
  const commandParts = parseEnhancedAtCommands(query);
  const contextCommandParts = commandParts.filter(
    (part) => part.type === 'contextCommand',
  );
  const atPathCommandParts = commandParts.filter(
    (part) => part.type === 'atPath',
  );

  // Handle context management commands
  if (contextCommandParts.length > 0) {
    const contextCommand = contextCommandParts[0];
    addItem({ type: 'user', text: query }, userMessageTimestamp);

    return {
      processedQuery: null,
      shouldProceed: false,
      isContextCommand: true,
      contextCommand: contextCommand.command,
      contextArgs: contextCommand.args,
    };
  }

  // Handle regular file inclusion (existing logic)
  if (atPathCommandParts.length === 0) {
    addItem({ type: 'user', text: query }, userMessageTimestamp);
    return {
      processedQuery: [{ text: query }],
      shouldProceed: true,
      isContextCommand: false,
    };
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
    return {
      processedQuery: null,
      shouldProceed: false,
      isContextCommand: false,
    };
  }

  // Process file paths (existing logic from atCommandProcessor)
  for (const atPathPart of atPathCommandParts) {
    const originalAtPath = atPathPart.content;

    if (originalAtPath === '@') {
      onDebugMessage(
        'Lone @ detected, will be treated as text in the modified query.',
      );
      continue;
    }

    const pathName = originalAtPath.substring(1);
    if (!pathName) {
      addItem(
        {
          type: 'error',
          text: `Error: Invalid @ command '${originalAtPath}'. No path specified.`,
        },
        userMessageTimestamp,
      );
      return {
        processedQuery: null,
        shouldProceed: false,
        isContextCommand: false,
      };
    }

    // Check if path should be ignored by git
    if (fileDiscovery.shouldGitIgnoreFile(pathName)) {
      const reason = respectGitIgnore
        ? 'git-ignored and will be skipped'
        : 'ignored by custom patterns';
      onDebugMessage(`Path ${pathName} is ${reason}.`);
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
        onDebugMessage(
          `Error resolving path ${pathName}: ${getErrorMessage(error)}`,
        );
      }
    }

    if (resolvedSuccessfully) {
      pathSpecsToRead.push(currentPathSpec);
      atPathToResolvedSpecMap.set(originalAtPath, currentPathSpec);
      contentLabelsForDisplay.push(currentPathSpec);
    }
  }

  // Inform user about ignored paths
  if (ignoredPaths.length > 0) {
    const ignoreType = respectGitIgnore ? 'git-ignored' : 'custom-ignored';
    onDebugMessage(
      `Ignored ${ignoredPaths.length} ${ignoreType} files: ${ignoredPaths.join(', ')}`,
    );
  }

  // Fallback for lone "@" or completely invalid @-commands
  if (pathSpecsToRead.length === 0) {
    onDebugMessage('No valid file paths found in @ commands to read.');
    const initialQueryText = commandParts
      .filter((part) => part.type === 'text')
      .map((part) => part.content)
      .join('');

    if (initialQueryText === '@' && query.trim() === '@') {
      return {
        processedQuery: [{ text: query }],
        shouldProceed: true,
        isContextCommand: false,
      };
    } else if (!initialQueryText && query) {
      return {
        processedQuery: [{ text: query }],
        shouldProceed: true,
        isContextCommand: false,
      };
    }
    return {
      processedQuery: [{ text: initialQueryText || query }],
      shouldProceed: true,
      isContextCommand: false,
    };
  }

  const initialQueryText = commandParts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('');

  const processedQueryParts: PartUnion[] = [{ text: initialQueryText }];

  const toolArgs = {
    paths: pathSpecsToRead,
    respectGitIgnore,
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
            const filePathSpecInContent = match[1];
            const fileActualContent = match[2].trim();
            processedQueryParts.push({
              text: `\nContent from @${filePathSpecInContent}:\n`,
            });
            processedQueryParts.push({ text: fileActualContent });
          } else {
            processedQueryParts.push({ text: part });
          }
        } else {
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
    return {
      processedQuery: processedQueryParts,
      shouldProceed: true,
      isContextCommand: false,
      resolvedFilePaths: contentLabelsForDisplay,
    };
  } catch (error) {
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
    return {
      processedQuery: null,
      shouldProceed: false,
      isContextCommand: false,
    };
  }
}
