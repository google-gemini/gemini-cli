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
  type ToolLiveOutput,
} from '../tools/tools.js';
import type { Config } from '../config/config.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AgentDefinition, AgentInputs } from './types.js';
import { SubagentToolWrapper } from './subagent-tool-wrapper.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { formatUserHintsForModel } from '../utils/fastAckHelper.js';
import { runInDevTraceSpan } from '../telemetry/trace.js';
import {
  GeminiCliOperation,
  GEN_AI_AGENT_DESCRIPTION,
  GEN_AI_AGENT_NAME,
} from '../telemetry/constants.js';

/**
 * Extracts missing required fields from a schema validation error.
 */
function extractMissingFieldsFromError(error: string): string[] {
  const matches = error.match(/'([^']+)'\s*(?:is required|must be defined)/gi);
  return matches ? matches.map((m) => m.replace(/['"]/g, '').trim()) : [];
}

/**
 * Creates a helpful example input based on schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createExampleInput(schema: any): Record<string, unknown> {
  const example: Record<string, unknown> = {};
  if (schema?.properties && typeof schema.properties === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const requiredFields = (schema.required ?? []) as string[];
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (requiredFields.includes(key)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        const propConfig = prop as any;

        if (propConfig.type === 'string') {
          example[key] = `[Example value for ${key}]`;
        } else if (propConfig.type === 'object') {
          example[key] = {
            /* nested */
          };
        } else if (propConfig.type === 'array') {
          example[key] = [];
        } else {
          example[key] = null;
        }
      }
    }
  }
  return example;
}

export class SubagentTool extends BaseDeclarativeTool<AgentInputs, ToolResult> {
  constructor(
    private readonly definition: AgentDefinition,
    private readonly context: AgentLoopContext,
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
      Kind.Agent,
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
      this.context,
    );
    return this._memoizedIsReadOnly;
  }

  private static checkIsReadOnly(
    definition: AgentDefinition,
    context: AgentLoopContext,
  ): boolean {
    if (definition.kind === 'remote') {
      return false;
    }
    const tools = definition.toolConfig?.tools ?? [];
    const registry = context.toolRegistry;

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
      this.context,
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
    private readonly context: AgentLoopContext,
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
    this.startIndex = context.config.injectionService.getLatestInjectionIndex();
  }

  private get config(): Config {
    return this.context.config;
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
    updateOutput?: (output: ToolLiveOutput) => void,
  ): Promise<ToolResult> {
    const validationError = SchemaValidator.validate(
      this.definition.inputConfig.inputSchema,
      this.params,
    );

    if (validationError) {
      const schema = this.definition.inputConfig.inputSchema;
      const missingFields = extractMissingFieldsFromError(validationError);
      const example = createExampleInput(schema);

      const message = [
        `Invalid arguments for agent '${this.definition.name}': ${validationError}`,
        '',
        'MISSING FIELDS: ' +
          (missingFields.length > 0
            ? missingFields.join(', ')
            : '(unknown - see schema below)'),
        '',
        'EXPECTED SCHEMA:',
        JSON.stringify(schema, null, 2),
        '',
        'VALID EXAMPLE:',
        JSON.stringify(example, null, 2),
      ].join('\n');

      throw new Error(message);
    }

    const invocation = this.buildSubInvocation(
      this.definition,
      this.withUserHints(this.params),
    );

    return runInDevTraceSpan(
      {
        operation: GeminiCliOperation.AgentCall,
        logPrompts: this.context.config.getTelemetryLogPromptsEnabled(),
        attributes: {
          [GEN_AI_AGENT_NAME]: this.definition.name,
          [GEN_AI_AGENT_DESCRIPTION]: this.definition.description,
        },
      },
      async ({ metadata }) => {
        metadata.input = this.params;
        const result = await invocation.execute(signal, updateOutput);
        metadata.output = result;
        return result;
      },
    );
  }

  private withUserHints(agentArgs: AgentInputs): AgentInputs {
    if (this.definition.kind !== 'remote') {
      return agentArgs;
    }

    const userHints = this.config.injectionService.getInjectionsAfter(
      this.startIndex,
      'user_steering',
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
      this.context,
      this.messageBus,
    );

    return wrapper.build(agentArgs);
  }
}
