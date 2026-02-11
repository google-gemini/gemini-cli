/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Content,
  type Part,
  type FunctionDeclaration,
  Type,
} from '@google/genai';
import { type Config } from '../config/config.js';
import { GeminiChat } from '../core/geminiChat.js';
import {
  Turn,
  GeminiEventType,
  type ServerGeminiStreamEvent,
  CompressionStatus,
} from '../core/turn.js';
import {
  type AgentDefinition,
  AgentTerminateMode,
  type LocalAgentDefinition,
  type AgentInputs,
} from './types.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import { ChatCompressionService } from '../services/chatCompressionService.js';
import { ToolOutputMaskingService } from '../services/toolOutputMaskingService.js';
import {
  getDirectoryContextString,
  getInitialChatHistory,
} from '../utils/environmentContext.js';
import { templateString } from './utils.js';
import { getVersion } from '../utils/version.js';
import { resolveModel } from '../config/models.js';
import { type RoutingContext } from '../routing/routingStrategy.js';
import { getCoreSystemPrompt } from '../core/prompts.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Schema } from '@google/genai';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { scheduleAgentTools } from './agent-scheduler.js';
import { type ToolCallRequestInfo } from '../scheduler/types.js';
import { promptIdContext } from '../utils/promptIdContext.js';
import { logAgentStart, logAgentFinish } from '../telemetry/loggers.js';
import { AgentStartEvent, AgentFinishEvent } from '../telemetry/types.js';

const TASK_COMPLETE_TOOL_NAME = 'complete_task';

export interface AgentHarnessOptions {
  config: Config;
  definition?: AgentDefinition;
  /** If provided, this prompt_id will be used as a prefix. */
  parentPromptId?: string;
  /** Initial history to start the agent with. */
  initialHistory?: Content[];
  /** Inputs for subagent templating. */
  inputs?: AgentInputs;
}

/**
 * A unified harness for executing agents (both main CLI and subagents).
 * Consolidates ReAct loop logic, tool scheduling, and state management.
 */
export class AgentHarness {
  private readonly config: Config;
  private readonly definition?: AgentDefinition;
  private readonly loopDetector: LoopDetectionService;
  private readonly compressionService: ChatCompressionService;
  private readonly toolOutputMaskingService: ToolOutputMaskingService;
  private readonly toolRegistry: ToolRegistry;

  private chat?: GeminiChat;
  private readonly agentId: string;
  private currentSequenceModel: string | null = null;
  private turnCounter = 0;
  private inputs?: AgentInputs;

  constructor(options: AgentHarnessOptions) {
    this.config = options.config;
    this.definition = options.definition;
    this.inputs = options.inputs;

    const randomIdPart = Math.random().toString(36).slice(2, 8);
    const parentPrefix = options.parentPromptId
      ? `${options.parentPromptId}-`
      : '';
    const name = this.definition?.name ?? 'main';
    this.agentId = `${parentPrefix}${name}-${randomIdPart}`;

    this.loopDetector = new LoopDetectionService(this.config);
    this.compressionService = new ChatCompressionService();
    this.toolOutputMaskingService = new ToolOutputMaskingService();

    // Use an isolated tool registry for subagents, or the global one for the main agent.
    this.toolRegistry = this.definition
      ? new ToolRegistry(this.config, this.config.getMessageBus())
      : this.config.getToolRegistry();
  }

  /**
   * Initializes the harness, creating the underlying chat object.
   */
  async initialize(): Promise<void> {
    if (this.definition) {
      await this.setupSubagentTools();
    }
    this.chat = await this.createChat();
  }

  private async setupSubagentTools(): Promise<void> {
    if (!this.definition) return;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const def = this.definition as LocalAgentDefinition;
    const parentToolRegistry = this.config.getToolRegistry();
    if (def.toolConfig) {
      for (const toolRef of def.toolConfig.tools) {
        if (typeof toolRef === 'string') {
          const tool = parentToolRegistry.getTool(toolRef);
          if (tool) this.toolRegistry.registerTool(tool);
        } else if (typeof toolRef === 'object' && 'build' in toolRef) {
          this.toolRegistry.registerTool(toolRef);
        }
      }
    } else {
      for (const toolName of parentToolRegistry.getAllToolNames()) {
        const tool = parentToolRegistry.getTool(toolName);
        if (tool) this.toolRegistry.registerTool(tool);
      }
    }
    this.toolRegistry.sortTools();
  }

