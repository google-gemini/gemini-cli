/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PartListUnion, PartUnion } from '@google/genai';
import type { AnyToolInvocation, Config } from '@google/gemini-cli-core';
import {
  debugLogger,
  getErrorMessage,
  isNodeError,
  unescapePath,
  resolveToRealPath,
  fileExists,
  ReadManyFilesTool,
  REFERENCE_CONTENT_START,
  REFERENCE_CONTENT_END,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { Buffer } from 'node:buffer';
import type {
  HistoryItemToolGroup,
  IndividualToolCallDisplay,
} from '../types.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';

const REF_CONTENT_HEADER = `\n${REFERENCE_CONTENT_START}`;
const REF_CONTENT_FOOTER = `\n${REFERENCE_CONTENT_END}`;

/**
 * Regex source for the path/command part of an @ reference.
 * It uses strict ASCII whitespace delimiters to allow Unicode characters like NNBSP in filenames.
 *
 * 1. "(?:[^"]*)" matches a double-quoted string (for Windows paths with spaces).
 * 2. \\. matches any escaped character (e.g., \ ).
 * 3. [^ \t\n\r,;!?()\[\]{}.] matches any character that is NOT a delimiter and NOT a period.
 * 4. \.(?!$|[ \t\n\r]) matches a period ONLY if it is NOT followed by whitespace or end-of-string.
 */
export const AT_COMMAND_PATH_REGEX_SOURCE =
  '(?:(?:"(?:[^"]*)")|(?:\\\\.|[^ \\t\\n\\r,;!?()\\[\\]{}.]|\\.(?!$|[ \\t\\n\\r])))+';

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
  let lastIndex = 0;

  // Create a new RegExp instance for each call to avoid shared state/lastIndex issues.
  const atCommandRegex = new RegExp(
    `(?<!\\\\)@${AT_COMMAND_PATH_REGEX_SOURCE}`,
    'g',
  );

  let match: RegExpExecArray | null;

  while ((match = atCommandRegex.exec(query)) !== null) {
    const matchIndex = match.index;
    const fullMatch = match[0];

    // Add text before @
    if (matchIndex > lastIndex) {
      parts.push({
        type: 'text',
        content: query.substring(lastIndex, matchIndex),
      });
    }

    // We strip the @ before unescaping so that unescapePath can handle quoted paths correctly on Windows.
    const atPath = '@' + unescapePath(fullMatch.substring(1));
    parts.push({ type: 'atPath', content: atPath });

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < query.length) {
    parts.push({ type: 'text', content: query.substring(lastIndex) });
  }

  // Filter out empty text parts that might result from consecutive @paths or leading/trailing spaces
  return parts.filter(
    (part) => !(part.type === 'text' && part.content.trim() === ''),
  );
}

function categorizeAtCommands(
  commandParts: AtCommandPart[],
  config: Config,
): {
  agentParts: AtCommandPart[];
  resourceParts: AtCommandPart[];
  fileParts: AtCommandPart[];
} {
  const agentParts: AtCommandPart[] = [];
  const resourceParts: AtCommandPart[] = [];
  const fileParts: AtCommandPart[] = [];

  const agentRegistry = config.getAgentRegistry?.();
  const resourceRegistry = config.getResourceRegistry();

  for (const part of commandParts) {
    if (part.type !== 'atPath' || part.content === '@') {
      continue;
    }

    const name = part.content.substring(1);

    if (agentRegistry?.getDefinition(name)) {
      agentParts.push(part);
    } else if (resourceRegistry.findResourceByUri(name)) {
      resourceParts.push(part);
    } else {
      fileParts.push(part);
    }
  }

  return { agentParts, resourceParts, fileParts };
}

/**
 * Checks if the query contains any file paths that require read permission.
 * Returns an array of such paths.
 */
export async function checkPermissions(
  query: string,
  config: Config,
): Promise<string[]> {
  const commandParts = parseAllAtCommands(query);
  const { fileParts } = categorizeAtCommands(commandParts, config);
  const permissionsRequired: string[] = [];

  for (const part of fileParts) {
    const pathName = part.content.substring(1);
    if (!pathName) continue;

    const resolvedPathName = resolveToRealPath(
      path.resolve(config.getTargetDir(), pathName),
    );

    if (config.validatePathAccess(resolvedPathName, 'read')) {
      if (await fileExists(resolvedPathName)) {
        permissionsRequired.push(resolvedPathName);
      }
    }
  }
  return permissionsRequired;
}

