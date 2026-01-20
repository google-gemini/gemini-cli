/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  GeminiChat,
  ToolResult,
  ToolCallConfirmationDetails,
  FilterFilesOptions,
} from '@google/gemini-cli-core';
import {
  AuthType,
  logToolCall,
  convertToFunctionResponse,
  ToolConfirmationOutcome,
  clearCachedCredentialFile,
  isNodeError,
  getErrorMessage,
  isWithinRoot,
  getErrorStatus,
  MCPServerConfig,
  DiscoveredMCPTool,
  StreamEventType,
  ToolCallEvent,
  debugLogger,
  ReadManyFilesTool,
  resolveModel,
  createWorkingStdio,
  startupProfiler,
} from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';
import { AcpFileSystemService } from './fileSystemService.js';
import { Readable, Writable } from 'node:stream';
import type { Content, Part, FunctionCall } from '@google/genai';
import type { LoadedSettings } from '../config/settings.js';
import { SettingScope } from '../config/settings.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';

import { randomUUID } from 'node:crypto';
import type { CliArgs } from '../config/config.js';
import { loadCliConfig } from '../config/config.js';
import { runExitCleanup } from '../utils/cleanup.js';

export async function runZedIntegration(
  config: Config,
  settings: LoadedSettings,
  argv: CliArgs,
) {
  const { stdout: workingStdout } = createWorkingStdio();
  const stdout = Writable.toWeb(workingStdout) as WritableStream;
  const stdin = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;

  const stream = acp.ndJsonStream(stdout, stdin);
  const connection = new acp.AgentSideConnection(
    (connection) => new GeminiAgent(config, settings, argv, connection),
    stream,
  );

  // SIGTERM/SIGINT handlers (in sdk.ts) don't fire when stdin closes.
  // We must explicitly await the connection close to flush telemetry.
  // Use finally() to ensure cleanup runs even on stream errors.
  await connection.closed.finally(runExitCleanup);
}

export class GeminiAgent {
  private sessions: Map<string, Session> = new Map();
  private clientCapabilities: acp.ClientCapabilities | undefined;

  constructor(
    private config: Config,
    private settings: LoadedSettings,
    private argv: CliArgs,
    private connection: acp.AgentSideConnection,
  ) {}

  async initialize(
    args: acp.InitializeRequest,
  ): Promise<acp.InitializeResponse> {
    this.clientCapabilities = args.clientCapabilities;
    const authMethods = [
      {
        id: AuthType.LOGIN_WITH_GOOGLE,
        name: 'Log in with Google',
        description: null,
      },
      {
        id: AuthType.USE_GEMINI,
        name: 'Use Gemini API key',
        description:
          'Requires setting the `GEMINI_API_KEY` environment variable',
      },
      {
        id: AuthType.USE_VERTEX_AI,
        name: 'Vertex AI',
        description: null,
      },
    ];

    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      authMethods,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: {
          image: true,
          audio: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
      },
    };
  }

  async authenticate({ methodId }: acp.AuthenticateRequest): Promise<void> {
    const method = z.nativeEnum(AuthType).parse(methodId);
    const selectedAuthType = this.settings.merged.security.auth.selectedType;

    // Only clear credentials when switching to a different auth method
    if (selectedAuthType && selectedAuthType !== method) {
      await clearCachedCredentialFile();
    }

    // Refresh auth with the requested method
    // This will reuse existing credentials if they're valid,
    // or perform new authentication if needed
    await this.config.refreshAuth(method);
    this.settings.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      method,
    );
  }

  async newSession({
    cwd,
    mcpServers,
  }: acp.NewSessionRequest): Promise<acp.NewSessionResponse> {
    const sessionId = randomUUID();
    const config = await this.newSessionConfig(sessionId, cwd, mcpServers);

    let isAuthenticated = false;
    if (this.settings.merged.security.auth.selectedType) {
      try {
        await config.refreshAuth(
          this.settings.merged.security.auth.selectedType,
        );
        isAuthenticated = true;
      } catch (e) {
        debugLogger.error(`Authentication failed: ${e}`);
      }
    }

    if (!isAuthenticated) {
      throw acp.RequestError.authRequired();
    }

    if (this.clientCapabilities?.fs) {
      const acpFileSystemService = new AcpFileSystemService(
        this.connection,
        sessionId,
        this.clientCapabilities.fs,
        config.getFileSystemService(),
      );
      config.setFileSystemService(acpFileSystemService);
    }

    const geminiClient = config.getGeminiClient();
    const chat = await geminiClient.startChat();
    const session = new Session(sessionId, chat, config, this.connection);
    this.sessions.set(sessionId, session);

    return {
      sessionId,
    };
  }

  async newSessionConfig(
    sessionId: string,
    cwd: string,
    mcpServers: acp.McpServer[],
  ): Promise<Config> {
    const mergedMcpServers = { ...this.settings.merged.mcpServers };

    for (const server of mcpServers) {
      if (
        'type' in server &&
        (server.type === 'sse' || server.type === 'http')
      ) {
        // HTTP or SSE MCP server
        const headers = Object.fromEntries(
          server.headers.map(({ name, value }) => [name, value]),
        );
        mergedMcpServers[server.name] = new MCPServerConfig(
          undefined, // command
          undefined, // args
          undefined, // env
          undefined, // cwd
          server.type === 'sse' ? server.url : undefined, // url (sse)
          server.type === 'http' ? server.url : undefined, // httpUrl
          headers,
        );
      } else if ('command' in server) {
        // Stdio MCP server
        const env: Record<string, string> = {};
        for (const { name: envName, value } of server.env) {
          env[envName] = value;
        }
        mergedMcpServers[server.name] = new MCPServerConfig(
          server.command,
          server.args,
          env,
          cwd,
        );
      }
    }

    const settings = { ...this.settings.merged, mcpServers: mergedMcpServers };

    const config = await loadCliConfig(settings, sessionId, this.argv, { cwd });

    await config.initialize();
    startupProfiler.flush(config);
    return config;
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }
    await session.cancelPendingPrompt();
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }
    return session.prompt(params);
  }
}

