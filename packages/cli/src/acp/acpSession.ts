/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ApprovalMode,
  type ConversationRecord,
  CoreToolCallStatus,
  coreEvents,
  CoreEvent,
  type ApprovalModeChangedPayload,
  logToolCall,
  convertToFunctionResponse,
  ToolConfirmationOutcome,
  getErrorStatus,
  DiscoveredMCPTool,
  ToolCallEvent,
  debugLogger,
  ReadManyFilesTool,
  partListUnionToString,
  type AgentLoopContext,
  updatePolicy,
  getErrorMessage,
  type FilterFilesOptions,
  isTextPart,
  GeminiEventType,
  type ToolCallRequestInfo,
  type GeminiChat,
  type ToolResult,
  isWithinRoot,
  processSingleFileContent,
  isNodeError,
  REFERENCE_CONTENT_START,
  InvalidStreamError,
} from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';
import type { Part, FunctionCall } from '@google/genai';
import type { LoadedSettings } from '../config/settings.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CommandHandler } from './acpCommandHandler.js';
import {
  toToolCallContent,
  toPermissionOptions,
  toAcpToolKind,
  buildAvailableModes,
  RequestPermissionResponseSchema,
} from './acpUtils.js';
import { z } from 'zod';
import { getAcpErrorMessage } from './acpErrors.js';

const StructuredErrorSchema = z.object({
  status: z.number().optional(),
  message: z.string().optional(),
});

export class Session {
  private pendingPrompt: AbortController | null = null;
  private commandHandler = new CommandHandler();
  private callIdCounter = 0;

  private generateCallId(name: string): string {
    return `${name}-${Date.now()}-${++this.callIdCounter}`;
  }

  constructor(
    private readonly id: string,
    private readonly chat: GeminiChat,
    private readonly context: AgentLoopContext,
    private readonly connection: acp.AgentSideConnection,
    private readonly settings: LoadedSettings,
  ) {
    coreEvents.on(
      CoreEvent.ApprovalModeChanged,
      this.handleApprovalModeChanged,
    );
  }

