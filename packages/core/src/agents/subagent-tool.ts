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
} from '../tools/tools.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AgentDefinition, AgentInputs } from './types.js';
import { SubagentToolWrapper } from './subagent-tool-wrapper.js';
import { SchemaValidator } from '../utils/schemaValidator.js';

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
  }

  getDescription(): string {
    return `Delegating to agent '${this.definition.name}'`;
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const invocation = this.buildSubInvocation(this.definition, this.params);
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

    const invocation = this.buildSubInvocation(this.definition, this.params);

    return invocation.execute(signal, updateOutput);
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
