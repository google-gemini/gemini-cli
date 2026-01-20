/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PartListUnion, PartUnion } from '@google/genai';
import type {
  AnyToolInvocation,
  Config,
  DiscoveredMCPResource,
} from '@google/gemini-cli-core';
import {
  debugLogger,
  getErrorMessage,
  isNodeError,
  unescapePath,
  ReadManyFilesTool,
} from '@google/gemini-cli-core';
import { Buffer } from 'node:buffer';
import type { HistoryItem, IndividualToolCallDisplay } from '../types.js';
import { ToolCallStatus } from '../types.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';

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
  error?: string;
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
      } else if (/[,\s;!?()[\]{}]/.test(char)) {
        // Path ends at first whitespace or punctuation not escaped
        break;
      } else if (char === '.') {
        // For . we need to be more careful - only terminate if followed by whitespace or end of string
        // This allows file extensions like .txt, .js but terminates at sentence endings like "file.txt. Next sentence"
        const nextChar =
          pathEndIndex + 1 < query.length ? query[pathEndIndex + 1] : '';
        if (nextChar === '' || /\s/.test(nextChar)) {
          break;
        }
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
 * Processes user input containing one or more '@<path>' commands.
 * - Workspace paths are read via the 'read_many_files' tool.
 * - MCP resource URIs are read via each server's `resources/read`.
 * The user query is updated with inline content blocks so the LLM receives the
 * referenced context directly.
 *
 * @returns An object indicating whether the main hook should proceed with an
 *          LLM call and the processed query parts (including file/resource content).
 */
export async function handleAtCommand({
  query,
  config,
  addItem,
  onDebugMessage,
  messageId: userMessageTimestamp,
  signal,
}: HandleAtCommandParams): Promise<HandleAtCommandResult> {
  const resourceRegistry = config.getResourceRegistry();
  const mcpClientManager = config.getMcpClientManager();

  const commandParts = parseAllAtCommands(query);
  const atPathCommandParts = commandParts.filter(
    (part) => part.type === 'atPath',
  );

  if (atPathCommandParts.length === 0) {
    return { processedQuery: [{ text: query }] };
  }

  // Get centralized file discovery service
  const fileDiscovery = config.getFileService();

  const respectFileIgnore = config.getFileFilteringOptions();

  const pathSpecsToRead: string[] = [];
  const resourceAttachments: DiscoveredMCPResource[] = [];
  const atPathToResolvedSpecMap = new Map<string, string>();
  const agentsFound: string[] = [];
  const fileLabelsForDisplay: string[] = [];
  const absoluteToRelativePathMap = new Map<string, string>();
  const ignoredByReason: Record<string, string[]> = {
    git: [],
    gemini: [],
    both: [],
  };

  const toolRegistry = config.getToolRegistry();
  const readManyFilesTool = new ReadManyFilesTool(
    config,
    config.getMessageBus(),
  );
  const globTool = toolRegistry.getTool('glob');

  if (!readManyFilesTool) {
    addItem(
      { type: 'error', text: 'Error: read_many_files tool not found.' },
      userMessageTimestamp,
    );
    return {
      processedQuery: null,
      error: 'Error: read_many_files tool not found.',
    };
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
      const errMsg = `Error: Invalid @ command '${originalAtPath}'. No path specified.`;
      addItem(
        {
          type: 'error',
          text: errMsg,
        },
        userMessageTimestamp,
      );
      // Decide if this is a fatal error for the whole command or just skip this @ part
      // For now, let's be strict and fail the command if one @path is malformed.
      return { processedQuery: null, error: errMsg };
    }

    // Check if this is an Agent reference
    const agentRegistry = config.getAgentRegistry?.();
    if (agentRegistry?.getDefinition(pathName)) {
      agentsFound.push(pathName);
      atPathToResolvedSpecMap.set(originalAtPath, pathName);
      continue;
    }

    // Check if this is an MCP resource reference (serverName:uri format)
    const resourceMatch = resourceRegistry.findResourceByUri(pathName);
    if (resourceMatch) {
      resourceAttachments.push(resourceMatch);
      atPathToResolvedSpecMap.set(originalAtPath, pathName);
      continue;
    }

    const workspaceContext = config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(pathName)) {
      onDebugMessage(
        `Path ${pathName} is not in the workspace and will be skipped.`,
      );
      continue;
    }

    const gitIgnored =
      respectFileIgnore.respectGitIgnore &&
      fileDiscovery.shouldIgnoreFile(pathName, {
        respectGitIgnore: true,
        respectGeminiIgnore: false,
      });
    const geminiIgnored =
      respectFileIgnore.respectGeminiIgnore &&
      fileDiscovery.shouldIgnoreFile(pathName, {
        respectGitIgnore: false,
        respectGeminiIgnore: true,
      });

    if (gitIgnored || geminiIgnored) {
      const reason =
        gitIgnored && geminiIgnored ? 'both' : gitIgnored ? 'git' : 'gemini';
      ignoredByReason[reason].push(pathName);
      const reasonText =
        reason === 'both'
          ? 'ignored by both git and gemini'
          : reason === 'git'
            ? 'git-ignored'
            : 'gemini-ignored';
      onDebugMessage(`Path ${pathName} is ${reasonText} and will be skipped.`);
      continue;
    }

    for (const dir of config.getWorkspaceContext().getDirectories()) {
      let currentPathSpec = pathName;
      let resolvedSuccessfully = false;
      let relativePath = pathName;
      try {
        const absolutePath = path.isAbsolute(pathName)
          ? pathName
          : path.resolve(dir, pathName);
        const stats = await fs.stat(absolutePath);

        // Convert absolute path to relative path
        relativePath = path.isAbsolute(pathName)
          ? path.relative(dir, absolutePath)
          : pathName;

        if (stats.isDirectory()) {
          currentPathSpec = path.join(relativePath, '**');
          onDebugMessage(
            `Path ${pathName} resolved to directory, using glob: ${currentPathSpec}`,
          );
        } else {
          currentPathSpec = relativePath;
          absoluteToRelativePathMap.set(absolutePath, relativePath);
          onDebugMessage(
            `Path ${pathName} resolved to file: ${absolutePath}, using relative path: ${relativePath}`,
          );
        }
        resolvedSuccessfully = true;
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          if (config.getEnableRecursiveFileSearch() && globTool) {
            onDebugMessage(
              `Path ${pathName} not found directly, attempting glob search.`,
            );
            try {
              const globResult = await globTool.buildAndExecute(
                {
                  pattern: `**/*${pathName}*`,
                  path: dir,
                },
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
                  currentPathSpec = path.relative(dir, firstMatchAbsolute);
                  absoluteToRelativePathMap.set(
                    firstMatchAbsolute,
                    currentPathSpec,
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
              debugLogger.warn(
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
          debugLogger.warn(
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
        const displayPath = path.isAbsolute(pathName) ? relativePath : pathName;
        fileLabelsForDisplay.push(displayPath);
        break;
      }
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
        !initialQueryText.endsWith(' ')
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
  const totalIgnored =
    ignoredByReason['git'].length +
    ignoredByReason['gemini'].length +
    ignoredByReason['both'].length;

  if (totalIgnored > 0) {
    const messages = [];
    if (ignoredByReason['git'].length) {
      messages.push(`Git-ignored: ${ignoredByReason['git'].join(', ')}`);
    }
    if (ignoredByReason['gemini'].length) {
      messages.push(`Gemini-ignored: ${ignoredByReason['gemini'].join(', ')}`);
    }
    if (ignoredByReason['both'].length) {
      messages.push(`Ignored by both: ${ignoredByReason['both'].join(', ')}`);
    }

    const message = `Ignored ${totalIgnored} files:\n${messages.join('\n')}`;
    debugLogger.log(message);
    onDebugMessage(message);
  }

  // Fallback for lone "@" or completely invalid @-commands resulting in empty initialQueryText
  if (
    pathSpecsToRead.length === 0 &&
    resourceAttachments.length === 0 &&
    agentsFound.length === 0
  ) {
    onDebugMessage('No valid file paths found in @ commands to read.');
    if (initialQueryText === '@' && query.trim() === '@') {
      // If the only thing was a lone @, pass original query (which might have spaces)
      return { processedQuery: [{ text: query }] };
    } else if (!initialQueryText && query) {
      // If all @-commands were invalid and no surrounding text, pass original query
      return { processedQuery: [{ text: query }] };
    }
    // Otherwise, proceed with the (potentially modified) query text that doesn't involve file reading
    return { processedQuery: [{ text: initialQueryText || query }] };
  }

  const processedQueryParts: PartListUnion = [{ text: initialQueryText }];

  if (agentsFound.length > 0) {
    const agentNudge = `\n<system_note>\nThe user has explicitly selected the following agent(s): ${agentsFound.join(
      ', ',
    )}. Please use the 'delegate_to_agent' tool to delegate the task to the selected agent(s).\n</system_note>\n`;
    processedQueryParts.push({ text: agentNudge });
  }

  const resourcePromises = resourceAttachments.map(async (resource) => {
    const uri = resource.uri;
    const client = mcpClientManager?.getClient(resource.serverName);
    try {
      if (!client) {
        throw new Error(
          `MCP client for server '${resource.serverName}' is not available or not connected.`,
        );
      }
      const response = await client.readResource(uri);
      const parts = convertResourceContentsToParts(response);
      return {
        success: true,
        parts,
        uri,
        display: {
          callId: `mcp-resource-${resource.serverName}-${uri}`,
          name: `resources/read (${resource.serverName})`,
          description: uri,
          status: ToolCallStatus.Success,
          resultDisplay: `Successfully read resource ${uri}`,
          confirmationDetails: undefined,
        } as IndividualToolCallDisplay,
      };
    } catch (error) {
      return {
        success: false,
        parts: [],
        uri,
        display: {
          callId: `mcp-resource-${resource.serverName}-${uri}`,
          name: `resources/read (${resource.serverName})`,
          description: uri,
          status: ToolCallStatus.Error,
          resultDisplay: `Error reading resource ${uri}: ${getErrorMessage(error)}`,
          confirmationDetails: undefined,
        } as IndividualToolCallDisplay,
      };
    }
  });

  const resourceResults = await Promise.all(resourcePromises);
  const resourceReadDisplays: IndividualToolCallDisplay[] = [];
  let resourceErrorOccurred = false;

  for (const result of resourceResults) {
    resourceReadDisplays.push(result.display);
    if (result.success) {
      processedQueryParts.push({ text: `\nContent from @${result.uri}:\n` });
      processedQueryParts.push(...result.parts);
    } else {
      resourceErrorOccurred = true;
    }
  }

  if (resourceErrorOccurred) {
    addItem(
      { type: 'tool_group', tools: resourceReadDisplays } as Omit<
        HistoryItem,
        'id'
      >,
      userMessageTimestamp,
    );
    // Find the first error to report
    const firstError = resourceReadDisplays.find(
      (d) => d.status === ToolCallStatus.Error,
    )!;
    const errorMessages = resourceReadDisplays
      .filter((d) => d.status === ToolCallStatus.Error)
      .map((d) => d.resultDisplay);
    debugLogger.error(errorMessages);
    const errorMsg = `Exiting due to an error processing the @ command: ${firstError.resultDisplay}`;
    return { processedQuery: null, error: errorMsg };
  }

  if (pathSpecsToRead.length === 0) {
    if (resourceReadDisplays.length > 0) {
      addItem(
        { type: 'tool_group', tools: resourceReadDisplays } as Omit<
          HistoryItem,
          'id'
        >,
        userMessageTimestamp,
      );
    }
    return { processedQuery: processedQueryParts };
  }

  const toolArgs = {
    include: pathSpecsToRead,
    file_filtering_options: {
      respect_git_ignore: respectFileIgnore.respectGitIgnore,
      respect_gemini_ignore: respectFileIgnore.respectGeminiIgnore,
    },
    // Use configuration setting
  };
  let readManyFilesDisplay: IndividualToolCallDisplay | undefined;

  let invocation: AnyToolInvocation | undefined = undefined;
  try {
    invocation = readManyFilesTool.build(toolArgs);
    const result = await invocation.execute(signal);
    readManyFilesDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: invocation.getDescription(),
      status: ToolCallStatus.Success,
      resultDisplay:
        result.returnDisplay ||
        `Successfully read: ${fileLabelsForDisplay.join(', ')}`,
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

            let displayPath = absoluteToRelativePathMap.get(
              filePathSpecInContent,
            );

            // Fallback: if no mapping found, try to convert absolute path to relative
            if (!displayPath) {
              for (const dir of config.getWorkspaceContext().getDirectories()) {
                if (filePathSpecInContent.startsWith(dir)) {
                  displayPath = path.relative(dir, filePathSpecInContent);
                  break;
                }
              }
            }

            displayPath = displayPath || filePathSpecInContent;

            processedQueryParts.push({
              text: `\nContent from @${displayPath}:\n`,
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
    } else {
      onDebugMessage(
        'read_many_files tool returned no content or empty content.',
      );
    }

    if (resourceReadDisplays.length > 0 || readManyFilesDisplay) {
      addItem(
        {
          type: 'tool_group',
          tools: [
            ...resourceReadDisplays,
            ...(readManyFilesDisplay ? [readManyFilesDisplay] : []),
          ],
        } as Omit<HistoryItem, 'id'>,
        userMessageTimestamp,
      );
    }
    return { processedQuery: processedQueryParts };
  } catch (error: unknown) {
    readManyFilesDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description:
        invocation?.getDescription() ??
        'Error attempting to execute tool to read files',
      status: ToolCallStatus.Error,
      resultDisplay: `Error reading files (${fileLabelsForDisplay.join(', ')}): ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };
    addItem(
      {
        type: 'tool_group',
        tools: [...resourceReadDisplays, readManyFilesDisplay],
      } as Omit<HistoryItem, 'id'>,
      userMessageTimestamp,
    );
    return {
      processedQuery: null,
      error: `Exiting due to an error processing the @ command: ${readManyFilesDisplay.resultDisplay}`,
    };
  }
}

function convertResourceContentsToParts(response: {
  contents?: Array<{
    text?: string;
    blob?: string;
    mimeType?: string;
    resource?: {
      text?: string;
      blob?: string;
      mimeType?: string;
    };
  }>;
}): PartUnion[] {
  const parts: PartUnion[] = [];
  for (const content of response.contents ?? []) {
    const candidate = content.resource ?? content;
    if (candidate.text) {
      parts.push({ text: candidate.text });
      continue;
    }
    if (candidate.blob) {
      const sizeBytes = Buffer.from(candidate.blob, 'base64').length;
      const mimeType = candidate.mimeType ?? 'application/octet-stream';
      parts.push({
        text: `[Binary resource content ${mimeType}, ${sizeBytes} bytes]`,
      });
    }
  }
  return parts;
}
