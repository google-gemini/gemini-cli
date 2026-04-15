/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  Kind,
  type ToolInvocation,
  type ToolResult,
  BaseToolInvocation,
  type ToolCallConfirmationDetails,
  type ExecuteOptions,
} from '../tools/tools.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AgentDefinition, AgentInputs } from './types.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import { RemoteAgentInvocation } from './remote-invocation.js';
import { BROWSER_AGENT_NAME } from './browser/browserAgentDefinition.js';
import { BrowserAgentInvocation } from './browser/browserAgentInvocation.js';
import { formatUserHintsForModel } from '../utils/fastAckHelper.js';
import { isRecord } from '../utils/markdownUtils.js';
import { runInDevTraceSpan } from '../telemetry/trace.js';
import {
  GeminiCliOperation,
  GEN_AI_AGENT_DESCRIPTION,
  GEN_AI_AGENT_NAME,
} from '../telemetry/constants.js';
import { AGENT_TOOL_NAME } from '../tools/tool-names.js';
import { CLOUD_SUBAGENT_NAME } from './cloud-subagent.js';

const CLOUD_DELEGATION_REASON_MAX_LENGTH = 120;
const CLOUD_DELEGATION_TASK_MAX_LENGTH = 140;
const CLOUD_DELEGATION_REASON_FALLBACK =
  'Complex work is better handled by the cloud subagent.';
const CLOUD_DELEGATION_TASK_FALLBACK = 'No task summary provided.';

function summarizeInputText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

/**
 * A unified tool for invoking subagents.
 *
 * Handles looking up the subagent, validating its eligibility,
 * mapping the general 'prompt' parameter to the agent's specific schema,
 * and delegating execution.
 */
export class AgentTool extends BaseDeclarativeTool<
  { agent_name: string; prompt: string },
  ToolResult
> {
  static readonly Name = AGENT_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      AGENT_TOOL_NAME,
      'Invoke Subagent',
      'Invoke a subagent to perform a specific task or investigation.',
      Kind.Agent,
      {
        type: 'object',
        properties: {
          agent_name: {
            type: 'string',
            description: 'Name of the subagent to invoke',
          },
          prompt: {
            type: 'string',
            description:
              'The COMPLETE query to send the subagent. MUST be comprehensive and detailed. Include all context, background, questions, and expected output format. Do NOT send brief or incomplete instructions.',
          },
        },
        required: ['agent_name', 'prompt'],
      },
      messageBus,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ true,
    );
  }

  protected createInvocation(
    params: { agent_name: string; prompt: string },
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<{ agent_name: string; prompt: string }, ToolResult> {
    const registry = this.context.config.getAgentRegistry();
    const definition = registry.getDefinition(params.agent_name);

    if (!definition) {
      throw new Error(`Subagent '${params.agent_name}' not found.`);
    }

    // Smart Parameter Mapping
    const mappedInputs = this.mapParams(
      params.prompt,
      definition.inputConfig.inputSchema,
    );

    return new DelegateInvocation(
      params,
      mappedInputs,
      messageBus,
      definition,
      this.context,
      _toolName,
      _toolDisplayName,
    );
  }

  private mapParams(prompt: string, schema: unknown): AgentInputs {
    const schemaObj: unknown = schema;
    if (!isRecord(schemaObj)) {
      return { prompt };
    }
    const properties = schemaObj['properties'];
    if (isRecord(properties)) {
      const keys = Object.keys(properties);
      if (keys.length === 1) {
        return { [keys[0]]: prompt };
      }
    }
    return { prompt };
  }
}

class DelegateInvocation extends BaseToolInvocation<
  { agent_name: string; prompt: string },
  ToolResult
