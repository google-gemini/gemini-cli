/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WritableStream, ReadableStream } from 'node:stream/web';

import {
  AuthType,
  Config,
  GeminiChat,
  ToolRegistry,
  logToolCall,
  ToolResult,
  convertToFunctionResponse,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  clearCachedCredentialFile,
  isNodeError,
  getErrorMessage,
  isWithinRoot,
  getErrorStatus,
} from '@google/gemini-cli-core';
import * as acp from './acp.js';
import { Agent } from './acp.js';
import { Readable, Writable } from 'node:stream';
import { Content, Part, FunctionCall, PartListUnion } from '@google/genai';
import { LoadedSettings, SettingScope } from '../config/settings.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function runAcpPeer(config: Config, settings: LoadedSettings) {
  const stdout = Writable.toWeb(process.stdout) as WritableStream;
  const stdin = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;

  // Stdout is used to send messages to the client, so console.log/console.info
  // messages to stderr so that they don't interfere with ACP.
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;

  new acp.ClientConnection(
    (client: acp.Client) => new GeminiAgent(config, settings, client),
    stdout,
    stdin,
  );
}

class GeminiAgent implements Agent {
  chat?: GeminiChat;
  pendingSend?: AbortController;

  constructor(
    private config: Config,
    private settings: LoadedSettings,
    private client: acp.Client,
  ) {}

  async initialize(_: acp.InitializeParams): Promise<acp.InitializeResponse> {
    let isAuthenticated = false;
    if (this.settings.merged.selectedAuthType) {
      try {
        await this.config.refreshAuth(this.settings.merged.selectedAuthType);
        isAuthenticated = true;
      } catch (error) {
        console.error('Failed to refresh auth:', error);
      }
    }
    return { protocolVersion: acp.LATEST_PROTOCOL_VERSION, isAuthenticated };
  }

  async authenticate(): Promise<void> {
    await clearCachedCredentialFile();
    await this.config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
    this.settings.setValue(
      SettingScope.User,
      'selectedAuthType',
      AuthType.LOGIN_WITH_GOOGLE,
    );
  }

  async cancelSendMessage(): Promise<void> {
    if (!this.pendingSend) {
      throw new Error('Not currently generating');
    }

    this.pendingSend.abort();
    delete this.pendingSend;
  }

