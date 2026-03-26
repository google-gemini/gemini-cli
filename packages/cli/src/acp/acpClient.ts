/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  type GeminiChat,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type FilterFilesOptions,
  type ConversationRecord,
  CoreToolCallStatus,
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
  REFERENCE_CONTENT_START,
  resolveModel,
  createWorkingStdio,
  startupProfiler,
  Kind,
  partListUnionToString,
  LlmRole,
  ApprovalMode,
  getVersion,
  convertSessionToClientHistory,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL_AUTO,
  getDisplayString,
  processSingleFileContent,
  type AgentLoopContext,
} from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';
import { AcpFileSystemService } from './fileSystemService.js';
import { getAcpErrorMessage } from './acpErrors.js';
import { Readable, Writable } from 'node:stream';

function hasMeta(obj: unknown): obj is { _meta?: Record<string, unknown> } {
  return typeof obj === 'object' && obj !== null && '_meta' in obj;
}
import type { Content, Part, FunctionCall } from '@google/genai';
import {
  SettingScope,
  loadSettings,
  type LoadedSettings,
} from '../config/settings.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';

import { randomUUID } from 'node:crypto';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import { runExitCleanup } from '../utils/cleanup.js';
import { SessionSelector } from '../utils/sessionUtils.js';

import { CommandHandler } from './commandHandler.js';

const RequestPermissionResponseSchema = z.object({
  outcome: z.discriminatedUnion('outcome', [
    z.object({ outcome: z.literal('cancelled') }),
    z.object({
      outcome: z.literal('selected'),
      optionId: z.string(),
    }),
  ]),
});

