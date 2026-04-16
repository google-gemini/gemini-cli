/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  FunctionCall,
  FunctionDeclaration,
  Part,
} from '@google/genai';
import { GeminiChat, StreamEventType } from '../core/geminiChat.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import {
  type LocalAgentDefinition,
  type AgentInputs,
  DEFAULT_MAX_TIME_MINUTES,
  DEFAULT_MAX_TURNS,
} from '../agents/types.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import {
  type AnyDeclarativeTool,
  Kind,
  ToolConfirmationOutcome,
} from '../tools/tools.js';
import {
  DiscoveredMCPTool,
  isMcpToolName,
  parseMcpToolName,
  MCP_TOOL_PREFIX,
} from '../tools/mcp-tool.js';
import { ChatCompressionService } from '../context/chatCompressionService.js';
import { getDirectoryContextString } from '../utils/environmentContext.js';
import { renderUserMemory, renderAgentSkills } from '../prompts/snippets.js';
import { DEFAULT_GEMINI_MODEL, isAutoModel } from '../config/models.js';
import type { RoutingContext } from '../routing/routingStrategy.js';
import { parseThought } from '../utils/thoughtUtils.js';
import { getVersion } from '../utils/version.js';
import { getModelConfigAlias } from '../agents/registry.js';
import { templateString } from '../agents/utils.js';
import { scheduleAgentTools } from '../agents/agent-scheduler.js';
import { DeadlineTimer } from '../utils/deadlineTimer.js';
import { CompressionStatus } from '../core/turn.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage, isAbortError } from '../utils/errors.js';
import { promptIdContext } from '../utils/promptIdContext.js';
import { createUnauthorizedToolError } from '../agents/local-executor.js';
import { ForumPostTool, FORUM_POST_TOOL_NAME } from './tools/forum-post.js';
import type {
  ForumMemberActivity,
  ForumMemberRoundResult,
  ForumRoundPost,
} from './types.js';
import {
  createScopedWorkspaceContext,
  runWithScopedWorkspaceContext,
} from '../config/scoped-config.js';
import { ACTIVATE_SKILL_TOOL_NAME } from '../tools/definitions/base-declarations.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';
import { LlmRole } from '../telemetry/types.js';

const GRACE_PERIOD_MS = 60 * 1000;