  async sendUserMessage(params: acp.SendUserMessageParams): Promise<void> {
    this.pendingSend?.abort();
    const pendingSend = new AbortController();
    this.pendingSend = pendingSend;

    if (!this.chat) {
      const geminiClient = this.config.getGeminiClient();
      this.chat = await geminiClient.startChat();
    }

    const promptId = Math.random().toString(16).slice(2);
    const chat = this.chat!;
    const toolRegistry: ToolRegistry = await this.config.getToolRegistry();
    const parts = await this.#resolveUserMessage(params, pendingSend.signal);

    let nextMessage: Content | null = { role: 'user', parts };

    while (nextMessage !== null) {
      if (pendingSend.signal.aborted) {
        chat.addHistory(nextMessage);
        return;
      }

      const functionCalls: FunctionCall[] = [];

      try {
        const responseStream = await chat.sendMessageStream(
          {
            message: nextMessage?.parts ?? [],
            config: {
              abortSignal: pendingSend.signal,
              tools: [
                {
                  functionDeclarations: toolRegistry.getFunctionDeclarations(),
                },
              ],
            },
          },
          promptId,
        );
        nextMessage = null;

        for await (const resp of responseStream) {
          if (pendingSend.signal.aborted) {
            return;
          }

          if (resp.candidates && resp.candidates.length > 0) {
            const candidate = resp.candidates[0];
            for (const part of candidate.content?.parts ?? []) {
              if (!part.text) {
                continue;
              }

              this.client.streamAssistantMessageChunk({
                chunk: part.thought
                  ? { thought: part.text }
                  : { text: part.text },
              });
            }
          }

          if (resp.functionCalls) {
            functionCalls.push(...resp.functionCalls);
          }
        }
      } catch (error) {
        if (getErrorStatus(error) === 429) {
          throw new acp.RequestError(
            429,
            'Rate limit exceeded. Try again later.',
          );
        }

        throw error;
      }

      if (functionCalls.length > 0) {
        const toolResponseParts: Part[] = [];

        for (const fc of functionCalls) {
          const response = await this.#runTool(
            pendingSend.signal,
            promptId,
            fc,
          );

          const parts = Array.isArray(response) ? response : [response];

          for (const part of parts) {
            if (typeof part === 'string') {
              toolResponseParts.push({ text: part });
            } else if (part) {
              toolResponseParts.push(part);
            }
          }
        }

        nextMessage = { role: 'user', parts: toolResponseParts };
      }
    }
  }

  async #runTool(
    abortSignal: AbortSignal,
    promptId: string,
    fc: FunctionCall,
  ): Promise<PartListUnion> {
    const callId = fc.id ?? `${fc.name}-${Date.now()}`;
    const args = (fc.args ?? {}) as Record<string, unknown>;

    const startTime = Date.now();

    const errorResponse = (error: Error) => {
      const durationMs = Date.now() - startTime;
      logToolCall(this.config, {
        'event.name': 'tool_call',
        'event.timestamp': new Date().toISOString(),
        prompt_id: promptId,
        function_name: fc.name ?? '',
        function_args: args,
        duration_ms: durationMs,
        success: false,
        error: error.message,
      });

      return [
        {
          functionResponse: {
            id: callId,
            name: fc.name ?? '',
            response: { error: error.message },
          },
        },
      ];
    };

    if (!fc.name) {
      return errorResponse(new Error('Missing function name'));
    }

    const toolRegistry: ToolRegistry = await this.config.getToolRegistry();
    const tool = toolRegistry.getTool(fc.name as string);

    if (!tool) {
      return errorResponse(
        new Error(`Tool "${fc.name}" not found in registry.`),
      );
    }

    let toolCallId;
    const confirmationDetails = await tool.shouldConfirmExecute(
      args,
      abortSignal,
    );
    if (confirmationDetails) {
      let content: acp.ToolCallContent | null = null;
      if (confirmationDetails.type === 'edit') {
        content = {
          type: 'diff',
          path: confirmationDetails.fileName,
          oldText: confirmationDetails.originalContent,
          newText: confirmationDetails.newContent,
        };
      }

      const result = await this.client.requestToolCallConfirmation({
        label: tool.getDescription(args),
        icon: tool.icon,
        content,
        confirmation: toAcpToolCallConfirmation(confirmationDetails),
        locations: tool.toolLocations(args),
      });

      await confirmationDetails.onConfirm(toToolCallOutcome(result.outcome));
      switch (result.outcome) {
        case 'reject':
          return errorResponse(
            new Error(`Tool "${fc.name}" not allowed to run by the user.`),
          );

        case 'cancel':
          return errorResponse(
            new Error(`Tool "${fc.name}" was canceled by the user.`),
          );
        case 'allow':
        case 'alwaysAllow':
        case 'alwaysAllowMcpServer':
        case 'alwaysAllowTool':
          break;
        default: {
          const resultOutcome: never = result.outcome;
          throw new Error(`Unexpected: ${resultOutcome}`);
        }
      }

      toolCallId = result.id;
    } else {
      const result = await this.client.pushToolCall({
        icon: tool.icon,
        label: tool.getDescription(args),
        locations: tool.toolLocations(args),
      });

      toolCallId = result.id;
    }

    try {
      const toolResult: ToolResult = await tool.execute(args, abortSignal);
      const toolCallContent = toToolCallContent(toolResult);

      await this.client.updateToolCall({
        toolCallId,
        status: 'finished',
        content: toolCallContent,
      });

      const durationMs = Date.now() - startTime;
      logToolCall(this.config, {
        'event.name': 'tool_call',
        'event.timestamp': new Date().toISOString(),
        function_name: fc.name,
        function_args: args,
        duration_ms: durationMs,
        success: true,
        prompt_id: promptId,
      });

      return convertToFunctionResponse(fc.name, callId, toolResult.llmContent);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      await this.client.updateToolCall({
        toolCallId,
        status: 'error',
        content: { type: 'markdown', markdown: error.message },
      });

      return errorResponse(error);
    }
  }

  async #resolveUserMessage(
    message: acp.SendUserMessageParams,
    abortSignal: AbortSignal,
  ): Promise<Part[]> {
    const atPathCommandParts = message.chunks.filter((part) => 'path' in part);

    if (atPathCommandParts.length === 0) {
      return message.chunks.map((chunk) => {
        if ('text' in chunk) {
          return { text: chunk.text };
        } else {
          throw new Error('Unexpected chunk type');
        }
      });
    }

    // Get centralized file discovery service
    const fileDiscovery = this.config.getFileService();
    const respectGitIgnore = this.config.getFileFilteringRespectGitIgnore();

    const pathSpecsToRead: string[] = [];
    const atPathToResolvedSpecMap = new Map<string, string>();
    const contentLabelsForDisplay: string[] = [];
    const ignoredPaths: string[] = [];

    const toolRegistry = await this.config.getToolRegistry();
    const readManyFilesTool = toolRegistry.getTool('read_many_files');
    const globTool = toolRegistry.getTool('glob');

    if (!readManyFilesTool) {
      throw new Error('Error: read_many_files tool not found.');
    }

    for (const atPathPart of atPathCommandParts) {
      const pathName = atPathPart.path;

      // Check if path should be ignored by git
      if (fileDiscovery.shouldGitIgnoreFile(pathName)) {
        ignoredPaths.push(pathName);
        const reason = respectGitIgnore
          ? 'git-ignored and will be skipped'
          : 'ignored by custom patterns';
        console.warn(`Path ${pathName} is ${reason}.`);
        continue;
      }

      let currentPathSpec = pathName;
      let resolvedSuccessfully = false;

      try {
        const absolutePath = path.resolve(this.config.getTargetDir(), pathName);
        if (isWithinRoot(absolutePath, this.config.getTargetDir())) {
          const stats = await fs.stat(absolutePath);
          if (stats.isDirectory()) {
            currentPathSpec = pathName.endsWith('/')
              ? `${pathName}**`
              : `${pathName}/**`;
            this.#debug(
              `Path ${pathName} resolved to directory, using glob: ${currentPathSpec}`,
            );
          } else {
            this.#debug(
              `Path ${pathName} resolved to file: ${currentPathSpec}`,
            );
          }
          resolvedSuccessfully = true;
        } else {
          this.#debug(
            `Path ${pathName} is outside the project directory. Skipping.`,
          );
        }
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          if (this.config.getEnableRecursiveFileSearch() && globTool) {
            this.#debug(
              `Path ${pathName} not found directly, attempting glob search.`,
            );
            try {
              const globResult = await globTool.execute(
                {
                  pattern: `**/*${pathName}*`,
                  path: this.config.getTargetDir(),
                },
                abortSignal,
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
                    this.config.getTargetDir(),
                    firstMatchAbsolute,
                  );
                  this.#debug(
                    `Glob search for ${pathName} found ${firstMatchAbsolute}, using relative path: ${currentPathSpec}`,
                  );
                  resolvedSuccessfully = true;
                } else {
                  this.#debug(
                    `Glob search for '**/*${pathName}*' did not return a usable path. Path ${pathName} will be skipped.`,
                  );
                }
              } else {
                this.#debug(
                  `Glob search for '**/*${pathName}*' found no files or an error. Path ${pathName} will be skipped.`,
                );
              }
            } catch (globError) {
              console.error(
                `Error during glob search for ${pathName}: ${getErrorMessage(globError)}`,
              );
            }
          } else {
            this.#debug(
              `Glob tool not found. Path ${pathName} will be skipped.`,
            );
          }
        } else {
          console.error(
            `Error stating path ${pathName}. Path ${pathName} will be skipped.`,
          );
        }
      }

      if (resolvedSuccessfully) {
        pathSpecsToRead.push(currentPathSpec);
        atPathToResolvedSpecMap.set(pathName, currentPathSpec);
        contentLabelsForDisplay.push(pathName);
      }
    }

    // Construct the initial part of the query for the LLM
    let initialQueryText = '';
    for (let i = 0; i < message.chunks.length; i++) {
      const chunk = message.chunks[i];
      if ('text' in chunk) {
        initialQueryText += chunk.text;
      } else {
        // type === 'atPath'
        const resolvedSpec = atPathToResolvedSpecMap.get(chunk.path);
        if (
          i > 0 &&
          initialQueryText.length > 0 &&
          !initialQueryText.endsWith(' ') &&
          resolvedSpec
        ) {
          // Add space if previous part was text and didn't end with space, or if previous was @path
          const prevPart = message.chunks[i - 1];
          if (
            'text' in prevPart ||
            ('path' in prevPart && atPathToResolvedSpecMap.has(prevPart.path))
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
            !chunk.path.startsWith(' ')
          ) {
            initialQueryText += ' ';
          }
          initialQueryText += `@${chunk.path}`;
        }
      }
    }
    initialQueryText = initialQueryText.trim();

    // Inform user about ignored paths
    if (ignoredPaths.length > 0) {
      const ignoreType = respectGitIgnore ? 'git-ignored' : 'custom-ignored';
      this.#debug(
        `Ignored ${ignoredPaths.length} ${ignoreType} files: ${ignoredPaths.join(', ')}`,
      );
    }

    // Fallback for lone "@" or completely invalid @-commands resulting in empty initialQueryText
    if (pathSpecsToRead.length === 0) {
      console.warn('No valid file paths found in @ commands to read.');
      return [{ text: initialQueryText }];
    }

    const processedQueryParts: Part[] = [{ text: initialQueryText }];

    const toolArgs = {
      paths: pathSpecsToRead,
      respectGitIgnore, // Use configuration setting
    };

    const toolCall = await this.client.pushToolCall({
      icon: readManyFilesTool.icon,
      label: readManyFilesTool.getDescription(toolArgs),
    });
    try {
      const result = await readManyFilesTool.execute(toolArgs, abortSignal);
      const content = toToolCallContent(result) || {
        type: 'markdown',
        markdown: `Successfully read: ${contentLabelsForDisplay.join(', ')}`,
      };
      await this.client.updateToolCall({
        toolCallId: toolCall.id,
        status: 'finished',
        content,
      });

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
        console.warn(
          'read_many_files tool returned no content or empty content.',
        );
      }

      return processedQueryParts;
    } catch (error: unknown) {
      await this.client.updateToolCall({
        toolCallId: toolCall.id,
        status: 'error',
        content: {
          type: 'markdown',
          markdown: `Error reading files (${contentLabelsForDisplay.join(', ')}): ${getErrorMessage(error)}`,
        },
      });
      throw error;
    }
  }

  #debug(msg: string) {
    if (this.config.getDebugMode()) {
      console.warn(msg);
    }
  }
}