  private handleApprovalModeChanged = (payload: ApprovalModeChangedPayload) => {
    if (payload.sessionId === this.id) {
      void this.sendUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: `[MODE_UPDATE] ${payload.mode}`,
        },
      });
    }
  };

  dispose(): void {
    coreEvents.off(
      CoreEvent.ApprovalModeChanged,
      this.handleApprovalModeChanged,
    );
  }

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

    const parts = await this.#resolvePrompt(params.prompt, pendingSend.signal);

    // Command interception
    let commandText = '';

    for (const part of parts) {
      if (typeof part === 'object' && part !== null) {
        if (isTextPart(part)) {
          // It is a text part
          const text = part.text;
          commandText += text;
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

    let currentParts: Part[] = parts;
    let turnCount = 0;
    const maxTurns = this.context.config.getMaxSessionTurns();

    while (true) {
      turnCount++;
      if (maxTurns >= 0 && turnCount > maxTurns) {
        return {
          stopReason: 'max_turn_requests',
          _meta: {
            quota: {
              token_count: {
                input_tokens: totalInputTokens,
                output_tokens: totalOutputTokens,
              },
              model_usage: Array.from(modelUsageMap.entries()).map(
                ([modelName, counts]) => ({
                  model: modelName,
                  token_count: {
                    input_tokens: counts.input,
                    output_tokens: counts.output,
                  },
                }),
              ),
            },
          },
        };
      }

      if (pendingSend.signal.aborted) {
        return { stopReason: 'cancelled' };
      }

      const toolCallRequests: ToolCallRequestInfo[] = [];
      let stopReason: acp.StopReason = 'end_turn';
      let turnModelId = this.context.config.getModel();
      let turnInputTokens = 0;
      let turnOutputTokens = 0;

      try {
        const responseStream = this.context.geminiClient.sendMessageStream(
          currentParts,
          pendingSend.signal,
          promptId,
        );

        for await (const event of responseStream) {
          if (pendingSend.signal.aborted) {
            return { stopReason: 'cancelled' };
          }

          switch (event.type) {
            case GeminiEventType.Content: {
              const content: acp.ContentBlock = {
                type: 'text',
                text: event.value,
              };

              await this.sendUpdate({
                sessionUpdate: 'agent_message_chunk',
                content,
              });
              break;
            }

            case GeminiEventType.Thought: {
              const thoughtText = `**${event.value.subject}**\n${event.value.description}`;
              await this.sendUpdate({
                sessionUpdate: 'agent_thought_chunk',
                content: { type: 'text', text: thoughtText },
              });
              break;
            }

            case GeminiEventType.ToolCallRequest:
              toolCallRequests.push(event.value);
              break;

            case GeminiEventType.Finished: {
              const usage = event.value.usageMetadata;
              if (usage) {
                turnInputTokens = usage.promptTokenCount ?? turnInputTokens;
                turnOutputTokens =
                  usage.candidatesTokenCount ?? turnOutputTokens;
              }
              break;
            }

            case GeminiEventType.ModelInfo:
              turnModelId = event.value;
              break;

            case GeminiEventType.MaxSessionTurns:
              stopReason = 'max_turn_requests';
              break;

            case GeminiEventType.LoopDetected:
              stopReason = 'max_turn_requests';
              break;

            case GeminiEventType.ContextWindowWillOverflow:
              stopReason = 'max_tokens';
              break;

            case GeminiEventType.Error: {
              const parseResult = StructuredErrorSchema.safeParse(
                event.value.error,
              );
              const errData = parseResult.success ? parseResult.data : {};

              throw new acp.RequestError(
                errData.status ?? 500,
                errData.message ?? 'Unknown stream execution error.',
              );
            }

            default:
              break;
          }
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

        if (error instanceof acp.RequestError) {
          throw error;
        }

        if (
          error instanceof InvalidStreamError ||
          (error &&
            typeof error === 'object' &&
            'type' in error &&
            (error.type === 'NO_RESPONSE_TEXT' ||
              error.type === 'NO_FINISH_REASON' ||
              error.type === 'MALFORMED_FUNCTION_CALL' ||
              error.type === 'UNEXPECTED_TOOL_CALL'))
        ) {
          // The stream ended with an empty response or malformed tool call.
          // Treat this as a graceful end to the model's turn rather than a crash.
          return {
            stopReason: 'end_turn',
            _meta: {
              quota: {
                token_count: {
                  input_tokens: totalInputTokens,
                  output_tokens: totalOutputTokens,
                },
                model_usage: Array.from(modelUsageMap.entries()).map(
                  ([modelName, counts]) => ({
                    model: modelName,
                    token_count: {
                      input_tokens: counts.input,
                      output_tokens: counts.output,
                    },
                  }),
                ),
              },
            },
          };
        }

        throw new acp.RequestError(
          getErrorStatus(error) || 500,
          getAcpErrorMessage(error),
        );
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

      if (stopReason !== 'end_turn') {
        return {
          stopReason,
          _meta: {
            quota: {
              token_count: {
                input_tokens: totalInputTokens,
                output_tokens: totalOutputTokens,
              },
              model_usage: Array.from(modelUsageMap.entries()).map(
                ([modelName, counts]) => ({
                  model: modelName,
                  token_count: {
                    input_tokens: counts.input,
                    output_tokens: counts.output,
                  },
                }),
              ),
            },
          },
        };
      }

      if (toolCallRequests.length === 0) {
        break;
      }

      const toolResponseParts: Part[] = [];
      for (const tReq of toolCallRequests) {
        const fc: FunctionCall = {
          id: tReq.callId,
          name: tReq.name,
          args: tReq.args,
        };

        const response = await this.runTool(pendingSend.signal, promptId, fc);
        toolResponseParts.push(...response);
      }

      currentParts = toolResponseParts;
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
    const callId = fc.id ?? this.generateCallId(fc.name || 'unknown');
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
            this.settings.merged.security.enablePermanentToolApproval,
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

        // Update policy to enable Always Allow persistence
        await updatePolicy(
          tool,
          outcome,
          confirmationDetails,
          this.context,
          this.context.messageBus,
          invocation,
        );

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

      const toolResult: ToolResult = await invocation.execute({
        abortSignal,
      });
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

      const callId = this.generateCallId(readManyFilesTool.name);

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

        const result = await invocation.execute({ abortSignal });
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