  private async createChat(): Promise<GeminiChat> {
    const systemInstruction = await this.getSystemInstruction();
    const history = await this.getInitialHistory();
    const tools = this.prepareToolsList();

    return new GeminiChat(
      this.config,
      systemInstruction,
      [{ functionDeclarations: tools }],
      history,
    );
  }

  private async getInitialHistory(): Promise<Content[]> {
    if (this.definition) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const def = this.definition as LocalAgentDefinition;
      const initialMessages = def.promptConfig.initialMessages ?? [];
      if (this.inputs) {
        return initialMessages.map((content) => ({
          ...content,
          parts: (content.parts ?? []).map((part) =>
            'text' in part && part.text
              ? { text: templateString(part.text, this.inputs!) }
              : part,
          ),
        }));
      }
      return initialMessages;
    }
    return getInitialChatHistory(this.config);
  }

  private async getSystemInstruction(): Promise<string | undefined> {
    if (this.definition) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const def = this.definition as LocalAgentDefinition;
      if (!def.promptConfig.systemPrompt) return undefined;

      const augmentedInputs = {
        ...this.inputs,
        cliVersion: await getVersion(),
        today: new Date().toLocaleDateString(),
      };
      let prompt = templateString(
        def.promptConfig.systemPrompt,
        augmentedInputs,
      );
      const dirContext = await getDirectoryContextString(this.config);
      prompt += `\n\n# Environment Context\n${dirContext}`;
      prompt += `\n\nImportant Rules:\n* You are running in a non-interactive mode. You CANNOT ask the user for input or clarification.\n* Work systematically using available tools to complete your task.\n* Always use absolute paths for file operations.`;

      const hasOutput = !!def.outputConfig;
      prompt += `\n* When you have completed your task, you MUST call the \`${TASK_COMPLETE_TOOL_NAME}\` tool${hasOutput ? ' with your structured output' : ''}.`;

      return prompt;
    }
    const systemMemory = this.config.getUserMemory();
    return getCoreSystemPrompt(this.config, systemMemory);
  }

  private prepareToolsList(): FunctionDeclaration[] {
    const modelId = this.currentSequenceModel ?? undefined;
    const tools = this.toolRegistry.getFunctionDeclarations(modelId);

    if (this.definition) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const def = this.definition as LocalAgentDefinition;
      const completeTool: FunctionDeclaration = {
        name: TASK_COMPLETE_TOOL_NAME,
        description:
          'Call this tool to submit your final answer and complete the task.',
        parameters: { type: Type.OBJECT, properties: {}, required: [] },
      };

      if (def.outputConfig) {
        const schema = zodToJsonSchema(def.outputConfig.schema);

        const {
          $schema: _,
          definitions: __,
          ...cleanSchema
        } = schema as Record<string, unknown>;
        completeTool.parameters!.properties![def.outputConfig.outputName] =
          cleanSchema as Schema;
        completeTool.parameters!.required!.push(def.outputConfig.outputName);
      } else {
        completeTool.parameters!.properties!['result'] = {
          type: Type.STRING,
          description: 'Your final results or findings.',
        };
        completeTool.parameters!.required!.push('result');
      }
      tools.push(completeTool);
    }

    return tools;
  }

  /**
   * Runs the agent with the given request.
   */
  async *run(
    request: Part[],
    signal: AbortSignal,
    maxTurns = 100,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    const startTime = Date.now();
    logAgentStart(
      this.config,
      new AgentStartEvent(this.agentId, this.definition?.name ?? 'main'),
    );

    if (!this.chat) {
      await this.initialize();
    }

    let turn = new Turn(this.chat!, this.agentId);
    let currentRequest = request;
    let terminateReason = AgentTerminateMode.GOAL;

    try {
      while (this.turnCounter < maxTurns) {
        const promptId = `${this.agentId}#${this.turnCounter}`;
        if (signal.aborted) {
          terminateReason = AgentTerminateMode.ABORTED;
          yield { type: GeminiEventType.UserCancelled };
          return turn;
        }

        // 1. Compression and Token Limit checks
        const compressionResult = await this.tryCompressChat(promptId);
        if (
          compressionResult.compressionStatus === CompressionStatus.COMPRESSED
        ) {
          yield {
            type: GeminiEventType.ChatCompressed,
            value: compressionResult,
          };
        }

        await this.toolOutputMaskingService.mask(
          this.chat!.getHistory(),
          this.config,
        );

        // 2. Loop Detection
        if (await this.loopDetector.turnStarted(signal)) {
          terminateReason = AgentTerminateMode.ERROR;
          yield { type: GeminiEventType.LoopDetected };
          return turn;
        }

        // 3. Model Selection/Routing
        const modelToUse = await this.selectModel(currentRequest, signal);
        if (!this.currentSequenceModel) {
          yield { type: GeminiEventType.ModelInfo, value: modelToUse };
          this.currentSequenceModel = modelToUse;
        }

        // 4. Update tools for this model
        this.chat!.setTools([
          { functionDeclarations: this.prepareToolsList() },
        ]);

        // 5. Run the turn
        const turnStream = promptIdContext.run(promptId, () =>
          turn.run({ model: modelToUse }, currentRequest, signal),
        );
        let hasError = false;
        for await (const event of turnStream) {
          yield event;
          if (event.type === GeminiEventType.Error) hasError = true;

          // Subagent activity reporting
          if (
            this.definition &&
            event.type === GeminiEventType.ToolCallRequest
          ) {
            yield {
              type: GeminiEventType.SubagentActivity,
              value: {
                agentName: this.definition.name,
                type: 'TOOL_CALL_START',
                data: { name: event.value.name, args: event.value.args },
              },
            };
          }
        }

        if (hasError) {
          terminateReason = AgentTerminateMode.ERROR;
          return turn;
        }
        if (signal.aborted) {
          terminateReason = AgentTerminateMode.ABORTED;
          return turn;
        }

        // 6. Handle tool calls or termination
        if (turn.pendingToolCalls.length > 0) {
          const toolResults = await this.executeTools(
            turn.pendingToolCalls,
            signal,
          );

          // Check if subagent called complete_task
          if (this.definition) {
            const completeCall = toolResults.find(
              (r) => r.name === TASK_COMPLETE_TOOL_NAME,
            );
            if (completeCall) {
              // Check for validation errors in complete_task
              if (completeCall.part.functionResponse?.response?.['error']) {
                // The model messed up complete_task, it will receive the error as currentRequest and try again
                currentRequest = [completeCall.part];
              } else {
                terminateReason = AgentTerminateMode.GOAL;
                return turn;
              }
            } else {
              currentRequest = toolResults.map((r) => r.part);
            }
          } else {
            currentRequest = toolResults.map((r) => r.part);
          }

          this.turnCounter++;
          // Create new turn for next iteration
          turn = new Turn(this.chat!, this.agentId);
        } else {
          // No more tool calls. Check if we should continue (main agent only)
          if (!this.definition) {
            const nextSpeaker = await checkNextSpeaker(
              this.chat!,
              this.config.getBaseLlmClient(),
              signal,
              this.agentId,
            );
            if (nextSpeaker?.next_speaker === 'model') {
              currentRequest = [{ text: 'Please continue.' }];
              this.turnCounter++;
              turn = new Turn(this.chat!, this.agentId);
              continue;
            }
          } else {
            // Subagent stopped without complete_task
            terminateReason = AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL;
            yield {
              type: GeminiEventType.Error,
              value: {
                error: {
                  message: `Agent stopped calling tools but did not call '${TASK_COMPLETE_TOOL_NAME}'`,
                },
              },
            };
          }
          break; // Finished
        }
      }
    } finally {
      logAgentFinish(
        this.config,
        new AgentFinishEvent(
          this.agentId,
          this.definition?.name ?? 'main',
          Date.now() - startTime,
          this.turnCounter,
          terminateReason,
        ),
      );
    }

    return turn;
  }

  private async tryCompressChat(promptId: string) {
    const model =
      this.currentSequenceModel ?? resolveModel(this.config.getActiveModel());
    const { info } = await this.compressionService.compress(
      this.chat!,
      promptId,
      false,
      model,
      this.config,
      false,
    );
    return info;
  }

  private async selectModel(
    request: Part[],
    signal: AbortSignal,
  ): Promise<string> {
    if (this.currentSequenceModel) return this.currentSequenceModel;
    const routingContext: RoutingContext = {
      history: this.chat!.getHistory(true),
      request,
      signal,
      requestedModel: this.config.getModel(),
    };
    const decision = await this.config
      .getModelRouterService()
      .route(routingContext);
    return decision.model;
  }

  private async executeTools(
    calls: ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<Array<{ name: string; part: Part }>> {
    const completedCalls = await scheduleAgentTools(this.config, calls, {
      schedulerId: this.agentId,
      toolRegistry: this.toolRegistry,
      signal,
    });

    return completedCalls.map((call) => ({
      name: call.request.name,
      part: call.response.responseParts[0],
    }));
  }
}
