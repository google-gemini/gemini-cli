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
import {
  type Turn,
  type ServerGeminiStreamEvent,
  GeminiEventType,
} from '../core/turn.js';
import {
  AgentTerminateMode,
  type LocalAgentDefinition,
  type AgentInputs,
} from './types.js';
import { getCoreSystemPrompt } from '../core/prompts.js';
import {
  getInitialChatHistory,
  getDirectoryContextString,
} from '../utils/environmentContext.js';
import { templateString } from './utils.js';
import { getVersion } from '../utils/version.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Schema } from '@google/genai';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { partToString } from '../utils/partUtils.js';
import { ideContextStore } from '../ide/ideContext.js';
import { type IdeContext } from '../ide/types.js';
import { promptIdContext } from '../utils/promptIdContext.js';
import { logRecoveryAttempt } from '../telemetry/loggers.js';
import { RecoveryAttemptEvent } from '../telemetry/types.js';
import { DeadlineTimer } from '../utils/deadlineTimer.js';
import { debugLogger } from '../utils/debugLogger.js';

import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolCallResponseInfo } from '../scheduler/types.js';

const TASK_COMPLETE_TOOL_NAME = 'complete_task';
const GRACE_PERIOD_MS = 60 * 1000;

/**
 * Defines the extension points for the unified ReAct loop in AgentHarness.
 */
export interface AgentBehavior {
  /** The unique ID for this agent instance. */
  readonly agentId: string;

  /** The human-readable name of the agent. */
  readonly name: string;

  /** Initializes any state needed for the agent. */
  initialize(toolRegistry: ToolRegistry): Promise<void>;

  /** Returns the system instruction for the chat. */

  getSystemInstruction(): Promise<string | undefined>;

  /** Returns the initial chat history. */
  getInitialHistory(): Promise<Content[]>;

  /**
   * Prepares the tools list for the current turn.
   * @param baseTools The tools from the tool registry.
   */
  prepareTools(baseTools: FunctionDeclaration[]): FunctionDeclaration[];

  /**
   * Performs any environment synchronization (e.g., IDE context) before a turn.
   */
  syncEnvironment(history: Content[]): Promise<{ additionalParts?: Part[] }>;

  /**
   * Fires the "Before Agent" hooks if applicable.
   */
  fireBeforeAgent(request: Part[]): Promise<{
    stop?: boolean;
    reason?: string;
    systemMessage?: string;
    additionalContext?: string;
  }>;

  /**
   * Fires the "After Agent" hooks if applicable.
   */
  fireAfterAgent(
    request: Part[],
    response: string,
    turn: Turn,
  ): Promise<{
    stop?: boolean;
    reason?: string;
    systemMessage?: string;
    contextCleared?: boolean;
    shouldContinue?: boolean;
  }>;

  /**
   * Transforms the initial request if needed (e.g. subagent 'Start' templating).
   */
  transformRequest(request: Part[]): Promise<Part[]>;

  /**
   * Determines if the current tool results signify that the agent's goal is met.
   * (e.g., Subagents checking for 'complete_task')
   */
  isGoalReached(
    toolResults: Array<{
      name: string;
      part: Part;
      result: ToolCallResponseInfo;
    }>,
  ): boolean;

  /**
   * Checks if the agent should continue executing after a model turn with no tool calls.
   * (e.g., Main agent running next_speaker check)
   */
  getContinuationRequest(
    turn: Turn,
    signal: AbortSignal,
  ): Promise<Part[] | null>;

  /**
   * Attempts to recover from a termination state (e.g., Subagent "Final Warning").
   * Returns a stream of events if recovery is attempted.
   */
  executeRecovery(
    turn: Turn,
    reason: AgentTerminateMode,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent, boolean>;

  /**
   * Returns a final failure message for a given termination reason.
   */
  getFinalFailureMessage(
    reason: AgentTerminateMode,
    maxTurns: number,
    maxTime: number,
  ): string;
}

/**
 * Behavior for the main CLI agent.
 */
export class MainAgentBehavior implements AgentBehavior {
  readonly agentId: string;
  readonly name = 'main';
  private lastSentIdeContext: IdeContext | undefined;
  private forceFullIdeContext = true;