export class Session {
  private pendingPrompt: AbortController | null = null;

  constructor(
    private readonly id: string,
    private readonly chat: GeminiChat,
    private readonly config: Config,
    private readonly connection: acp.AgentSideConnection,
  ) {}

  async cancelPendingPrompt(): Promise<void> {
    if (!this.pendingPrompt) {
      throw new Error('Not currently generating');
    }

    this.pendingPrompt.abort();
    this.pendingPrompt = null;
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    this.pendingPrompt?.abort();
    const pendingSend = new AbortController();
    this.pendingPrompt = pendingSend;

    const promptId = Math.random().toString(16).slice(2);
    const chat = this.chat;

    const parts = await this.#resolvePrompt(params.prompt, pendingSend.signal);

    let nextMessage: Content | null = { role: 'user', parts };

    while (nextMessage !== null) {
      if (pendingSend.signal.aborted) {
        chat.addHistory(nextMessage);
        return { stopReason: 'cancelled' };
      }

      const functionCalls: FunctionCall[] = [];

      try {
        const model = resolveModel(
          this.config.getModel(),
          this.config.getPreviewFeatures(),
        );
        const responseStream = await chat.sendMessageStream(
          { model },
          nextMessage?.parts ?? [],
          promptId,
          pendingSend.signal,
        );
        nextMessage = null;

        for await (const resp of responseStream) {
          if (pendingSend.signal.aborted) {
            return { stopReason: 'cancelled' };
          }

          if (
            resp.type === StreamEventType.CHUNK &&
            resp.value.candidates &&
            resp.value.candidates.length > 0
          ) {
            const candidate = resp.value.candidates[0];
            for (const part of candidate.content?.parts ?? []) {
              if (!part.text) {
                continue;
              }

              const content: acp.ContentBlock = {
                type: 'text',
                text: part.text,
              };

              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              this.sendUpdate({
                sessionUpdate: part.thought
                  ? 'agent_thought_chunk'
                  : 'agent_message_chunk',
                content,
              });
            }
          }

          if (resp.type === StreamEventType.CHUNK && resp.value.functionCalls) {
            functionCalls.push(...resp.value.functionCalls);
          }
        }

        if (pendingSend.signal.aborted) {
          return { stopReason: 'cancelled' };
        }
      } catch (error) {
        if (getErrorStatus(error) === 429) {
          throw new acp.RequestError(
            429,
            'Rate limit exceeded. Try again later.',
          );
        }

        if (
          pendingSend.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return { stopReason: 'cancelled' };
        }

        throw error;
      }

      if (functionCalls.length > 0) {
        const toolResponseParts: Part[] = [];

        for (const fc of functionCalls) {
          const response = await this.runTool(pendingSend.signal, promptId, fc);
          toolResponseParts.push(...response);
        }

        nextMessage = { role: 'user', parts: toolResponseParts };
      }
    }

    return { stopReason: 'end_turn' };
  }