function toToolCallContent(toolResult: ToolResult): acp.ToolCallContent | null {
  if (toolResult.returnDisplay) {
    if (typeof toolResult.returnDisplay === 'string') {
      return {
        type: 'markdown',
        markdown: toolResult.returnDisplay,
      };
    } else {
      return {
        type: 'diff',
        path: toolResult.returnDisplay.fileName,
        oldText: toolResult.returnDisplay.originalContent,
        newText: toolResult.returnDisplay.newContent,
      };
    }
  } else {
    return null;
  }
}

function toAcpToolCallConfirmation(
  confirmationDetails: ToolCallConfirmationDetails,
): acp.ToolCallConfirmation {
  switch (confirmationDetails.type) {
    case 'edit':
      return { type: 'edit' };
    case 'exec':
      return {
        type: 'execute',
        rootCommand: confirmationDetails.rootCommand,
        command: confirmationDetails.command,
      };
    case 'mcp':
      return {
        type: 'mcp',
        serverName: confirmationDetails.serverName,
        toolName: confirmationDetails.toolName,
        toolDisplayName: confirmationDetails.toolDisplayName,
      };
    case 'info':
      return {
        type: 'fetch',
        urls: confirmationDetails.urls || [],
        description: confirmationDetails.urls?.length
          ? null
          : confirmationDetails.prompt,
      };
    default: {
      const unreachable: never = confirmationDetails;
      throw new Error(`Unexpected: ${unreachable}`);
    }
  }
}

function toToolCallOutcome(
  outcome: acp.ToolCallConfirmationOutcome,
): ToolConfirmationOutcome {
  switch (outcome) {
    case 'allow':
      return ToolConfirmationOutcome.ProceedOnce;
    case 'alwaysAllow':
      return ToolConfirmationOutcome.ProceedAlways;
    case 'alwaysAllowMcpServer':
      return ToolConfirmationOutcome.ProceedAlwaysServer;
    case 'alwaysAllowTool':
      return ToolConfirmationOutcome.ProceedAlwaysTool;
    case 'reject':
    case 'cancel':
      return ToolConfirmationOutcome.Cancel;
    default: {
      const unreachable: never = outcome;
      throw new Error(`Unexpected: ${unreachable}`);
    }
  }
}