  constructor(
    private readonly config: Config,
    parentPromptId?: string,
  ) {
    const randomIdPart = Math.random().toString(36).slice(2, 8);
    const parentPrefix = parentPromptId ? `${parentPromptId}-` : '';
    this.agentId = `${parentPrefix}main-${randomIdPart}`;
  }

  async initialize(_toolRegistry: ToolRegistry) {
    debugLogger.debug(
      `[MainAgentBehavior] [${this.name}:${this.agentId}] Initialized`,
    );
  }

  async getSystemInstruction() {
    const systemMemory = this.config.getUserMemory();
    return getCoreSystemPrompt(this.config, systemMemory);
  }

  async getInitialHistory() {
    return getInitialChatHistory(this.config);
  }

  prepareTools(baseTools: FunctionDeclaration[]) {
    return baseTools;
  }

  async syncEnvironment(history: Content[]) {
    if (!this.config.getIdeMode()) return {};

    const lastMessage =
      history.length > 0 ? history[history.length - 1] : undefined;
    const hasPendingToolCall =
      !!lastMessage &&
      lastMessage.role === 'model' &&
      (lastMessage.parts?.some((p) => 'functionCall' in p) || false);

    if (hasPendingToolCall) return {};

    const currentIdeContext = ideContextStore.get();
    if (!currentIdeContext) return {};

    let contextParts: string[] = [];
    if (
      this.forceFullIdeContext ||
      this.lastSentIdeContext === undefined ||
      history.length === 0
    ) {
      contextParts = this.getFullIdeContextParts(currentIdeContext);
    } else {
      contextParts = this.getDeltaIdeContextParts(
        currentIdeContext,
        this.lastSentIdeContext,
      );
    }

    if (contextParts.length > 0) {
      this.lastSentIdeContext = currentIdeContext;
      this.forceFullIdeContext = false;
      return { additionalParts: [{ text: contextParts.join('\n') }] };
    }

    return {};
  }

  private getFullIdeContextParts(context: IdeContext): string[] {
    const openFiles = context.workspaceState?.openFiles || [];
    const activeFile = openFiles.find((f) => f.isActive);
    const otherOpenFiles = openFiles
      .filter((f) => !f.isActive)
      .map((f) => f.path);

    const contextData: Record<string, unknown> = {};
    if (activeFile) {
      contextData['activeFile'] = {
        path: activeFile.path,
        cursor: activeFile.cursor,
        selectedText: activeFile.selectedText || undefined,
      };
    }
    if (otherOpenFiles.length > 0)
      contextData['otherOpenFiles'] = otherOpenFiles;

    if (Object.keys(contextData).length === 0) return [];

    return [
      "Here is the user's editor context as a JSON object. This is for your information only.",
      '```json',
      JSON.stringify(contextData, null, 2),
      '```',
    ];
  }

  private getDeltaIdeContextParts(
    _current: IdeContext,
    _last: IdeContext,
  ): string[] {
    // Simplified delta logic for now, similar to GeminiClient
    const changes: Record<string, unknown> = {};
    // ... delta logic ...
    if (Object.keys(changes).length === 0) return [];

    return [
      "Here is a summary of changes in the user's editor context, in JSON format. This is for your information only.",
      '```json',
      JSON.stringify({ changes }, null, 2),
      '```',
    ];
  }

  async fireBeforeAgent(request: Part[]) {
    if (!this.config.getEnableHooks()) return {};
    const hookOutput = await this.config
      .getHookSystem()
      ?.fireBeforeAgentEvent(partToString(request));
    if (!hookOutput) return {};

    return {
      stop: hookOutput.shouldStopExecution() || hookOutput.isBlockingDecision(),
      reason: hookOutput.getEffectiveReason(),
      systemMessage: hookOutput.systemMessage,
      additionalContext: hookOutput.getAdditionalContext(),
    };
  }

  async fireAfterAgent(request: Part[], response: string, turn: Turn) {
    if (!this.config.getEnableHooks()) return {};
    if (turn.pendingToolCalls.length > 0) return {};

    const hookOutput = await this.config
      .getHookSystem()
      ?.fireAfterAgentEvent(partToString(request), response);
    if (!hookOutput) return {};

    return {
      stop: hookOutput.shouldStopExecution(),
      shouldContinue: hookOutput.isBlockingDecision(),
      reason: hookOutput.getEffectiveReason(),
      systemMessage: hookOutput.systemMessage,
      contextCleared: hookOutput.shouldClearContext(),
    };
  }