  private async sendUpdate(
    update: acp.SessionNotification['update'],
  ): Promise<void> {
    const params: acp.SessionNotification = {
      sessionId: this.id,
      update,
    };

    await this.connection.sessionUpdate(params);
  }

  private async runTool(
    abortSignal: AbortSignal,
    promptId: string,
    fc: FunctionCall,
  ): Promise<Part[]> {
    const callId = fc.id ?? `${fc.name}-${Date.now()}`;
    const args = fc.args ?? {};

    const startTime = Date.now();

    const errorResponse = (error: Error) => {
      const durationMs = Date.now() - startTime;
      logToolCall(
        this.config,
        new ToolCallEvent(
          undefined,
          fc.name ?? '',
          args,
          durationMs,
          false,
          promptId,
          typeof tool !== 'undefined' && tool instanceof DiscoveredMCPTool
            ? 'mcp'
            : 'native',
          error.message,
        ),
      );

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

    const toolRegistry = this.config.getToolRegistry();
    const tool = toolRegistry.getTool(fc.name);

    if (!tool) {
      return errorResponse(
        new Error(`Tool "${fc.name}" not found in registry.`),
      );
    }

    try {
      const invocation = tool.build(args);

      const confirmationDetails =
        await invocation.shouldConfirmExecute(abortSignal);

      if (confirmationDetails) {
        const content: acp.ToolCallContent[] = [];

        if (confirmationDetails.type === 'edit') {
          content.push({
            type: 'diff',
            path: confirmationDetails.fileName,
            oldText: confirmationDetails.originalContent,
            newText: confirmationDetails.newContent,
          });
        }

        const params: acp.RequestPermissionRequest = {
          sessionId: this.id,
          options: toPermissionOptions(confirmationDetails),
          toolCall: {
            toolCallId: callId,
            status: 'pending',
            title: invocation.getDescription(),
            content,
            locations: invocation.toolLocations(),
            kind: tool.kind,
          },
        };

        const output = await this.connection.requestPermission(params);
        const outcome =
          output.outcome.outcome === 'cancelled'
            ? ToolConfirmationOutcome.Cancel
            : z
                .nativeEnum(ToolConfirmationOutcome)
                .parse(output.outcome.optionId);

        await confirmationDetails.onConfirm(outcome);

        switch (outcome) {
          case ToolConfirmationOutcome.Cancel:
            return errorResponse(
              new Error(`Tool "${fc.name}" was canceled by the user.`),
            );
          case ToolConfirmationOutcome.ProceedOnce:
          case ToolConfirmationOutcome.ProceedAlways:
          case ToolConfirmationOutcome.ProceedAlwaysAndSave:
          case ToolConfirmationOutcome.ProceedAlwaysServer:
          case ToolConfirmationOutcome.ProceedAlwaysTool:
          case ToolConfirmationOutcome.ModifyWithEditor:
            break;
          default: {
            const resultOutcome: never = outcome;
            throw new Error(`Unexpected: ${resultOutcome}`);
          }
        }
      } else {
        await this.sendUpdate({
          sessionUpdate: 'tool_call',
          toolCallId: callId,
          status: 'in_progress',
          title: invocation.getDescription(),
          content: [],
          locations: invocation.toolLocations(),
          kind: tool.kind,
        });
      }

      const toolResult: ToolResult = await invocation.execute(abortSignal);
      const content = toToolCallContent(toolResult);

      await this.sendUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: callId,
        status: 'completed',
        content: content ? [content] : [],
      });

      const durationMs = Date.now() - startTime;
      logToolCall(
        this.config,
        new ToolCallEvent(
          undefined,
          fc.name ?? '',
          args,
          durationMs,
          true,
          promptId,
          typeof tool !== 'undefined' && tool instanceof DiscoveredMCPTool
            ? 'mcp'
            : 'native',
        ),
      );

      return convertToFunctionResponse(
        fc.name,
        callId,
        toolResult.llmContent,
        this.config.getActiveModel(),
      );
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));

      await this.sendUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: callId,
        status: 'failed',
        content: [
          { type: 'content', content: { type: 'text', text: error.message } },
        ],
      });

      return errorResponse(error);
    }
  }

  async #resolvePrompt(
    message: acp.ContentBlock[],
    abortSignal: AbortSignal,
  ): Promise<Part[]> {
    const FILE_URI_SCHEME = 'file://';

    const embeddedContext: acp.EmbeddedResourceResource[] = [];

    const parts = message.map((part) => {
      switch (part.type) {
        case 'text':
          return { text: part.text };
        case 'image':
        case 'audio':
          return {
            inlineData: {
              mimeType: part.mimeType,
              data: part.data,
            },
          };
        case 'resource_link': {
          if (part.uri.startsWith(FILE_URI_SCHEME)) {
            return {
              fileData: {
                mimeData: part.mimeType,
                name: part.name,
                fileUri: part.uri.slice(FILE_URI_SCHEME.length),
              },
            };
          } else {
            return { text: `@${part.uri}` };
          }
        }
        case 'resource': {
          embeddedContext.push(part.resource);
          return { text: `@${part.resource.uri}` };
        }
        default: {
          const unreachable: never = part;
          throw new Error(`Unexpected chunk type: '${unreachable}'`);
        }
      }
    });

    const atPathCommandParts = parts.filter((part) => 'fileData' in part);

    if (atPathCommandParts.length === 0 && embeddedContext.length === 0) {
      return parts;
    }

    const atPathToResolvedSpecMap = new Map<string, string>();

    // Get centralized file discovery service
    const fileDiscovery = this.config.getFileService();
    const fileFilteringOptions: FilterFilesOptions =
      this.config.getFileFilteringOptions();

    const pathSpecsToRead: string[] = [];
    const contentLabelsForDisplay: string[] = [];
    const ignoredPaths: string[] = [];

    const toolRegistry = this.config.getToolRegistry();
    const readManyFilesTool = new ReadManyFilesTool(
      this.config,
      this.config.getMessageBus(),
    );
    const globTool = toolRegistry.getTool('glob');

    if (!readManyFilesTool) {
      throw new Error('Error: read_many_files tool not found.');
    }

    for (const atPathPart of atPathCommandParts) {
      const pathName = atPathPart.fileData!.fileUri;
      // Check if path should be ignored
      if (fileDiscovery.shouldIgnoreFile(pathName, fileFilteringOptions)) {
        ignoredPaths.push(pathName);
        debugLogger.warn(`Path ${pathName} is ignored and will be skipped.`);
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
            this.debug(
              `Path ${pathName} resolved to directory, using glob: ${currentPathSpec}`,
            );
          } else {
            this.debug(`Path ${pathName} resolved to file: ${currentPathSpec}`);
          }
          resolvedSuccessfully = true;
        } else {
          this.debug(
            `Path ${pathName} is outside the project directory. Skipping.`,
          );
        }
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          if (this.config.getEnableRecursiveFileSearch() && globTool) {
            this.debug(
              `Path ${pathName} not found directly, attempting glob search.`,
            );
            try {
              const globResult = await globTool.buildAndExecute(
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
                  this.debug(
                    `Glob search for ${pathName} found ${firstMatchAbsolute}, using relative path: ${currentPathSpec}`,
                  );
                  resolvedSuccessfully = true;
                } else {
                  this.debug(
                    `Glob search for '**/*${pathName}*' did not return a usable path. Path ${pathName} will be skipped.`,
                  );
                }
              } else {
                this.debug(
                  `Glob search for '**/*${pathName}*' found no files or an error. Path ${pathName} will be skipped.`,
                );
              }
            } catch (globError) {
              debugLogger.error(
                `Error during glob search for ${pathName}: ${getErrorMessage(globError)}`,
              );
            }
          } else {
            this.debug(
              `Glob tool not found. Path ${pathName} will be skipped.`,
            );
          }
        } else {
          debugLogger.error(
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
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i];
      if ('text' in chunk) {
        initialQueryText += chunk.text;
      } else {
        // type === 'atPath'
        const resolvedSpec =
          chunk.fileData && atPathToResolvedSpecMap.get(chunk.fileData.fileUri);
        if (
          i > 0 &&
          initialQueryText.length > 0 &&
          !initialQueryText.endsWith(' ') &&
          resolvedSpec
        ) {
          // Add space if previous part was text and didn't end with space, or if previous was @path
          const prevPart = parts[i - 1];
          if (
            'text' in prevPart ||
            ('fileData' in prevPart &&
              atPathToResolvedSpecMap.has(prevPart.fileData!.fileUri))
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
            !chunk.fileData?.fileUri.startsWith(' ')
          ) {
            initialQueryText += ' ';
          }
          if (chunk.fileData?.fileUri) {
            initialQueryText += `@${chunk.fileData.fileUri}`;
          }
        }
      }
    }
    initialQueryText = initialQueryText.trim();
    // Inform user about ignored paths
    if (ignoredPaths.length > 0) {
      this.debug(
        `Ignored ${ignoredPaths.length} files: ${ignoredPaths.join(', ')}`,
      );
    }

    const processedQueryParts: Part[] = [{ text: initialQueryText }];

    if (pathSpecsToRead.length === 0 && embeddedContext.length === 0) {
      // Fallback for lone "@" or completely invalid @-commands resulting in empty initialQueryText
      debugLogger.warn('No valid file paths found in @ commands to read.');
      return [{ text: initialQueryText }];
    }

    if (pathSpecsToRead.length > 0) {
      const toolArgs = {
        include: pathSpecsToRead,
      };

      const callId = `${readManyFilesTool.name}-${Date.now()}`;

      try {
        const invocation = readManyFilesTool.build(toolArgs);

        await this.sendUpdate({
          sessionUpdate: 'tool_call',
          toolCallId: callId,
          status: 'in_progress',
          title: invocation.getDescription(),
          content: [],
          locations: invocation.toolLocations(),
          kind: readManyFilesTool.kind,
        });

        const result = await invocation.execute(abortSignal);
        const content = toToolCallContent(result) || {
          type: 'content',
          content: {
            type: 'text',
            text: `Successfully read: ${contentLabelsForDisplay.join(', ')}`,
          },
        };
        await this.sendUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: callId,
          status: 'completed',
          content: content ? [content] : [],
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
        } else {
          debugLogger.warn(
            'read_many_files tool returned no content or empty content.',
          );
        }
      } catch (error: unknown) {
        await this.sendUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: callId,
          status: 'failed',
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: `Error reading files (${contentLabelsForDisplay.join(', ')}): ${getErrorMessage(error)}`,
              },
            },
          ],
        });

        throw error;
      }
    }

    if (embeddedContext.length > 0) {
      processedQueryParts.push({
        text: '\n--- Content from referenced context ---',
      });

      for (const contextPart of embeddedContext) {
        processedQueryParts.push({
          text: `\nContent from @${contextPart.uri}:\n`,
        });
        if ('text' in contextPart) {
          processedQueryParts.push({
            text: contextPart.text,
          });
        } else {
          processedQueryParts.push({
            inlineData: {
              mimeType: contextPart.mimeType ?? 'application/octet-stream',
              data: contextPart.blob,
            },
          });
        }
      }
    }

    return processedQueryParts;
  }

  debug(msg: string) {
    if (this.config.getDebugMode()) {
      debugLogger.warn(msg);
    }
  }
}