export async function runAcpClient(
  config: Config,
  settings: LoadedSettings,
  argv: CliArgs,
) {
  // ... (skip unchanged lines) ...

  const { stdout: workingStdout } = createWorkingStdio();
  const stdout = Writable.toWeb(workingStdout) as WritableStream;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
  private static callIdCounter = 0;

  static generateCallId(name: string): string {
    return `${name}-${Date.now()}-${++GeminiAgent.callIdCounter}`;
  }

  private sessions: Map<string, Session> = new Map();
  private clientCapabilities: acp.ClientCapabilities | undefined;
  private apiKey: string | undefined;
  private baseUrl: string | undefined;
  private customHeaders: Record<string, string> | undefined;

  constructor(
    private context: AgentLoopContext,
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
        description: 'Log in with your Google account',
      },
      {
        id: AuthType.USE_GEMINI,
        name: 'Gemini API key',
        description: 'Use an API key with Gemini Developer API',
        _meta: {
          'api-key': {
            provider: 'google',
          },
        },
      },
      {
        id: AuthType.USE_VERTEX_AI,
        name: 'Vertex AI',
        description: 'Use an API key with Vertex AI GenAI API',
      },
      {
        id: AuthType.GATEWAY,
        name: 'AI API Gateway',
        description: 'Use a custom AI API Gateway',
        _meta: {
          gateway: {
            protocol: 'google',
            restartRequired: 'false',
          },
        },
      },
    ];

    await this.context.config.initialize();
    const version = await getVersion();
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      authMethods,
      agentInfo: {
        name: 'gemini-cli',
        title: 'Gemini CLI',
        version,
      },
      agentCapabilities: {
        loadSession: true,
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

  async authenticate(req: acp.AuthenticateRequest): Promise<void> {
    const { methodId } = req;
    const method = z.nativeEnum(AuthType).parse(methodId);
    const selectedAuthType = this.settings.merged.security.auth.selectedType;

    // Only clear credentials when switching to a different auth method
    if (selectedAuthType && selectedAuthType !== method) {
      await clearCachedCredentialFile();
    }
    // Check for api-key in _meta
    const meta = hasMeta(req) ? req._meta : undefined;
    const apiKey =
      typeof meta?.['api-key'] === 'string' ? meta['api-key'] : undefined;

    // Refresh auth with the requested method
    // This will reuse existing credentials if they're valid,
    // or perform new authentication if needed
    try {
      if (apiKey) {
        this.apiKey = apiKey;
      }

      // Extract gateway details if present
      const gatewaySchema = z.object({
        baseUrl: z.string().optional(),
        headers: z.record(z.string()).optional(),
      });

      let baseUrl: string | undefined;
      let headers: Record<string, string> | undefined;

      if (meta?.['gateway']) {
        const result = gatewaySchema.safeParse(meta['gateway']);
        if (result.success) {
          baseUrl = result.data.baseUrl;
          headers = result.data.headers;
        } else {
          throw new acp.RequestError(
            -32602,
            `Malformed gateway payload: ${result.error.message}`,
          );
        }
      }

      this.baseUrl = baseUrl;
      this.customHeaders = headers;

      await this.context.config.refreshAuth(
        method,
        apiKey ?? this.apiKey,
        baseUrl,
        headers,
      );
    } catch (e) {
      throw new acp.RequestError(-32000, getAcpErrorMessage(e));
    }
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
    const loadedSettings = loadSettings(cwd);
    const config = await this.newSessionConfig(
      sessionId,
      cwd,
      mcpServers,
      loadedSettings,
    );

    const authType =
      loadedSettings.merged.security.auth.selectedType || AuthType.USE_GEMINI;

    let isAuthenticated = false;
    let authErrorMessage = '';
    try {
      await config.refreshAuth(
        authType,
        this.apiKey,
        this.baseUrl,
        this.customHeaders,
      );
      isAuthenticated = true;

      // Extra validation for Gemini API key
      const contentGeneratorConfig = config.getContentGeneratorConfig();
      if (
        authType === AuthType.USE_GEMINI &&
        (!contentGeneratorConfig || !contentGeneratorConfig.apiKey)
      ) {
        isAuthenticated = false;
        authErrorMessage = 'Gemini API key is missing or not configured.';
      }
    } catch (e) {
      isAuthenticated = false;
      authErrorMessage = getAcpErrorMessage(e);
      debugLogger.error(
        `Authentication failed: ${e instanceof Error ? e.stack : e}`,
      );
    }

    if (!isAuthenticated) {
      throw new acp.RequestError(
        -32000,
        authErrorMessage || 'Authentication required.',
      );
    }

    if (this.clientCapabilities?.fs) {
      const acpFileSystemService = new AcpFileSystemService(
        this.connection,
        sessionId,
        this.clientCapabilities.fs,
        config.getFileSystemService(),
        cwd,
      );
      config.setFileSystemService(acpFileSystemService);
    }

    await config.initialize();
    startupProfiler.flush(config);

    const geminiClient = config.getGeminiClient();
    const chat = await geminiClient.startChat();
    const session = new Session(
      sessionId,
      chat,
      config,
      this.connection,
      this.settings,
    );
    this.sessions.set(sessionId, session);

    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      session.sendAvailableCommands();
    }, 0);

    const { availableModels, currentModelId } = buildAvailableModels(
      config,
      loadedSettings,
    );

    const response = {
      sessionId,
      modes: {
        availableModes: buildAvailableModes(config.isPlanEnabled()),
        currentModeId: config.getApprovalMode(),
      },
      models: {
        availableModels,
        currentModelId,
      },
    };
    return response;
  }

  async loadSession({
    sessionId,
    cwd,
    mcpServers,
  }: acp.LoadSessionRequest): Promise<acp.LoadSessionResponse> {
    const config = await this.initializeSessionConfig(
      sessionId,
      cwd,
      mcpServers,
    );

    const sessionSelector = new SessionSelector(config);
    const { sessionData, sessionPath } =
      await sessionSelector.resolveSession(sessionId);

    const clientHistory = convertSessionToClientHistory(sessionData.messages);

    const geminiClient = config.getGeminiClient();
    await geminiClient.initialize();
    await geminiClient.resumeChat(clientHistory, {
      conversation: sessionData,
      filePath: sessionPath,
    });

    const session = new Session(
      sessionId,
      geminiClient.getChat(),
      config,
      this.connection,
      this.settings,
    );
    this.sessions.set(sessionId, session);

    // Stream history back to client
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    session.streamHistory(sessionData.messages);

    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      session.sendAvailableCommands();
    }, 0);

    const { availableModels, currentModelId } = buildAvailableModels(
      config,
      this.settings,
    );

    const response = {
      modes: {
        availableModes: buildAvailableModes(config.isPlanEnabled()),
        currentModeId: config.getApprovalMode(),
      },
      models: {
        availableModels,
        currentModelId,
      },
    };
    return response;
  }

  private async initializeSessionConfig(
    sessionId: string,
    cwd: string,
    mcpServers: acp.McpServer[],
  ): Promise<Config> {
    const selectedAuthType = this.settings.merged.security.auth.selectedType;
    if (!selectedAuthType) {
      throw acp.RequestError.authRequired();
    }

    // 1. Create config WITHOUT initializing it (no MCP servers started yet)
    const config = await this.newSessionConfig(sessionId, cwd, mcpServers);

    // 2. Authenticate BEFORE initializing configuration or starting MCP servers.
    // This satisfies the security requirement to verify the user before executing
    // potentially unsafe server definitions.
    try {
      await config.refreshAuth(
        selectedAuthType,
        this.apiKey,
        this.baseUrl,
        this.customHeaders,
      );
    } catch (e) {
      debugLogger.error(`Authentication failed: ${e}`);
      throw acp.RequestError.authRequired();
    }

    // 3. Set the ACP FileSystemService (if supported) before config initialization
    if (this.clientCapabilities?.fs) {
      const acpFileSystemService = new AcpFileSystemService(
        this.connection,
        sessionId,
        this.clientCapabilities.fs,
        config.getFileSystemService(),
        cwd,
      );
      config.setFileSystemService(acpFileSystemService);
    }

    // 4. Now that we are authenticated, it is safe to initialize the config
    // which starts the MCP servers and other heavy resources.
    await config.initialize();
    startupProfiler.flush(config);

    return config;
  }

  async newSessionConfig(
    sessionId: string,
    cwd: string,
    mcpServers: acp.McpServer[],
    loadedSettings?: LoadedSettings,
  ): Promise<Config> {
    const currentSettings = loadedSettings || this.settings;
    const mergedMcpServers = { ...currentSettings.merged.mcpServers };

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

    const settings = {
      ...currentSettings.merged,
      mcpServers: mergedMcpServers,
    };

    const config = await loadCliConfig(settings, sessionId, this.argv, { cwd });

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

  async setSessionMode(
    params: acp.SetSessionModeRequest,
  ): Promise<acp.SetSessionModeResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }
    return session.setMode(params.modeId);
  }

  async unstable_setSessionModel(
    params: acp.SetSessionModelRequest,
  ): Promise<acp.SetSessionModelResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }
    return session.setModel(params.modelId);
  }
}