function normalizeActivityText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isInlineFunctionDeclaration(
  toolRef: string | FunctionDeclaration | AnyDeclarativeTool,
): toolRef is FunctionDeclaration {
  return typeof toolRef !== 'string' && !('build' in toolRef);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasStringProperty<TKey extends string>(
  value: unknown,
  key: TKey,
): value is Record<TKey, string> {
  return isRecord(value) && typeof value[key] === 'string';
}

interface ForumPostToolData {
  pauseAgent: true;
  forumPost: string;
  readyToConclude?: boolean;
}

function isForumPostToolData(value: unknown): value is ForumPostToolData {
  return (
    isRecord(value) &&
    value['pauseAgent'] === true &&
    hasStringProperty(value, 'forumPost')
  );
}

export function formatForumThoughtActivity(rawText: string): string {
  const { subject, description } = parseThought(rawText);
  if (subject && description) {
    return normalizeActivityText(`${subject}: ${description}`);
  }
  return normalizeActivityText(subject || description);
}

const MAX_ARGS_SUMMARY_LEN = 140;
const MAX_VALUE_LEN = 60;

/**
 * Renders a tool-call arguments object as a compact one-line summary suitable
 * for inline display in a forum member's activity stream. Long strings are
 * clipped, nested values are summarised by shape, and the full result is
 * length-capped so the activity line stays readable.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatToolArgsSummary(args: unknown): string {
  if (args === null || args === undefined) return '';
  if (!isPlainObject(args)) {
    return clipArgValue(args);
  }
  const entries = Object.entries(args);
  if (entries.length === 0) return '';

  const parts: string[] = [];
  let used = 0;
  for (const [key, value] of entries) {
    const piece = `${key}=${clipArgValue(value)}`;
    if (used > 0 && used + piece.length + 2 > MAX_ARGS_SUMMARY_LEN) {
      parts.push('…');
      break;
    }
    parts.push(piece);
    used += piece.length + (parts.length > 1 ? 2 : 0);
  }

  let summary = parts.join(', ');
  if (summary.length > MAX_ARGS_SUMMARY_LEN) {
    summary = `${summary.slice(0, MAX_ARGS_SUMMARY_LEN - 1)}…`;
  }
  return summary;
}

function clipArgValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    const oneLine = value.replace(/\s+/g, ' ');
    return oneLine.length > MAX_VALUE_LEN
      ? `"${oneLine.slice(0, MAX_VALUE_LEN - 1)}…"`
      : `"${oneLine}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).length} keys}`;
  }
  return typeof value;
}

type SessionTurnResult =
  | {
      status: 'continue';
      nextMessage: Content;
    }
  | {
      status: 'paused';
      post: ForumRoundPost;
    }
  | {
      status: 'stop';
      error: string;
      aborted?: boolean;
    };

export class PersistentForumMemberSession {
  private readonly memberId: string;
  private readonly toolRegistry: ToolRegistry;
  private readonly promptRegistry: PromptRegistry;
  private readonly resourceRegistry: ResourceRegistry;
  private readonly compressionService: ChatCompressionService;
  private readonly context: AgentLoopContext;
  private readonly definition: LocalAgentDefinition;
  private readonly agentId = Math.random().toString(36).slice(2, 8);
  private readonly onActivity?: (activity: ForumMemberActivity) => void;

  private chat?: GeminiChat;
  private seedHistory: Content[] = [];
  private hasFailedCompressionAttempt = false;
  private promptCounter = 0;
  private lastThoughtText?: string;

  private constructor(
    memberId: string,
    definition: LocalAgentDefinition,
    context: AgentLoopContext,
    toolRegistry: ToolRegistry,
    promptRegistry: PromptRegistry,
    resourceRegistry: ResourceRegistry,
    onActivity?: (activity: ForumMemberActivity) => void,
  ) {
    this.memberId = memberId;
    this.definition = definition;
    this.context = context;
    this.toolRegistry = toolRegistry;
    this.promptRegistry = promptRegistry;
    this.resourceRegistry = resourceRegistry;
    this.compressionService = new ChatCompressionService();
    this.onActivity = onActivity;
  }

  static async create(
    memberId: string,
    definition: LocalAgentDefinition,
    context: AgentLoopContext,
    onActivity?: (activity: ForumMemberActivity) => void,
  ): Promise<PersistentForumMemberSession> {
    const subagentMessageBus = context.messageBus.derive(definition.name);
    const agentToolRegistry = new ToolRegistry(
      context.config,
      subagentMessageBus,
    );
    const agentPromptRegistry = new PromptRegistry();
    const agentResourceRegistry = new ResourceRegistry();

    if (definition.mcpServers) {
      const globalMcpManager = context.config.getMcpClientManager();
      if (globalMcpManager) {
        for (const [name, config] of Object.entries(definition.mcpServers)) {
          await globalMcpManager.maybeDiscoverMcpServer(name, config, {
            toolRegistry: agentToolRegistry,
            promptRegistry: agentPromptRegistry,
            resourceRegistry: agentResourceRegistry,
          });
        }
      }
    }

    const parentToolRegistry = context.toolRegistry;

    const registerToolInstance = (tool: AnyDeclarativeTool) => {
      if (tool.kind === Kind.Agent) {
        return;
      }
      agentToolRegistry.registerTool(tool.clone(subagentMessageBus));
    };

    const registerToolByName = (toolName: string) => {
      if (toolName === '*') {
        for (const tool of parentToolRegistry.getAllTools()) {
          registerToolInstance(tool);
        }
        return;
      }

      if (isMcpToolName(toolName)) {
        if (toolName === `${MCP_TOOL_PREFIX}*`) {
          for (const tool of parentToolRegistry.getAllTools()) {
            if (tool instanceof DiscoveredMCPTool) {
              registerToolInstance(tool);
            }
          }
          return;
        }

        const parsed = parseMcpToolName(toolName);
        if (parsed.serverName && parsed.toolName === '*') {
          for (const tool of parentToolRegistry.getToolsByServer(
            parsed.serverName,
          )) {
            registerToolInstance(tool);
          }
          return;
        }
      }

      const tool = parentToolRegistry.getTool(toolName);
      if (tool) {
        registerToolInstance(tool);
      }
    };

    if (definition.toolConfig) {
      for (const toolRef of definition.toolConfig.tools) {
        if (typeof toolRef === 'string') {
          registerToolByName(toolRef);
        } else if (
          typeof toolRef === 'object' &&
          'name' in toolRef &&
          'build' in toolRef
        ) {
          agentToolRegistry.registerTool(toolRef);
        }
      }
    } else {
      for (const toolName of parentToolRegistry.getAllToolNames()) {
        registerToolByName(toolName);
      }
    }

    agentToolRegistry.registerTool(new ForumPostTool(subagentMessageBus));
    agentToolRegistry.sortTools();

    return new PersistentForumMemberSession(
      memberId,
      definition,
      context,
      agentToolRegistry,
      agentPromptRegistry,
      agentResourceRegistry,
      onActivity,
    );
  }

  getLabel(): string {
    return this.definition.displayName ?? this.definition.name;
  }

  getMemberId(): string {
    return this.memberId;
  }

  seedMainConversationHistory(history: readonly Content[]): void {
    if (this.chat || history.length === 0) {
      return;
    }

    this.seedHistory = history.map((content) => ({
      ...content,
      parts: content.parts ? [...content.parts] : content.parts,
    }));
  }

  private get executionContext(): AgentLoopContext {
    return {
      config: this.context.config,
      promptId: this.agentId,
      parentSessionId: this.context.parentSessionId || this.context.promptId,
      geminiClient: this.context.geminiClient,
      sandboxManager: this.context.sandboxManager,
      toolRegistry: this.toolRegistry,
      promptRegistry: this.promptRegistry,
      resourceRegistry: this.resourceRegistry,
      messageBus: this.toolRegistry.getMessageBus(),
    };
  }

  async dispose(): Promise<void> {
    const globalMcpManager = this.context.config.getMcpClientManager();
    if (globalMcpManager) {
      globalMcpManager.removeRegistries({
        toolRegistry: this.toolRegistry,
        promptRegistry: this.promptRegistry,
        resourceRegistry: this.resourceRegistry,
      });
    }
  }

  async runRound(
    prompt: string,
    signal: AbortSignal,
  ): Promise<ForumMemberRoundResult> {
    this.lastThoughtText = undefined;
    const dirs = this.definition.workspaceDirectories;
    if (dirs && dirs.length > 0) {
      const scopedCtx = createScopedWorkspaceContext(
        this.context.config.getWorkspaceContext(),
        dirs,
      );
      return runWithScopedWorkspaceContext(scopedCtx, () =>
        this.runRoundInternal(prompt, signal),
      );
    }

    return this.runRoundInternal(prompt, signal);
  }

  private async runRoundInternal(
    prompt: string,
    signal: AbortSignal,
  ): Promise<ForumMemberRoundResult> {
    const maxTimeMinutes =
      this.definition.runConfig.maxTimeMinutes ?? DEFAULT_MAX_TIME_MINUTES;
    const maxTurns = this.definition.runConfig.maxTurns ?? DEFAULT_MAX_TURNS;

    const deadlineTimer = new DeadlineTimer(
      maxTimeMinutes * 60 * 1000,
      'Forum round timed out.',
    );
    const combinedSignal = AbortSignal.any([signal, deadlineTimer.signal]);

    const augmentedInputs: AgentInputs = {
      query: prompt,
      cliVersion: await getVersion(),
      activeModel: this.context.config.getActiveModel(),
      today: new Date().toLocaleDateString(),
    };

    try {
      const isFirstRound = !this.chat;
      if (!this.chat) {
        const tools = this.prepareToolsList();
        this.chat = await this.createChatObject(augmentedInputs, tools);
      }

      const chat = this.chat;
      if (!chat) {
        throw new Error('Forum chat was not initialized.');
      }

      const currentMessage = await this.buildRoundMessage(prompt, isFirstRound);
      let nextMessage = currentMessage;
      let turnCounter = 0;

      while (true) {
        if (turnCounter >= maxTurns) {
          const recovery = await this.executeFinalWarningTurn(
            'You have exceeded the maximum number of turns.',
            signal,
          );
          if (recovery) {
            return this.successResult(recovery);
          }
          return this.errorResult(
            `Round reached the max turns limit (${maxTurns}).`,
          );
        }

        if (combinedSignal.aborted) {
          return this.errorResult('Round was cancelled.', true);
        }

        const turnResult = await this.executeTurn(
          chat,
          nextMessage,
          combinedSignal,
        );
        turnCounter += 1;

        if (turnResult.status === 'continue') {
          nextMessage = turnResult.nextMessage;
          continue;
        }

        if (turnResult.status === 'paused') {
          return this.successResult(turnResult.post);
        }

        if (turnResult.aborted) {
          return this.errorResult(turnResult.error, true);
        }

        const recovery = await this.executeFinalWarningTurn(
          turnResult.error,
          signal,
        );
        if (recovery) {
          return this.successResult(recovery);
        }

        return this.errorResult(turnResult.error);
      }
    } catch (error) {
      if (isAbortError(error) || combinedSignal.aborted) {
        return this.errorResult(
          error instanceof Error && error.message
            ? error.message
            : 'Round was cancelled.',
          true,
        );
      }
      return this.errorResult(getErrorMessage(error));
    } finally {
      deadlineTimer.abort();
    }
  }

  private successResult(post: ForumRoundPost): ForumMemberRoundResult {
    return {
      memberId: this.memberId,
      label: this.getLabel(),
      post,
    };
  }

  private errorResult(
    error: string,
    aborted: boolean = false,
  ): ForumMemberRoundResult {
    return {
      memberId: this.memberId,
      label: this.getLabel(),
      error,
      aborted,
    };
  }

  private async buildRoundMessage(
    prompt: string,
    isFirstRound: boolean,
  ): Promise<Content> {
    const parts: Part[] = [];
    if (isFirstRound) {
      const environmentMemory = this.context.config.isJitContextEnabled?.()
        ? this.context.config.getSessionMemory()
        : this.context.config.getEnvironmentMemory();
      if (environmentMemory) {
        parts.push({ text: environmentMemory });
      }
    }
    parts.push({ text: prompt });
    return {
      role: 'user',
      parts,
    };
  }

  private async executeTurn(
    chat: GeminiChat,
    currentMessage: Content,
    signal: AbortSignal,
  ): Promise<SessionTurnResult> {
    const promptId = `${this.agentId}#${this.promptCounter++}`;

    await this.tryCompressChat(chat, promptId, signal);
    await this.definition.onBeforeTurn?.(chat, signal);

    const { functionCalls, modelToUse } = await promptIdContext.run(
      promptId,
      async () => this.callModel(chat, currentMessage, signal, promptId),
    );

    if (signal.aborted) {
      return {
        status: 'stop',
        error: 'Round was cancelled.',
        aborted: true,
      };
    }

    if (functionCalls.length === 0) {
      return {
        status: 'stop',
        error:
          'Agent stopped calling tools without posting to the forum via `forum_post`.',
      };
    }

    const processed = await this.processFunctionCalls(
      chat,
      modelToUse,
      functionCalls,
      signal,
      promptId,
    );

    if (processed.aborted) {
      return {
        status: 'stop',
        error: 'Round was cancelled.',
        aborted: true,
      };
    }

    if (processed.post) {
      return {
        status: 'paused',
        post: processed.post,
      };
    }

    return {
      status: 'continue',
      nextMessage: processed.nextMessage,
    };
  }

  private async executeFinalWarningTurn(
    reason: string,
    externalSignal: AbortSignal,
  ): Promise<ForumRoundPost | null> {
    if (!this.chat) {
      return null;
    }

    const graceTimeoutController = new AbortController();
    const graceTimeoutId = setTimeout(
      () => graceTimeoutController.abort(new Error('Grace period timed out.')),
      GRACE_PERIOD_MS,
    );

    try {
      const combinedSignal = AbortSignal.any([
        externalSignal,
        graceTimeoutController.signal,
      ]);

      const recoveryMessage: Content = {
        role: 'user',
        parts: [
          {
            text:
              `${reason} You have one final chance to recover. ` +
              `Call \`${FORUM_POST_TOOL_NAME}\` immediately with your best public findings for the forum. ` +
              'Do not call any other tools.',
          },
        ],
      };

      const recovery = await this.executeTurn(
        this.chat,
        recoveryMessage,
        combinedSignal,
      );

      if (recovery.status === 'paused') {
        return recovery.post;
      }

      return null;
    } finally {
      clearTimeout(graceTimeoutId);
    }
  }

  private async tryCompressChat(
    chat: GeminiChat,
    promptId: string,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const model = this.definition.modelConfig.model ?? DEFAULT_GEMINI_MODEL;
    const { newHistory, info } = await this.compressionService.compress(
      chat,
      promptId,
      false,
      model,
      this.context.config,
      this.hasFailedCompressionAttempt,
      abortSignal,
    );

    if (
      info.compressionStatus ===
      CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT
    ) {
      this.hasFailedCompressionAttempt = true;
    } else if (
      info.compressionStatus === CompressionStatus.COMPRESSED ||
      info.compressionStatus === CompressionStatus.CONTENT_TRUNCATED
    ) {
      if (newHistory) {
        chat.setHistory(newHistory);
      }
      if (info.compressionStatus === CompressionStatus.COMPRESSED) {
        this.hasFailedCompressionAttempt = false;
      }
    }
  }

  private async callModel(
    chat: GeminiChat,
    message: Content,
    signal: AbortSignal,
    promptId: string,
  ): Promise<{
    functionCalls: FunctionCall[];
    modelToUse: string;
  }> {
    const modelConfigAlias = getModelConfigAlias(this.definition);
    const resolvedConfig =
      this.context.config.modelConfigService.getResolvedConfig({
        model: modelConfigAlias,
        overrideScope: this.definition.name,
      });
    const requestedModel = resolvedConfig.model;

    let modelToUse: string;
    if (isAutoModel(requestedModel)) {
      try {
        const routingContext: RoutingContext = {
          history: chat.getHistory(true),
          request: message.parts || [],
          signal,
          requestedModel,
        };
        const router = this.context.config.getModelRouterService();
        const decision = await router.route(routingContext);
        modelToUse = decision.model;
      } catch {
        modelToUse = DEFAULT_GEMINI_MODEL;
      }
    } else {
      modelToUse = requestedModel;
    }

    const responseStream = await chat.sendMessageStream(
      {
        model: modelToUse,
        overrideScope: this.definition.name,
      },
      message.parts || [],
      promptId,
      signal,
      LlmRole.SUBAGENT,
    );

    const functionCalls: FunctionCall[] = [];
    for await (const resp of responseStream) {
      if (signal.aborted) {
        break;
      }

      if (resp.type !== StreamEventType.CHUNK) {
        continue;
      }

      const chunk = resp.value;
      const parts = chunk.candidates?.[0]?.content?.parts;
      const thoughtText =
        parts
          ?.filter((part) => part.thought && typeof part.text === 'string')
          .map((part) => part.text)
          .join('') || '';
      const thoughtActivity = formatForumThoughtActivity(thoughtText);
      if (thoughtActivity) {
        this.publishActivity('thinking', thoughtActivity);
      }
      if (chunk.functionCalls) {
        functionCalls.push(...chunk.functionCalls);
      }
    }

    return { functionCalls, modelToUse };
  }

  private async createChatObject(
    inputs: AgentInputs,
    tools: FunctionDeclaration[],
  ): Promise<GeminiChat> {
    const { promptConfig } = this.definition;
    if (!promptConfig.systemPrompt && !promptConfig.initialMessages) {
      throw new Error(
        'PromptConfig must define either `systemPrompt` or `initialMessages`.',
      );
    }

    const startHistory = [
      ...this.applyTemplateToInitialMessages(
        promptConfig.initialMessages ?? [],
        inputs,
      ),
      ...this.seedHistory,
    ];

    const systemInstruction = promptConfig.systemPrompt
      ? await this.buildSystemPrompt(inputs)
      : undefined;

    try {
      const chat = new GeminiChat(
        this.executionContext,
        systemInstruction,
        [{ functionDeclarations: tools }],
        startHistory,
        undefined,
        undefined,
      );
      await chat.initialize(undefined, 'subagent');
      return chat;
    } catch (error) {
      await reportError(
        error,
        `Error initializing forum chat for agent ${this.definition.name}.`,
        startHistory,
        'startChat',
      );
      throw new Error(
        `Failed to create chat object: ${getErrorMessage(error)}`,
      );
    }
  }

  private async processFunctionCalls(
    chat: GeminiChat,
    model: string,
    functionCalls: FunctionCall[],
    signal: AbortSignal,
    promptId: string,
  ): Promise<{
    nextMessage: Content;
    post?: ForumRoundPost;
    aborted: boolean;
  }> {
    const allowedToolNames = new Set(this.toolRegistry.getAllToolNames());
    const toolRequests: ToolCallRequestInfo[] = [];
    const toolNameMap = new Map<string, string>();
    const syncResults = new Map<string, Part>();
    let post: ForumRoundPost | undefined;
    let aborted = false;

    for (const [index, functionCall] of functionCalls.entries()) {
      const callId = functionCall.id ?? `${promptId}-${index}`;
      const { args, error: parseError } = this.parseToolArguments(functionCall);

      if (parseError) {
        syncResults.set(callId, {
          functionResponse: {
            name: functionCall.name,
            id: callId,
            response: { error: parseError },
          },
        });
        continue;
      }

      const toolName = String(functionCall.name);
      if (!allowedToolNames.has(toolName)) {
        const error = createUnauthorizedToolError(toolName);
        this.publishActivity('error', error);
        syncResults.set(callId, {
          functionResponse: {
            name: toolName,
            id: callId,
            response: { error },
          },
        });
        continue;
      }

      toolRequests.push({
        callId,
        name: toolName,
        args,
        isClientInitiated: false,
        prompt_id: promptId,
      });
      toolNameMap.set(callId, toolName);
      if (toolName !== FORUM_POST_TOOL_NAME) {
        const argsSummary = formatToolArgsSummary(args);
        const text = argsSummary
          ? `using ${toolName}(${argsSummary})`
          : `using ${toolName}`;
        this.publishActivity('tool', text);
      }
    }

    if (toolRequests.length > 0) {
      const completedCalls = await scheduleAgentTools(
        this.context.config,
        toolRequests,
        {
          schedulerId: promptId,
          subagent: this.definition.name,
          toolRegistry: this.toolRegistry,
          promptRegistry: this.promptRegistry,
          resourceRegistry: this.resourceRegistry,
          signal,
        },
      );

      chat.recordCompletedToolCalls(model, completedCalls);

      for (const call of completedCalls) {
        if (call.status === 'success') {
          const toolName =
            toolNameMap.get(call.request.callId) || call.request.name;
          const data = call.response.data;
          if (toolName === FORUM_POST_TOOL_NAME && isForumPostToolData(data)) {
            post = {
              message: data.forumPost,
              readyToConclude: data['readyToConclude'] === true,
            };
          } else {
            this.publishActivity('thinking', `reviewing ${toolName} output`);
          }
        } else if (call.status === 'cancelled') {
          const isSoftRejection =
            call.outcome === ToolConfirmationOutcome.Cancel;
          if (!isSoftRejection) {
            aborted = true;
          }
          this.publishActivity('error', `${call.request.name} was cancelled.`);
        } else {
          this.publishActivity('error', `${call.request.name} failed.`);
        }

        syncResults.set(call.request.callId, call.response.responseParts[0]);
      }
    }

    const toolResponseParts: Part[] = [];
    for (const [index, functionCall] of functionCalls.entries()) {
      const callId = functionCall.id ?? `${promptId}-${index}`;
      const part = syncResults.get(callId);
      if (part) {
        toolResponseParts.push(part);
      }
    }

    if (functionCalls.length > 0 && toolResponseParts.length === 0 && !post) {
      toolResponseParts.push({
        text: 'All tool calls failed or were unauthorized. Analyze the errors and try a different approach before posting again.',
      });
    }

    return {
      nextMessage: { role: 'user', parts: toolResponseParts },
      post,
      aborted,
    };
  }

  private prepareToolsList(): FunctionDeclaration[] {
    const toolsList: FunctionDeclaration[] = [];
    const { toolConfig } = this.definition;

    if (toolConfig) {
      for (const toolRef of toolConfig.tools) {
        if (isInlineFunctionDeclaration(toolRef)) {
          toolsList.push(toolRef);
        }
      }
    }

    toolsList.push(
      ...this.toolRegistry.getFunctionDeclarations(
        this.definition.modelConfig.model,
      ),
    );

    return toolsList;
  }

  private async buildSystemPrompt(inputs: AgentInputs): Promise<string> {
    const { promptConfig } = this.definition;
    if (!promptConfig.systemPrompt) {
      return '';
    }

    let finalPrompt = templateString(promptConfig.systemPrompt, inputs);

    if (this.toolRegistry.getTool(ACTIVATE_SKILL_TOOL_NAME) !== undefined) {
      const skills = this.context.config.getSkillManager().getSkills();
      if (skills.length > 0) {
        finalPrompt += `\n\n${renderAgentSkills(
          skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            location: skill.location,
          })),
        )}`;
      }
    }

    const systemMemory = this.context.config.getSystemInstructionMemory();
    if (systemMemory) {
      finalPrompt += `\n\n${renderUserMemory(systemMemory)}`;
    }

    const dirContext = await getDirectoryContextString(this.context.config);
    finalPrompt += `\n\n# Environment Context\n${dirContext}`;

    finalPrompt += `
Important Rules:
* You are running as one member of a multi-agent forum. Other members are investigating the same task in parallel.
* Work independently with the available tools, then post your public findings with \`${FORUM_POST_TOOL_NAME}\`.
* Each round MUST end by calling \`${FORUM_POST_TOOL_NAME}\` exactly once.
* Your forum post will be visible to the user and the other members in the next round.
* Do not ask the user for clarification. Incorporate any forum steer messages you receive.
* Always use absolute paths for file operations.
* If a tool call is rejected by the user, acknowledge it, rethink your strategy, and then continue to a forum post.`;

    return finalPrompt;
  }

  private applyTemplateToInitialMessages(
    initialMessages: Content[],
    inputs: AgentInputs,
  ): Content[] {
    return initialMessages.map((content) => ({
      ...content,
      parts: (content.parts ?? []).map((part) =>
        'text' in part && part.text !== undefined
          ? { text: templateString(part.text, inputs) }
          : part,
      ),
    }));
  }

  private parseToolArguments(functionCall: FunctionCall): {
    args: Record<string, unknown>;
    error?: string;
  } {
    if (typeof functionCall.args === 'string') {
      try {
        const parsed = JSON.parse(functionCall.args) as unknown;
        if (isRecord(parsed)) {
          return { args: parsed };
        }
        return { args: {} };
      } catch {
        return {
          args: {},
          error: `Failed to parse JSON arguments for tool "${functionCall.name}".`,
        };
      }
    }

    if (isRecord(functionCall.args)) {
      return { args: functionCall.args };
    }

    return { args: {} };
  }

  private publishActivity(
    activityKind: ForumMemberActivity['activityKind'],
    text: string,
  ): void {
    const normalized = normalizeActivityText(text);
    if (!normalized || !this.onActivity) {
      return;
    }

    if (activityKind === 'thinking') {
      if (this.lastThoughtText === normalized) {
        return;
      }
      this.lastThoughtText = normalized;
    }

    this.onActivity({
      memberId: this.memberId,
      label: this.getLabel(),
      activityKind,
      text: normalized,
    });
  }
}
