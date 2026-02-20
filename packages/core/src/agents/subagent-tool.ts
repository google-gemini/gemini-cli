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
  isTool,
} from '../tools/tools.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AgentDefinition, AgentInputs } from './types.js';
import { SubagentToolWrapper } from './subagent-tool-wrapper.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { formatUserHintsForModel } from '../utils/fastAckHelper.js';

export class SubagentTool extends BaseDeclarativeTool<AgentInputs, ToolResult> {
  constructor(
    private readonly definition: AgentDefinition,
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    const inputSchema = definition.inputConfig.inputSchema;

    // Validate schema on construction
    const schemaError = SchemaValidator.validateSchema(inputSchema);
    if (schemaError) {
      throw new Error(
        `Invalid schema for agent ${definition.name}: ${schemaError}`,
      );
    }

    super(
      definition.name,
      definition.displayName ?? definition.name,
      definition.description,
      Kind.Think,
      inputSchema,
      messageBus,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ true,
    );
  }

  private _memoizedIsReadOnly: boolean | undefined;

  override get isReadOnly(): boolean {
    if (this._memoizedIsReadOnly !== undefined) {
      return this._memoizedIsReadOnly;
    }
    // No try-catch here. If getToolRegistry() throws, we let it throw.
    // This is an invariant: you can't check read-only status if the system isn't initialized.
    this._memoizedIsReadOnly = SubagentTool.checkIsReadOnly(
      this.definition,
      this.config,
    );
    return this._memoizedIsReadOnly;
  }

  private static checkIsReadOnly(
    definition: AgentDefinition,
    config: Config,
  ): boolean {
    if (definition.kind === 'remote') {
      return false;
    }
    const tools = definition.toolConfig?.tools ?? [];
    const registry = config.getToolRegistry();

    if (!registry) {
      return false;
    }

    for (const tool of tools) {
      if (typeof tool === 'string') {
        const resolvedTool = registry.getTool(tool);
        if (!resolvedTool || !resolvedTool.isReadOnly) {
          return false;
        }
      } else if (isTool(tool)) {
        if (!tool.isReadOnly) {
          return false;
        }
      } else {
        // FunctionDeclaration - we don't know, so assume NOT read-only
        return false;
      }
    }
    return true;
  }

  protected createInvocation(
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<AgentInputs, ToolResult> {
    return new SubAgentInvocation(
      params,
      this.definition,
      this.config,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

class SubAgentInvocation extends BaseToolInvocation<AgentInputs, ToolResult> {
  private readonly startIndex: number;

  constructor(
    params: AgentInputs,
    private readonly definition: AgentDefinition,
    private readonly config: Config,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(
      params,
      messageBus,
      _toolName ?? definition.name,
      _toolDisplayName ?? definition.displayName ?? definition.name,
    );
    this.startIndex = config.userHintService.getLatestHintIndex();
  }

  getDescription(): string {
    return `Delegating to agent '${this.definition.name}'`;
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const invocation = this.buildSubInvocation(
      this.definition,
      this.withUserHints(this.params),
    );
    return invocation.shouldConfirmExecute(abortSignal);
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    const validationError = SchemaValidator.validate(
      this.definition.inputConfig.inputSchema,
      this.params,
    );

    if (validationError) {
      throw new Error(
        `Invalid arguments for agent '${this.definition.name}': ${validationError}. Input schema: ${JSON.stringify(this.definition.inputConfig.inputSchema)}.`,
      );
    }

    const invocation = this.buildSubInvocation(
      this.definition,
      this.withUserHints(this.params),
    );

    return invocation.execute(signal, updateOutput);
  }

  private withUserHints(agentArgs: AgentInputs): AgentInputs {
    if (this.definition.kind !== 'remote') {
      return agentArgs;
    }

    const userHints = this.config.userHintService.getUserHintsAfter(
      this.startIndex,
    );
    const formattedHints = formatUserHintsForModel(userHints);
    if (!formattedHints) {
      return agentArgs;
    }

    const query = agentArgs['query'];
    if (typeof query !== 'string' || query.trim().length === 0) {
      return agentArgs;
    }

    return {
      ...agentArgs,
      query: `${formattedHints}\n\n${query}`,
    };
  }

  private buildSubInvocation(
    definition: AgentDefinition,
    agentArgs: AgentInputs,
  ): ToolInvocation<AgentInputs, ToolResult> {
    const wrapper = new SubagentToolWrapper(
      definition,
      this.config,
      this.messageBus,
    );

    return wrapper.build(agentArgs);
  }
}