> {
  private readonly startIndex: number;

  constructor(
    params: { agent_name: string; prompt: string },
    private readonly mappedInputs: AgentInputs,
    messageBus: MessageBus,
    private readonly definition: AgentDefinition,
    private readonly context: AgentLoopContext,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(
      params,
      messageBus,
      _toolName ?? AGENT_TOOL_NAME,
      _toolDisplayName ?? `Invoke ${definition.displayName ?? definition.name}`,
    );
    this.startIndex = context.config.injectionService.getLatestInjectionIndex();
  }

  getDescription(): string {
    if (this.definition.name === CLOUD_SUBAGENT_NAME) {
      return 'Delegating to cloud-subagent for complex cloud execution';
    }
    return `Delegating to agent '${this.definition.name}'`;
  }

  private buildChildInvocation(
    agentArgs: AgentInputs,
  ): ToolInvocation<AgentInputs, ToolResult> {
    if (this.definition.name === BROWSER_AGENT_NAME) {
      return new BrowserAgentInvocation(
        this.context,
        agentArgs,
        this.messageBus,
        this._toolName,
        this._toolDisplayName,
      );
    }

    if (this.definition.kind === 'remote') {
      return new RemoteAgentInvocation(
        this.definition,
        this.context,
        agentArgs,
        this.messageBus,
      );
    } else {
      return new LocalSubagentInvocation(
        this.definition,
        this.context,
        agentArgs,
        this.messageBus,
      );
    }
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.definition.name === CLOUD_SUBAGENT_NAME) {
      return super.shouldConfirmExecute(abortSignal);
    }
    const hintedParams = this.withUserHints(this.mappedInputs);
    const invocation = this.buildChildInvocation(hintedParams);
    return invocation.shouldConfirmExecute(abortSignal);
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.definition.name !== CLOUD_SUBAGENT_NAME) {
      return false;
    }

    const reason =
      summarizeInputText(
        this.mappedInputs['reason'],
        CLOUD_DELEGATION_REASON_MAX_LENGTH,
      ) ?? CLOUD_DELEGATION_REASON_FALLBACK;
    const task =
      summarizeInputText(
        this.mappedInputs['task'],
        CLOUD_DELEGATION_TASK_MAX_LENGTH,
      ) ?? CLOUD_DELEGATION_TASK_FALLBACK;

    return {
      type: 'info',
      title: 'Delegate to cloud-subagent',
      prompt: [`Reason: ${reason}`, `Task: ${task}`].join('\n'),
      onConfirm: async (_outcome) => {
        // Policy updates are handled centrally by the scheduler.
      },
    };
  }

  async execute(options: ExecuteOptions): Promise<ToolResult> {
    const { abortSignal: signal, updateOutput } = options;
    const hintedParams = this.withUserHints(this.mappedInputs);
    const invocation = this.buildChildInvocation(hintedParams);

    return runInDevTraceSpan(
      {
        operation: GeminiCliOperation.AgentCall,
        logPrompts: this.context.config.getTelemetryLogPromptsEnabled(),
        sessionId: this.context.config.getSessionId(),
        attributes: {
          [GEN_AI_AGENT_NAME]: this.definition.name,
          [GEN_AI_AGENT_DESCRIPTION]: this.definition.description,
        },
      },
      async ({ metadata }) => {
        metadata.input = this.params;
        const result = await invocation.execute({
          abortSignal: signal,
          updateOutput,
        });
        metadata.output = result;
        return result;
      },
    );
  }

  private withUserHints(agentArgs: AgentInputs): AgentInputs {
    if (this.definition.kind !== 'remote') {
      return agentArgs;
    }

    const userHints = this.context.config.injectionService.getInjectionsAfter(
      this.startIndex,
      'user_steering',
    );
    const formattedHints = formatUserHintsForModel(userHints);
    if (!formattedHints) {
      return agentArgs;
    }

    // Find the primary key to append hints to
    const schemaObj: unknown = this.definition.inputConfig.inputSchema;
    if (!isRecord(schemaObj)) {
      return agentArgs;
    }
    const properties = schemaObj['properties'];
    if (isRecord(properties)) {
      const keys = Object.keys(properties);
      const primaryKey = keys.length === 1 ? keys[0] : 'prompt';

      const value = agentArgs[primaryKey];
      if (typeof value !== 'string' || value.trim().length === 0) {
        return agentArgs;
      }

      return {
        ...agentArgs,
        [primaryKey]: `${formattedHints}\n\n${value}`,
      };
    }

    return agentArgs;
  }
}