interface ResolvedFile {
  part: AtCommandPart;
  pathSpec: string;
  displayLabel: string;
  absolutePath?: string;
}

interface IgnoredFile {
  path: string;
  reason: 'git' | 'gemini' | 'both';
}

/**
 * Resolves file paths from @ commands, handling globs, recursion, and ignores.
 */
async function resolveFilePaths(
  fileParts: AtCommandPart[],
  config: Config,
  onDebugMessage: (message: string) => void,
  signal: AbortSignal,
): Promise<{ resolvedFiles: ResolvedFile[]; ignoredFiles: IgnoredFile[] }> {
  const fileDiscovery = config.getFileService();
  const respectFileIgnore = config.getFileFilteringOptions();
  const toolRegistry = config.getToolRegistry();
  const globTool = toolRegistry.getTool('glob');

  const resolvedFiles: ResolvedFile[] = [];
  const ignoredFiles: IgnoredFile[] = [];

  for (const part of fileParts) {
    const originalAtPath = part.content;
    const pathName = originalAtPath.substring(1);

    if (!pathName) {
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
      ignoredFiles.push({ path: pathName, reason });
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
      try {
        const absolutePath = path.resolve(dir, pathName);
        const stats = await fs.stat(absolutePath);

        const relativePath = path.isAbsolute(pathName)
          ? path.relative(dir, absolutePath)
          : pathName;

        if (stats.isDirectory()) {
          const pathSpec = path.join(relativePath, '**');
          resolvedFiles.push({
            part,
            pathSpec,
            displayLabel: path.isAbsolute(pathName) ? relativePath : pathName,
            absolutePath,
          });
          onDebugMessage(
            `Path ${pathName} resolved to directory, using glob: ${pathSpec}`,
          );
        } else {
          resolvedFiles.push({
            part,
            pathSpec: relativePath,
            displayLabel: path.isAbsolute(pathName) ? relativePath : pathName,
            absolutePath,
          });
          onDebugMessage(
            `Path ${pathName} resolved to file: ${absolutePath}, using relative path: ${relativePath}`,
          );
        }
        break;
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
                  const pathSpec = path.relative(dir, firstMatchAbsolute);
                  resolvedFiles.push({
                    part,
                    pathSpec,
                    displayLabel: path.isAbsolute(pathName)
                      ? pathSpec
                      : pathName,
                  });
                  onDebugMessage(
                    `Glob search for ${pathName} found ${firstMatchAbsolute}, using relative path: ${pathSpec}`,
                  );
                  break;
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
    }
  }

  return { resolvedFiles, ignoredFiles };
}

/**
 * Rebuilds the user query, replacing @ commands with their resolved path specs or agent/resource names.
 */
function constructInitialQuery(
  commandParts: AtCommandPart[],
  resolvedFiles: ResolvedFile[],
): string {
  const replacementMap = new Map<AtCommandPart, string>();
  for (const rf of resolvedFiles) {
    replacementMap.set(rf.part, rf.pathSpec);
  }

  let result = '';
  for (let i = 0; i < commandParts.length; i++) {
    const part = commandParts[i];
    let content = part.content;

    if (part.type === 'atPath') {
      const resolved = replacementMap.get(part);
      content = resolved ? `@${resolved}` : part.content;

      if (i > 0 && result.length > 0 && !result.endsWith(' ')) {
        result += ' ';
      }
    }

    result += content;
  }
  return result.trim();
}

/**
 * Reads content from MCP resources.
 */
async function readMcpResources(
  resourceParts: AtCommandPart[],
  config: Config,
  signal: AbortSignal,
): Promise<{
  parts: PartUnion[];
  displays: IndividualToolCallDisplay[];
  error?: string;
}> {
  const resourceRegistry = config.getResourceRegistry();
  const mcpClientManager = config.getMcpClientManager();
  const parts: PartUnion[] = [];
  const displays: IndividualToolCallDisplay[] = [];

  const resourcePromises = resourceParts.map(async (part) => {
    const uri = part.content.substring(1);
    const resource = resourceRegistry.findResourceByUri(uri);
    if (!resource) {
      // Should not happen as it was categorized as a resource
      return { success: false, parts: [], uri };
    }

    const client = mcpClientManager?.getClient(resource.serverName);
    try {
      if (!client) {
        throw new Error(
          `MCP client for server '${resource.serverName}' is not available or not connected.`,
        );
      }
      const response = await client.readResource(resource.uri, { signal });
      const resourceParts = convertResourceContentsToParts(response);
      return {
        success: true,
        parts: resourceParts,
        uri: resource.uri,
        display: {
          callId: `mcp-resource-${resource.serverName}-${resource.uri}`,
          name: `resources/read (${resource.serverName})`,
          description: resource.uri,
          status: CoreToolCallStatus.Success,
          resultDisplay: `Successfully read resource ${resource.uri}`,
          confirmationDetails: undefined,
        } as IndividualToolCallDisplay,
      };
    } catch (error) {
      return {
        success: false,
        parts: [],
        uri: resource.uri,
        display: {
          callId: `mcp-resource-${resource.serverName}-${resource.uri}`,
          name: `resources/read (${resource.serverName})`,
          description: resource.uri,
          status: CoreToolCallStatus.Error,
          resultDisplay: `Error reading resource ${resource.uri}: ${getErrorMessage(error)}`,
          confirmationDetails: undefined,
        } as IndividualToolCallDisplay,
      };
    }
  });

  const resourceResults = await Promise.all(resourcePromises);
  let hasError = false;

  for (const result of resourceResults) {
    if (result.display) {
      displays.push(result.display);
    }
    if (result.success) {
      parts.push({ text: `\nContent from @${result.uri}:\n` });
      parts.push(...result.parts);
    } else {
      hasError = true;
    }
  }

  if (hasError) {
    const firstError = displays.find(
      (d) => d.status === CoreToolCallStatus.Error,
    );
    return {
      parts: [],
      displays,
      error: `Exiting due to an error processing the @ command: ${firstError?.resultDisplay}`,
    };
  }

  return { parts, displays };
}

/**
 * Reads content from local files using the ReadManyFilesTool.
 */
async function readLocalFiles(
  resolvedFiles: ResolvedFile[],
  config: Config,
  signal: AbortSignal,
  userMessageTimestamp: number,
): Promise<{
  parts: PartUnion[];
  display?: IndividualToolCallDisplay;
  error?: string;
}> {
  if (resolvedFiles.length === 0) {
    return { parts: [] };
  }

  const readManyFilesTool = new ReadManyFilesTool(
    config,
    config.getMessageBus(),
  );

  const pathSpecsToRead = resolvedFiles.map((rf) => rf.pathSpec);
  const fileLabelsForDisplay = resolvedFiles.map((rf) => rf.displayLabel);
  const respectFileIgnore = config.getFileFilteringOptions();

  const toolArgs = {
    include: pathSpecsToRead,
    file_filtering_options: {
      respect_git_ignore: respectFileIgnore.respectGitIgnore,
      respect_gemini_ignore: respectFileIgnore.respectGeminiIgnore,
    },
  };

  let invocation: AnyToolInvocation | undefined = undefined;
  try {
    invocation = readManyFilesTool.build(toolArgs);
    const result = await invocation.execute(signal);
    const display: IndividualToolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description: invocation.getDescription(),
      status: CoreToolCallStatus.Success,
      resultDisplay:
        result.returnDisplay ||
        `Successfully read: ${fileLabelsForDisplay.join(', ')}`,
      confirmationDetails: undefined,
    };

    const parts: PartUnion[] = [];
    if (Array.isArray(result.llmContent)) {
      const fileContentRegex = /^--- (.*?) ---\n\n([\s\S]*?)\n\n$/;
      for (const part of result.llmContent) {
        if (typeof part === 'string') {
          const match = fileContentRegex.exec(part);
          if (match) {
            const filePathSpecInContent = match[1];
            const fileActualContent = match[2].trim();

            // Find the display label for this path
            const resolvedFile = resolvedFiles.find(
              (rf) =>
                rf.absolutePath === filePathSpecInContent ||
                rf.pathSpec === filePathSpecInContent,
            );

            let displayPath = resolvedFile?.displayLabel;

            if (!displayPath) {
              // Fallback: if no mapping found, try to convert absolute path to relative
              for (const dir of config.getWorkspaceContext().getDirectories()) {
                if (filePathSpecInContent.startsWith(dir)) {
                  displayPath = path.relative(dir, filePathSpecInContent);
                  break;
                }
              }
            }

            displayPath = displayPath || filePathSpecInContent;

            parts.push({
              text: `\nContent from @${displayPath}:\n`,
            });
            parts.push({ text: fileActualContent });
          } else {
            parts.push({ text: part });
          }
        } else {
          parts.push(part);
        }
      }
    }

    return { parts, display };
  } catch (error: unknown) {
    const errorDisplay: IndividualToolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      description:
        invocation?.getDescription() ??
        'Error attempting to execute tool to read files',
      status: CoreToolCallStatus.Error,
      resultDisplay: `Error reading files (${fileLabelsForDisplay.join(', ')}): ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };
    return {
      parts: [],
      display: errorDisplay,
      error: `Exiting due to an error processing the @ command: ${errorDisplay.resultDisplay}`,
    };
  }
}

/**
 * Reports ignored files to the debug log and debug message callback.
 */
function reportIgnoredFiles(
  ignoredFiles: IgnoredFile[],
  onDebugMessage: (message: string) => void,
): void {
  const totalIgnored = ignoredFiles.length;
  if (totalIgnored === 0) {
    return;
  }

  const ignoredByReason: Record<string, string[]> = {
    git: [],
    gemini: [],
    both: [],
  };

  for (const file of ignoredFiles) {
    ignoredByReason[file.reason].push(file.path);
  }

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
  const commandParts = parseAllAtCommands(query);

  const { agentParts, resourceParts, fileParts } = categorizeAtCommands(
    commandParts,
    config,
  );

  const { resolvedFiles, ignoredFiles } = await resolveFilePaths(
    fileParts,
    config,
    onDebugMessage,
    signal,
  );

  reportIgnoredFiles(ignoredFiles, onDebugMessage);

  if (
    resolvedFiles.length === 0 &&
    resourceParts.length === 0 &&
    agentParts.length === 0
  ) {
    onDebugMessage(
      'No valid file paths, resources, or agents found in @ commands.',
    );
    return { processedQuery: [{ text: query }] };
  }

  const initialQueryText = constructInitialQuery(commandParts, resolvedFiles);

  const processedQueryParts: PartListUnion = [{ text: initialQueryText }];

  if (agentParts.length > 0) {
    const agentNames = agentParts.map((p) => p.content.substring(1));
    const toolsList = agentNames.map((agent) => `'${agent}'`).join(', ');
    const agentNudge = `\n<system_note>\nThe user has explicitly selected the following agent(s): ${agentNames.join(
      ', ',
    )}. Please use the following tool(s) to delegate the task: ${toolsList}.\n</system_note>\n`;
    processedQueryParts.push({ text: agentNudge });
  }

  const [mcpResult, fileResult] = await Promise.all([
    readMcpResources(resourceParts, config, signal),
    readLocalFiles(resolvedFiles, config, signal, userMessageTimestamp),
  ]);

  const hasContent = mcpResult.parts.length > 0 || fileResult.parts.length > 0;
  if (hasContent) {
    processedQueryParts.push({ text: REF_CONTENT_HEADER });
    processedQueryParts.push(...mcpResult.parts);
    processedQueryParts.push(...fileResult.parts);

    // Only add footer if we didn't read local files (because ReadManyFilesTool adds it)
    // AND we read MCP resources (so we need to close the block).
    if (fileResult.parts.length === 0 && mcpResult.parts.length > 0) {
      processedQueryParts.push({ text: REF_CONTENT_FOOTER });
    }
  }

  const allDisplays = [
    ...mcpResult.displays,
    ...(fileResult.display ? [fileResult.display] : []),
  ];

  if (allDisplays.length > 0) {
    addItem(
      {
        type: 'tool_group',
        tools: allDisplays,
      } as HistoryItemToolGroup,
      userMessageTimestamp,
    );
  }

  if (mcpResult.error) {
    debugLogger.error(mcpResult.error);
    return { processedQuery: null, error: mcpResult.error };
  }
  if (fileResult.error) {
    debugLogger.error(fileResult.error);
    return { processedQuery: null, error: fileResult.error };
  }

  return { processedQuery: processedQueryParts };
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
  return (response.contents ?? []).flatMap((content) => {
    const candidate = content.resource ?? content;
    if (candidate.text) {
      return [{ text: candidate.text }];
    }
    if (candidate.blob) {
      const sizeBytes = Buffer.from(candidate.blob, 'base64').length;
      const mimeType = candidate.mimeType ?? 'application/octet-stream';
      return [
        {
          text: `[Binary resource content ${mimeType}, ${sizeBytes} bytes]`,
        },
      ];
    }
    return [];
  });
}