export class Session {
  private pendingPrompt: AbortController | null = null;
  private commandHandler = new CommandHandler();

  constructor(
    private readonly id: string,
    private readonly chat: GeminiChat,
    private readonly context: AgentLoopContext,
    private readonly connection: acp.AgentSideConnection,
    private readonly settings: LoadedSettings,
  ) {}

  async cancelPendingPrompt(): Promise<void> {
    if (!this.pendingPrompt) {
      throw new Error('Not currently generating');
    }

    this.pendingPrompt.abort();
    this.pendingPrompt = null;
  }

  setMode(modeId: acp.SessionModeId): acp.SetSessionModeResponse {
    const availableModes = buildAvailableModes(
      this.context.config.isPlanEnabled(),
    );
    const mode = availableModes.find((m) => m.id === modeId);
    if (!mode) {
      throw new Error(`Invalid or unavailable mode: ${modeId}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    this.context.config.setApprovalMode(mode.id as ApprovalMode);
    return {};
  }

  private getAvailableCommands() {
    return this.commandHandler.getAvailableCommands();
  }

  async sendAvailableCommands(): Promise<void> {
    const availableCommands = this.getAvailableCommands().map((command) => ({
      name: command.name,
      description: command.description,
    }));

    await this.sendUpdate({
      sessionUpdate: 'available_commands_update',
      availableCommands,
    });
  }

  setModel(modelId: acp.ModelId): acp.SetSessionModelResponse {
    this.context.config.setModel(modelId);
    return {};
  }

  async streamHistory(messages: ConversationRecord['messages']): Promise<void> {
    for (const msg of messages) {
      const contentString = partListUnionToString(msg.content);

      if (msg.type === 'user') {
        if (contentString.trim()) {
          await this.sendUpdate({
            sessionUpdate: 'user_message_chunk',
            content: { type: 'text', text: contentString },
          });
        }
      } else if (msg.type === 'gemini') {
        // Thoughts
        if (msg.thoughts) {
          for (const thought of msg.thoughts) {
            const thoughtText = `**${thought.subject}**\n${thought.description}`;
            await this.sendUpdate({
              sessionUpdate: 'agent_thought_chunk',
              content: { type: 'text', text: thoughtText },
            });
          }
        }

        // Message text
        if (contentString.trim()) {
          await this.sendUpdate({
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: contentString },
          });
        }

        // Tool calls
        if (msg.toolCalls) {
          for (const toolCall of msg.toolCalls) {
            const toolCallContent: acp.ToolCallContent[] = [];
            if (toolCall.resultDisplay) {
              if (typeof toolCall.resultDisplay === 'string') {
                toolCallContent.push({
                  type: 'content',
                  content: { type: 'text', text: toolCall.resultDisplay },
                });
              } else if ('fileName' in toolCall.resultDisplay) {
                toolCallContent.push({
                  type: 'diff',
                  path: toolCall.resultDisplay.fileName,
                  oldText: toolCall.resultDisplay.originalContent,
                  newText: toolCall.resultDisplay.newContent,
                });
              }
            }

            const tool = this.context.toolRegistry.getTool(toolCall.name);

            await this.sendUpdate({
              sessionUpdate: 'tool_call',
              toolCallId: toolCall.id,
              status:
                toolCall.status === CoreToolCallStatus.Success
                  ? 'completed'
                  : 'failed',
              title: toolCall.displayName || toolCall.name,
              content: toolCallContent,
              kind: tool ? toAcpToolKind(tool.kind) : 'other',
            });
          }
        }
      }
    }
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    this.pendingPrompt?.abort();
    const pendingSend = new AbortController();
    this.pendingPrompt = pendingSend;

    await this.context.config.waitForMcpInit();

    const promptId = Math.random().toString(16).slice(2);
    const chat = this.chat;

    const parts = await this.#resolvePrompt(params.prompt, pendingSend.signal);

    // Command interception
    let commandText = '';

    for (const part of parts) {
      if (typeof part === 'object' && part !== null) {
        if ('text' in part) {
          // It is a text part
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion
          const text = (part as any).text;
          if (typeof text === 'string') {
            commandText += text;
          }
        } else {
          // Non-text part (image, embedded resource)
          // Stop looking for command
          break;
        }
      }
    }

    commandText = commandText.trim();

    if (
      commandText &&
      (commandText.startsWith('/') || commandText.startsWith('$'))
    ) {
      // If we found a command, pass it to handleCommand
      // Note: handleCommand currently expects `commandText` to be the command string
      // It uses `parts` argument but effectively ignores it in current implementation
      const handled = await this.handleCommand(commandText, parts);
      if (handled) {
        return {
          stopReason: 'end_turn',
          _meta: {
            quota: {
              token_count: { input_tokens: 0, output_tokens: 0 },
              model_usage: [],
            },
          },
        };
      }
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const modelUsageMap = new Map<string, { input: number; output: number }>();

    let nextMessage: Content | null = { role: 'user', parts };

    while (nextMessage !== null) {
      if (pendingSend.signal.aborted) {
        chat.addHistory(nextMessage);
        return { stopReason: CoreToolCallStatus.Cancelled };
      }

      const functionCalls: FunctionCall[] = [];

      try {
        const model = resolveModel(
          this.context.config.getModel(),
          (await this.context.config.getGemini31Launched?.()) ?? false,
        );
        const responseStream = await chat.sendMessageStream(
          { model },
          nextMessage?.parts ?? [],
          promptId,
          pendingSend.signal,
          LlmRole.MAIN,
        );
        nextMessage = null;

        let turnInputTokens = 0;
        let turnOutputTokens = 0;
        let turnModelId = model;

        for await (const resp of responseStream) {
          if (pendingSend.signal.aborted) {
            return { stopReason: CoreToolCallStatus.Cancelled };
          }

          if (resp.type === StreamEventType.CHUNK && resp.value.usageMetadata) {
            turnInputTokens =
              resp.value.usageMetadata.promptTokenCount ?? turnInputTokens;
            turnOutputTokens =
              resp.value.usageMetadata.candidatesTokenCount ?? turnOutputTokens;
            if (resp.value.modelVersion) {
              turnModelId = resp.value.modelVersion;
            }
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

        totalInputTokens += turnInputTokens;
        totalOutputTokens += turnOutputTokens;

        if (turnInputTokens > 0 || turnOutputTokens > 0) {
          const existing = modelUsageMap.get(turnModelId) ?? {
            input: 0,
            output: 0,
          };
          existing.input += turnInputTokens;
          existing.output += turnOutputTokens;
          modelUsageMap.set(turnModelId, existing);
        }

        if (pendingSend.signal.aborted) {
          return { stopReason: CoreToolCallStatus.Cancelled };
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
          return { stopReason: CoreToolCallStatus.Cancelled };
        }

        throw new acp.RequestError(
          getErrorStatus(error) || 500,
          getAcpErrorMessage(error),
        );
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

    const modelUsageArray = Array.from(modelUsageMap.entries()).map(
      ([modelName, counts]) => ({
        model: modelName,
        token_count: {
          input_tokens: counts.input,
          output_tokens: counts.output,
        },
      }),
    );

    return {
      stopReason: 'end_turn',
      _meta: {
        quota: {
          token_count: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          },
          model_usage: modelUsageArray,
        },
      },
    };
  }

  private async handleCommand(
    commandText: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    parts: Part[],
  ): Promise<boolean> {
    const gitService = await this.context.config.getGitService();
    const commandContext = {
      agentContext: this.context,
      settings: this.settings,
      git: gitService,
      sendMessage: async (text: string) => {
        await this.sendUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text },
        });
      },
    };

    return this.commandHandler.handleCommand(commandText, commandContext);
  }

  private async sendUpdate(update: acp.SessionUpdate): Promise<void> {
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
    const callId = fc.id ?? GeminiAgent.generateCallId(fc.name || 'unknown');
    const args = fc.args ?? {};

    const startTime = Date.now();

    const errorResponse = (error: Error) => {
      const durationMs = Date.now() - startTime;
      logToolCall(
        this.context.config,
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

    const toolRegistry = this.context.toolRegistry;
    const tool = toolRegistry.getTool(fc.name);

    if (!tool) {
      return errorResponse(
        new Error(`Tool "${fc.name}" not found in registry.`),
      );
    }

    try {
      const invocation = tool.build(args);

      const displayTitle =
        typeof invocation.getDisplayTitle === 'function'
          ? invocation.getDisplayTitle()
          : invocation.getDescription();

      const explanation =
        typeof invocation.getExplanation === 'function'
          ? invocation.getExplanation()
          : '';

      if (explanation) {
        await this.sendUpdate({
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: explanation },
        });
      }

      const confirmationDetails =
        await invocation.shouldConfirmExecute(abortSignal);

      if (confirmationDetails) {
        const content: acp.ToolCallContent[] = [];

        if (confirmationDetails.type === 'edit') {
          content.push({
            type: 'diff',
            path: confirmationDetails.filePath,
            oldText: confirmationDetails.originalContent,
            newText: confirmationDetails.newContent,
            _meta: {
              kind: !confirmationDetails.originalContent
                ? 'add'
                : confirmationDetails.newContent === ''
                  ? 'delete'
                  : 'modify',
            },
          });
        }

        const params: acp.RequestPermissionRequest = {
          sessionId: this.id,
          options: toPermissionOptions(
            confirmationDetails,
            this.context.config,
          ),
          toolCall: {
            toolCallId: callId,
            status: 'pending',
            title: displayTitle,
            content,
            locations: invocation.toolLocations(),
            kind: toAcpToolKind(tool.kind),
          },
        };

        const output = RequestPermissionResponseSchema.parse(
          await this.connection.requestPermission(params),
        );

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
        const content: acp.ToolCallContent[] = [];

        await this.sendUpdate({
          sessionUpdate: 'tool_call',
          toolCallId: callId,
          status: 'in_progress',
          title: displayTitle,
          content,
          locations: invocation.toolLocations(),
          kind: toAcpToolKind(tool.kind),
        });
      }

      const toolResult: ToolResult = await invocation.execute(abortSignal);
      const content = toToolCallContent(toolResult);

      const updateContent: acp.ToolCallContent[] = content ? [content] : [];

      await this.sendUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: callId,
        status: 'completed',
        title: displayTitle,
        content: updateContent,
        locations: invocation.toolLocations(),
        kind: toAcpToolKind(tool.kind),
      });

      const durationMs = Date.now() - startTime;
      logToolCall(
        this.context.config,
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

      this.chat.recordCompletedToolCalls(this.context.config.getActiveModel(), [
        {
          status: CoreToolCallStatus.Success,
          request: {
            callId,
            name: fc.name,
            args,
            isClientInitiated: false,
            prompt_id: promptId,
          },
          tool,
          invocation,
          response: {
            callId,
            responseParts: convertToFunctionResponse(
              fc.name,
              callId,
              toolResult.llmContent,
              this.context.config.getActiveModel(),
              this.context.config,
            ),
            resultDisplay: toolResult.returnDisplay,
            error: undefined,
            errorType: undefined,
          },
        },
      ]);

      return convertToFunctionResponse(
        fc.name,
        callId,
        toolResult.llmContent,
        this.context.config.getActiveModel(),
        this.context.config,
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
        kind: toAcpToolKind(tool.kind),
      });

      this.chat.recordCompletedToolCalls(this.context.config.getActiveModel(), [
        {
          status: CoreToolCallStatus.Error,
          request: {
            callId,
            name: fc.name,
            args,
            isClientInitiated: false,
            prompt_id: promptId,
          },
          tool,
          response: {
            callId,
            responseParts: [
              {
                functionResponse: {
                  id: callId,
                  name: fc.name ?? '',
                  response: { error: error.message },
                },
              },
            ],
            resultDisplay: error.message,
            error,
            errorType: undefined,
          },
        },
      ]);

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
    const fileDiscovery = this.context.config.getFileService();
    const fileFilteringOptions: FilterFilesOptions =
      this.context.config.getFileFilteringOptions();

    const pathSpecsToRead: string[] = [];
    const contentLabelsForDisplay: string[] = [];
    const ignoredPaths: string[] = [];
    const directContents: Array<{
      spec: string;
      content?: string;
      part?: Part;
    }> = [];

    const toolRegistry = this.context.toolRegistry;
    const readManyFilesTool = new ReadManyFilesTool(
      this.context.config,
      this.context.messageBus,
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
      let readDirectly = false;
      try {
        const absolutePath = path.resolve(
          this.context.config.getTargetDir(),
          pathName,
        );

        let validationError = this.context.config.validatePathAccess(
          absolutePath,
          'read',
        );

        // We ask the user for explicit permission to read them if outside sandboxed workspace boundaries (and not already authorized).
        if (
          validationError &&
          !isWithinRoot(absolutePath, this.context.config.getTargetDir())
        ) {
          try {
            const stats = await fs.stat(absolutePath);
            if (stats.isFile()) {
              const syntheticCallId = `resolve-prompt-${pathName}-${randomUUID()}`;
              const params = {
                sessionId: this.id,
                options: [
                  {
                    optionId: ToolConfirmationOutcome.ProceedOnce,
                    name: 'Allow once',
                    kind: 'allow_once',
                  },
                  {
                    optionId: ToolConfirmationOutcome.Cancel,
                    name: 'Deny',
                    kind: 'reject_once',
                  },
                ] as acp.PermissionOption[],
                toolCall: {
                  toolCallId: syntheticCallId,
                  status: 'pending',
                  title: `Allow access to absolute path: ${pathName}`,
                  content: [
                    {
                      type: 'content',
                      content: {
                        type: 'text',
                        text: `The Agent needs access to read an attached file outside your workspace: ${pathName}`,
                      },
                    },
                  ],
                  locations: [],
                  kind: 'read',
                },
              };

              const output = RequestPermissionResponseSchema.parse(
                await this.connection.requestPermission(params),
              );

              const outcome =
                output.outcome.outcome === 'cancelled'
                  ? ToolConfirmationOutcome.Cancel
                  : z
                      .nativeEnum(ToolConfirmationOutcome)
                      .parse(output.outcome.optionId);

              if (outcome === ToolConfirmationOutcome.ProceedOnce) {
                this.context.config
                  .getWorkspaceContext()
                  .addReadOnlyPath(absolutePath);
                validationError = null;
              } else {
                this.debug(
                  `Direct read authorization denied for absolute path ${pathName}`,
                );
                directContents.push({
                  spec: pathName,
                  content: `[Warning: Access to absolute path \`${pathName}\` denied by user.]`,
                });
                continue;
              }
            }
          } catch (error) {
            this.debug(
              `Failed to request permission for absolute attachment ${pathName}: ${getErrorMessage(error)}`,
            );
            await this.sendUpdate({
              sessionUpdate: 'agent_thought_chunk',
              content: {
                type: 'text',
                text: `Warning: Failed to display permission dialog for \`${absolutePath}\`. Error: ${getErrorMessage(error)}`,
              },
            });
          }
        }

        if (!validationError) {
          // If it's an absolute path that is authorized (e.g. added via readOnlyPaths),
          // read it directly to avoid ReadManyFilesTool absolute path resolution issues.
          if (
            (path.isAbsolute(pathName) ||
              !isWithinRoot(
                absolutePath,
                this.context.config.getTargetDir(),
              )) &&
            !readDirectly
          ) {
            try {
              const stats = await fs.stat(absolutePath);
              if (stats.isFile()) {
                const fileReadResult = await processSingleFileContent(
                  absolutePath,
                  this.context.config.getTargetDir(),
                  this.context.config.getFileSystemService(),
                );

                if (!fileReadResult.error) {
                  if (
                    typeof fileReadResult.llmContent === 'object' &&
                    'inlineData' in fileReadResult.llmContent
                  ) {
                    directContents.push({
                      spec: pathName,
                      part: fileReadResult.llmContent,
                    });
                  } else if (typeof fileReadResult.llmContent === 'string') {
                    let contentToPush = fileReadResult.llmContent;
                    if (fileReadResult.isTruncated) {
                      contentToPush = `[WARNING: This file was truncated]\n\n${contentToPush}`;
                    }
                    directContents.push({
                      spec: pathName,
                      content: contentToPush,
                    });
                  }
                  readDirectly = true;
                  resolvedSuccessfully = true;
                } else {
                  this.debug(
                    `Direct read failed for absolute path ${pathName}: ${fileReadResult.error}`,
                  );
                  await this.sendUpdate({
                    sessionUpdate: 'agent_thought_chunk',
                    content: {
                      type: 'text',
                      text: `Warning: file read failed for \`${pathName}\`. Reason: ${fileReadResult.error}`,
                    },
                  });
                  continue;
                }
              }
            } catch (error) {
              this.debug(
                `File stat/access error for absolute path ${pathName}: ${getErrorMessage(error)}`,
              );
              await this.sendUpdate({
                sessionUpdate: 'agent_thought_chunk',
                content: {
                  type: 'text',
                  text: `Warning: file access failed for \`${pathName}\`. Reason: ${getErrorMessage(error)}`,
                },
              });
              continue;
            }
          }

          if (!readDirectly) {
            const stats = await fs.stat(absolutePath);
            if (stats.isDirectory()) {
              currentPathSpec = pathName.endsWith('/')
                ? `${pathName}**`
                : `${pathName}/**`;
              this.debug(
                `Path ${pathName} resolved to directory, using glob: ${currentPathSpec}`,
              );
            } else {
              this.debug(
                `Path ${pathName} resolved to file: ${currentPathSpec}`,
              );
            }
            resolvedSuccessfully = true;
          }
        } else {
          this.debug(
            `Path ${pathName} access disallowed: ${validationError}. Skipping.`,
          );
          await this.sendUpdate({
            sessionUpdate: 'agent_thought_chunk',
            content: {
              type: 'text',
              text: `Warning: skipping access to \`${pathName}\`. Reason: ${validationError}`,
            },
          });
        }
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          if (this.context.config.getEnableRecursiveFileSearch() && globTool) {
            this.debug(
              `Path ${pathName} not found directly, attempting glob search.`,
            );
            try {
              const globResult = await globTool.buildAndExecute(
                {
                  pattern: `**/*${pathName}*`,
                  path: this.context.config.getTargetDir(),
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
                    this.context.config.getTargetDir(),
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
        if (!readDirectly) {
          pathSpecsToRead.push(currentPathSpec);
        }
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

    if (
      pathSpecsToRead.length === 0 &&
      embeddedContext.length === 0 &&
      directContents.length === 0
    ) {
      // Fallback for lone "@" or completely invalid @-commands resulting in empty initialQueryText
      debugLogger.warn('No valid file paths found in @ commands to read.');
      return [{ text: initialQueryText }];
    }

    if (pathSpecsToRead.length > 0) {
      const toolArgs = {
        include: pathSpecsToRead,
      };

      const callId = GeminiAgent.generateCallId(readManyFilesTool.name);

      try {
        const invocation = readManyFilesTool.build(toolArgs);

        await this.sendUpdate({
          sessionUpdate: 'tool_call',
          toolCallId: callId,
          status: 'in_progress',
          title: invocation.getDescription(),
          content: [],
          locations: invocation.toolLocations(),
          kind: toAcpToolKind(readManyFilesTool.kind),
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
          title: invocation.getDescription(),
          content: content ? [content] : [],
          locations: invocation.toolLocations(),
          kind: toAcpToolKind(readManyFilesTool.kind),
        });
        if (Array.isArray(result.llmContent)) {
          const fileContentRegex = /^--- (.*?) ---\n\n([\s\S]*?)\n\n$/;
          processedQueryParts.push({
            text: `\n${REFERENCE_CONTENT_START}`,
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
          kind: toAcpToolKind(readManyFilesTool.kind),
        });

        throw error;
      }
    }

    if (directContents.length > 0) {
      const hasReferenceStart = processedQueryParts.some(
        (p) =>
          'text' in p &&
          typeof p.text === 'string' &&
          p.text.includes(REFERENCE_CONTENT_START),
      );
      if (!hasReferenceStart) {
        processedQueryParts.push({
          text: `\n${REFERENCE_CONTENT_START}`,
        });
      }
      for (const item of directContents) {
        processedQueryParts.push({
          text: `\nContent from @${item.spec}:\n`,
        });
        if (item.content) {
          processedQueryParts.push({ text: item.content });
        } else if (item.part) {
          processedQueryParts.push(item.part);
        }
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
    if (this.context.config.getDebugMode()) {
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
          path:
            toolResult.returnDisplay.filePath ??
            toolResult.returnDisplay.fileName,
          oldText: toolResult.returnDisplay.originalContent,
          newText: toolResult.returnDisplay.newContent,
          _meta: {
            kind: !toolResult.returnDisplay.originalContent
              ? 'add'
              : toolResult.returnDisplay.newContent === ''
                ? 'delete'
                : 'modify',
          },
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
  config: Config,
): acp.PermissionOption[] {
  const disableAlwaysAllow = config.getDisableAlwaysAllow();
  const options: acp.PermissionOption[] = [];

  if (!disableAlwaysAllow) {
    switch (confirmation.type) {
      case 'edit':
        options.push({
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: 'Allow All Edits',
          kind: 'allow_always',
        });
        break;
      case 'exec':
        options.push({
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: `Always Allow ${confirmation.rootCommand}`,
          kind: 'allow_always',
        });
        break;
      case 'mcp':
        options.push(
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
        );
        break;
      case 'info':
        options.push({
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: `Always Allow`,
          kind: 'allow_always',
        });
        break;
      case 'ask_user':
      case 'exit_plan_mode':
        // askuser and exit_plan_mode don't need "always allow" options
        break;
      default:
        // No "always allow" options for other types
        break;
    }
  }

  options.push(...basicPermissionOptions);

  // Exhaustive check
  switch (confirmation.type) {
    case 'edit':
    case 'exec':
    case 'mcp':
    case 'info':
    case 'ask_user':
    case 'exit_plan_mode':
    case 'sandbox_expansion':
      break;
    default: {
      const unreachable: never = confirmation;
      throw new Error(`Unexpected: ${unreachable}`);
    }
  }

  return options;
}

/**
 * Maps our internal tool kind to the ACP ToolKind.
 * Fallback to 'other' for kinds that are not supported by the ACP protocol.
 */
function toAcpToolKind(kind: Kind): acp.ToolKind {
  switch (kind) {
    case Kind.Read:
    case Kind.Edit:
    case Kind.Execute:
    case Kind.Search:
    case Kind.Delete:
    case Kind.Move:
    case Kind.Think:
    case Kind.Fetch:
    case Kind.SwitchMode:
    case Kind.Other:
      return kind as acp.ToolKind;
    case Kind.Agent:
      return 'think';
    case Kind.Plan:
    case Kind.Communicate:
    default:
      return 'other';
  }
}

function buildAvailableModes(isPlanEnabled: boolean): acp.SessionMode[] {
  const modes: acp.SessionMode[] = [
    {
      id: ApprovalMode.DEFAULT,
      name: 'Default',
      description: 'Prompts for approval',
    },
    {
      id: ApprovalMode.AUTO_EDIT,
      name: 'Auto Edit',
      description: 'Auto-approves edit tools',
    },
    {
      id: ApprovalMode.YOLO,
      name: 'YOLO',
      description: 'Auto-approves all tools',
    },
  ];

  if (isPlanEnabled) {
    modes.push({
      id: ApprovalMode.PLAN,
      name: 'Plan',
      description: 'Read-only mode',
    });
  }

  return modes;
}

function buildAvailableModels(
  config: Config,
  settings: LoadedSettings,
): {
  availableModels: Array<{
    modelId: string;
    name: string;
    description?: string;
  }>;
  currentModelId: string;
} {
  const preferredModel = config.getModel() || DEFAULT_GEMINI_MODEL_AUTO;
  const shouldShowPreviewModels = config.getHasAccessToPreviewModel();
  const useGemini31 = config.getGemini31LaunchedSync?.() ?? false;
  const selectedAuthType = settings.merged.security.auth.selectedType;
  const useCustomToolModel =
    useGemini31 && selectedAuthType === AuthType.USE_GEMINI;

  const mainOptions = [
    {
      value: DEFAULT_GEMINI_MODEL_AUTO,
      title: getDisplayString(DEFAULT_GEMINI_MODEL_AUTO),
      description:
        'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash',
    },
  ];

  if (shouldShowPreviewModels) {
    mainOptions.unshift({
      value: PREVIEW_GEMINI_MODEL_AUTO,
      title: getDisplayString(PREVIEW_GEMINI_MODEL_AUTO),
      description: useGemini31
        ? 'Let Gemini CLI decide the best model for the task: gemini-3.1-pro, gemini-3-flash'
        : 'Let Gemini CLI decide the best model for the task: gemini-3-pro, gemini-3-flash',
    });
  }

  const manualOptions = [
    {
      value: DEFAULT_GEMINI_MODEL,
      title: getDisplayString(DEFAULT_GEMINI_MODEL),
    },
    {
      value: DEFAULT_GEMINI_FLASH_MODEL,
      title: getDisplayString(DEFAULT_GEMINI_FLASH_MODEL),
    },
    {
      value: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      title: getDisplayString(DEFAULT_GEMINI_FLASH_LITE_MODEL),
    },
  ];

  if (shouldShowPreviewModels) {
    const previewProModel = useGemini31
      ? PREVIEW_GEMINI_3_1_MODEL
      : PREVIEW_GEMINI_MODEL;

    const previewProValue = useCustomToolModel
      ? PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL
      : previewProModel;

    manualOptions.unshift(
      {
        value: previewProValue,
        title: getDisplayString(previewProModel),
      },
      {
        value: PREVIEW_GEMINI_FLASH_MODEL,
        title: getDisplayString(PREVIEW_GEMINI_FLASH_MODEL),
      },
    );
  }

  const scaleOptions = (
    options: Array<{ value: string; title: string; description?: string }>,
  ) =>
    options.map((o) => ({
      modelId: o.value,
      name: o.title,
      description: o.description,
    }));

  return {
    availableModels: [
      ...scaleOptions(mainOptions),
      ...scaleOptions(manualOptions),
    ],
    currentModelId: preferredModel,
  };
}