function toToolCallContent(toolResult: ToolResult): acp.ToolCallContent | null {
  if (toolResult.error?.message) {
    throw new Error(toolResult.error.message);
  }

  if (toolResult.returnDisplay) {
    if (typeof toolResult.returnDisplay === 'string') {
      return {
        type: 'content',
        content: { type: 'text', text: toolResult.returnDisplay },
      };
    } else {
      if ('fileName' in toolResult.returnDisplay) {
        return {
          type: 'diff',
          path: toolResult.returnDisplay.fileName,
          oldText: toolResult.returnDisplay.originalContent,
          newText: toolResult.returnDisplay.newContent,
        };
      }
      return null;
    }
  } else {
    return null;
  }
}

const basicPermissionOptions = [
  {
    optionId: ToolConfirmationOutcome.ProceedOnce,
    name: 'Allow',
    kind: 'allow_once',
  },
  {
    optionId: ToolConfirmationOutcome.Cancel,
    name: 'Reject',
    kind: 'reject_once',
  },
] as const;

function toPermissionOptions(
  confirmation: ToolCallConfirmationDetails,
): acp.PermissionOption[] {
  switch (confirmation.type) {
    case 'edit':
      return [
        {
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: 'Allow All Edits',
          kind: 'allow_always',
        },
        ...basicPermissionOptions,
      ];
    case 'exec':
      return [
        {
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: `Always Allow ${confirmation.rootCommand}`,
          kind: 'allow_always',
        },
        ...basicPermissionOptions,
      ];
    case 'mcp':
      return [
        {
          optionId: ToolConfirmationOutcome.ProceedAlwaysServer,
          name: `Always Allow ${confirmation.serverName}`,
          kind: 'allow_always',
        },
        {
          optionId: ToolConfirmationOutcome.ProceedAlwaysTool,
          name: `Always Allow ${confirmation.toolName}`,
          kind: 'allow_always',
        },
        ...basicPermissionOptions,
      ];
    case 'info':
      return [
        {
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: `Always Allow`,
          kind: 'allow_always',
        },
        ...basicPermissionOptions,
      ];
    default: {
      const unreachable: never = confirmation;
      throw new Error(`Unexpected: ${unreachable}`);
    }
  }
}