  async transformRequest(request: Part[]) {
    return request;
  }

  isGoalReached() {
    return false;
  }

  async getContinuationRequest(turn: Turn, signal: AbortSignal) {
    const nextSpeaker = await checkNextSpeaker(
      turn.chat,
      this.config.getBaseLlmClient(),
      signal,
      this.agentId,
    );
    if (nextSpeaker?.next_speaker === 'model') {
      return [{ text: 'Please continue.' }];
    }
    return null;
  }

  async *executeRecovery(): AsyncGenerator<ServerGeminiStreamEvent, boolean> {
    if (this.agentId === 'never') yield { type: GeminiEventType.Retry };
    return false;
  }

  getFinalFailureMessage() {
    return 'Execution terminated.';
  }
}

/**
 * Behavior for subagents.
 */
export class SubagentBehavior implements AgentBehavior {
  readonly agentId: string;
  readonly name: string;

  constructor(
    private readonly config: Config,
    private readonly definition: LocalAgentDefinition,
    private readonly inputs?: AgentInputs,
    parentPromptId?: string,
  ) {
    this.name = definition.name;
    const randomIdPart = Math.random().toString(36).slice(2, 8);
    const parentPrefix = parentPromptId ? `${parentPromptId}-` : '';
    this.agentId = `${parentPrefix}${this.name}-${randomIdPart}`;
  }

  async initialize(toolRegistry: ToolRegistry) {
    debugLogger.debug(
      `[SubagentBehavior] [${this.name}:${this.agentId}] Initializing tool registry`,
    );
    const parentToolRegistry = this.config.getToolRegistry();
    if (this.definition.toolConfig) {
      for (const toolRef of this.definition.toolConfig.tools) {
        if (typeof toolRef === 'string') {
          const tool = parentToolRegistry.getTool(toolRef);
          if (tool) toolRegistry.registerTool(tool);
        } else if (typeof toolRef === 'object' && 'build' in toolRef) {
          toolRegistry.registerTool(toolRef);
        }
      }
    } else {
      for (const toolName of parentToolRegistry.getAllToolNames()) {
        const tool = parentToolRegistry.getTool(toolName);
        if (tool) toolRegistry.registerTool(tool);
      }
    }
    toolRegistry.sortTools();
  }

  async getSystemInstruction() {
    const augmentedInputs = {
      ...this.inputs,
      cliVersion: await getVersion(),
      activeModel: this.config.getActiveModel(),
      today: new Date().toLocaleDateString(),
    };
    let prompt = templateString(
      this.definition.promptConfig.systemPrompt || '',
      augmentedInputs,
    );
    const dirContext = await getDirectoryContextString(this.config);
    prompt += `\n\n# Environment Context\n${dirContext}`;
    prompt += `\n\nImportant Rules:\n* You are running in a non-interactive mode. You CANNOT ask the user for input or clarification.\n* Work systematically using available tools to complete your task.\n* Always use absolute paths for file operations.`;

    const hasOutput = !!this.definition.outputConfig;
    prompt += `\n* When you have completed your task, you MUST call the \`${TASK_COMPLETE_TOOL_NAME}\` tool${hasOutput ? ' with your structured output' : ''}.`;

    return prompt;
  }

