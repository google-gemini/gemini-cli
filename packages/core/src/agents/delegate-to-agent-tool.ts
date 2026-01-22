/**
 * @license
 * Copyright 2025 Google LLC
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
import { DELEGATE_TO_AGENT_TOOL_NAME } from '../tools/tool-names.js';
import type { AgentRegistry } from './registry.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AgentDefinition, AgentInputs } from './types.js';
import { SubagentToolWrapper } from './subagent-tool-wrapper.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { type AnySchema } from 'ajv';
import { debugLogger } from '../utils/debugLogger.js';

export type DelegateParams = { agent_name: string } & Record<string, unknown>;

export class DelegateToAgentTool extends BaseDeclarativeTool<
  DelegateParams,
  ToolResult
> {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    const definitions = registry.getAllDefinitions();

    let toolSchema: AnySchema;

    if (definitions.length === 0) {
      // Fallback if no agents are registered (mostly for testing/safety)
      toolSchema = {
        type: 'object',
        properties: {
          agent_name: {
            type: 'string',
            description: 'No agents are currently available.',
          },
        },
        required: ['agent_name'],
      };
    } else {
      const agentSchemas = definitions.map((def) => {
        const schemaError = SchemaValidator.validateSchema(
          def.inputConfig.inputSchema,
        );
        if (schemaError) {
          throw new Error(`Invalid schema for ${def.name}: ${schemaError}`);
        }

        const inputSchema = def.inputConfig.inputSchema;
        if (typeof inputSchema !== 'object' || inputSchema === null) {
          throw new Error(`Agent '${def.name}' must provide an object schema.`);
        }

        const schemaObj = inputSchema as Record<string, unknown>;
        const properties = schemaObj['properties'] as
          | Record<string, unknown>
          | undefined;
        if (properties && 'agent_name' in properties) {
          throw new Error(
            `Agent '${def.name}' cannot have an input parameter named 'agent_name' as it is a reserved parameter for delegation.`,
          );
        }

        if (def.kind === 'remote') {
          if (!properties || !properties['query']) {
            debugLogger.log(
              'INFO',
              `Remote agent '${def.name}' does not define a 'query' property in its inputSchema. It will default to 'Get Started!' during invocation.`,
            );
          }
        }

        return {
          type: 'object',
          properties: {
            agent_name: {
              const: def.name,
              description: def.description,
            },
            ...(properties || {}),
          },
          required: [
            'agent_name',
            ...((schemaObj['required'] as string[]) || []),
          ],
        } as AnySchema;
      });

      // Create the anyOf schema
      if (agentSchemas.length === 1) {
        toolSchema = agentSchemas[0];
      } else {
        toolSchema = {
          anyOf: agentSchemas,
        };
      }
    }

    super(
      DELEGATE_TO_AGENT_TOOL_NAME,
      'Delegate to Agent',
      registry.getToolDescription(),
      Kind.Think,
      toolSchema,
      messageBus,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ true,
    );
  }

  override validateToolParams(_params: DelegateParams): string | null {
    // We override the default schema validation because the generic JSON schema validation
    // produces poor error messages for discriminated unions (anyOf).
    // Instead, we perform detailed, agent-specific validation in the `execute` method
    // to provide rich error messages that help the LLM self-heal.
    return null;
  }

  protected createInvocation(
    params: DelegateParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DelegateParams, ToolResult> {
    return new DelegateInvocation(
      params,
      this.registry,
      this.config,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

class DelegateInvocation extends BaseToolInvocation<
  DelegateParams,
  ToolResult
> {
  constructor(
    params: DelegateParams,
    private readonly registry: AgentRegistry,
    private readonly config: Config,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(
      params,
      messageBus,
      _toolName ?? DELEGATE_TO_AGENT_TOOL_NAME,
      _toolDisplayName,
    );
  }

  getDescription(): string {
    return `Delegating to agent '${this.params.agent_name}'`;
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const definition = this.registry.getDefinition(this.params.agent_name);
    if (!definition || definition.kind !== 'remote') {
      // Local agents should execute without confirmation. Inner tool calls will bubble up their own confirmations to the user.
      return false;
    }

    const { agent_name: _agent_name, ...agentArgs } = this.params;
    const invocation = this.buildSubInvocation(
      definition,
      agentArgs as AgentInputs,
    );
    return invocation.shouldConfirmExecute(abortSignal);
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    const definition = this.registry.getDefinition(this.params.agent_name);
    if (!definition) {
      const availableAgents = this.registry
        .getAllDefinitions()
        .map((def) => `'${def.name}' (${def.description})`)
        .join(', ');

      throw new Error(
        `Agent '${this.params.agent_name}' not found. Available agents are: ${availableAgents}. Please choose a valid agent_name.`,
      );
    }

    const { agent_name: _agent_name, ...agentArgs } = this.params;

    // Validate specific agent arguments here using SchemaValidator to generate helpful error messages.
    const validationError = SchemaValidator.validate(
      definition.inputConfig.inputSchema,
      agentArgs,
    );

    if (validationError) {
      throw new Error(
        `Invalid arguments for agent '${definition.name}': ${validationError}. Input schema: ${JSON.stringify(definition.inputConfig.inputSchema)}.`,
      );
    }

    const invocation = this.buildSubInvocation(
      definition,
      agentArgs as AgentInputs,
    );

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