  async getInitialHistory() {
    const initialMessages = this.definition.promptConfig.initialMessages ?? [];
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

  prepareTools(baseTools: FunctionDeclaration[]) {
    const completeTool: FunctionDeclaration = {
      name: TASK_COMPLETE_TOOL_NAME,
      description:
        'Call this tool to submit your final answer and complete the task.',
      parameters: { type: Type.OBJECT, properties: {}, required: [] },
    };

    if (this.definition.outputConfig) {
      const schema = zodToJsonSchema(this.definition.outputConfig.schema);
      const {
        $schema: _,
        definitions: __,
        ...cleanSchema
      } = schema as Record<string, unknown>;
      completeTool.parameters!.properties![
        this.definition.outputConfig.outputName
      ] = cleanSchema as Schema;
      completeTool.parameters!.required!.push(
        this.definition.outputConfig.outputName,
      );
    } else {
      completeTool.parameters!.properties!['result'] = {
        type: Type.STRING,
        description: 'Your final results or findings.',
      };
      completeTool.parameters!.required!.push('result');
    }

    return [...baseTools, completeTool];
  }

  async syncEnvironment() {
    return {};
  }

  async fireBeforeAgent() {
    return {};
  }

  async fireAfterAgent() {
    return {};
  }

  async transformRequest(request: Part[]): Promise<Part[]> {
    if (
      request.length === 1 &&
      'text' in request[0] &&
      request[0].text === 'Start'
    ) {
      return [
        {
          text: this.definition.promptConfig.query
            ? templateString(
                this.definition.promptConfig.query,
                this.inputs || {},
              )
            : 'Get Started!',
        },
      ];
    }
    return request;
  }

  isGoalReached(
    toolResults: Array<{
      name: string;
      part: Part;
      result: ToolCallResponseInfo;
    }>,
  ) {
    const completeCall = toolResults.find(
      (r) => r.name === TASK_COMPLETE_TOOL_NAME,
    );
    if (completeCall) {
      // If there's an error in the call, we don't treat it as reached (model should retry)
      return !completeCall.part.functionResponse?.response?.['error'];
    }
    return false;
  }

  async getContinuationRequest() {
    return null;
  }

  async *executeRecovery(
    turn: Turn,
    reason: AgentTerminateMode,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent, boolean> {
    debugLogger.debug(
      `[SubagentBehavior] [${this.name}:${this.agentId}] Entering recovery mode. Reason: ${reason}`,
    );
    const recoveryStartTime = Date.now();
    let success = false;
    const graceTimeoutController = new DeadlineTimer(
      GRACE_PERIOD_MS,
      'Grace period timed out.',
    );
    const combinedSignal = AbortSignal.any([
      signal,
      graceTimeoutController.signal,
    ]);

    try {
      const recoveryMessage: Part[] = [
        { text: this.getFinalWarningMessage(reason) },
      ];
      const promptId = `${this.agentId}#recovery`;
      const recoveryStream = promptIdContext.run(promptId, () =>
        turn.run(
          { model: this.config.getActiveModel() },
          recoveryMessage,
          combinedSignal,
        ),
      );

      for await (const event of recoveryStream) {
        yield event;
      }

      // Check if they called complete_task in the recovery turn
      if (turn.pendingToolCalls.length > 0) {
        if (
          turn.pendingToolCalls.some((c) => c.name === TASK_COMPLETE_TOOL_NAME)
        ) {
          success = true;
        }
      }
    } finally {
      graceTimeoutController.abort();
      logRecoveryAttempt(
        this.config,
        new RecoveryAttemptEvent(
          this.agentId,
          this.name,
          reason,
          Date.now() - recoveryStartTime,
          success,
          0,
        ),
      );
    }
    return success;
  }

  private getFinalWarningMessage(reason: AgentTerminateMode): string {
    let explanation = '';
    switch (reason) {
      case AgentTerminateMode.TIMEOUT:
        explanation = 'You have exceeded the time limit.';
        break;
      case AgentTerminateMode.MAX_TURNS:
        explanation = 'You have exceeded the maximum number of turns.';
        break;
      case AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL:
        explanation = 'You have stopped calling tools without finishing.';
        break;
      default:
        explanation = 'Execution was interrupted.';
    }
    return `${explanation} You have one final chance to complete the task with a short grace period. You MUST call \`${TASK_COMPLETE_TOOL_NAME}\` immediately with your best answer and explain that your investigation was interrupted. Do not call any other tools.`;
  }

  getFinalFailureMessage(
    reason: AgentTerminateMode,
    maxTurns: number,
    maxTime: number,
  ) {
    switch (reason) {
      case AgentTerminateMode.TIMEOUT:
        return `Agent timed out after ${maxTime} minutes.`;
      case AgentTerminateMode.MAX_TURNS:
        return `Agent reached max turns limit (${maxTurns}).`;
      case AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL:
        return `Agent stopped calling tools but did not call '${TASK_COMPLETE_TOOL_NAME}'.`;
      default:
        return 'Agent execution was terminated before completion.';
    }
  }
}
