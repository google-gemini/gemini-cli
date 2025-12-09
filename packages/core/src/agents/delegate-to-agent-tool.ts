/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  BaseDeclarativeTool,
  Kind,
  type ToolInvocation,
  type ToolResult,
  BaseToolInvocation,
} from '../tools/tools.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { DELEGATE_TO_AGENT_TOOL_NAME } from '../tools/tool-names.js';
import type { AgentRegistry } from './registry.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { SubagentInvocation } from './invocation.js';
import type { AgentInputs } from './types.js';

type DelegateParams = { agentName: string } & Record<string, unknown>;

export class DelegateToAgentTool extends BaseDeclarativeTool<
  DelegateParams,
  ToolResult
> {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    const definitions = registry.getAllDefinitions();

    let schema: z.ZodTypeAny;

    if (definitions.length === 0) {
      // Fallback if no agents are registered (mostly for testing/safety)
      schema = z.object({
        agentName: z.string().describe('No agents are currently available.'),
      });
    } else {
      const agentSchemas = definitions.map((def) => {
        const inputShape: Record<string, z.ZodTypeAny> = {
          agentName: z.literal(def.name).describe(def.description),
        };

        for (const [key, inputDef] of Object.entries(def.inputConfig.inputs)) {
          if (key === 'agentName') {
            throw new Error(
              `Agent '${def.name}' cannot have an input parameter named 'agentName' as it is a reserved parameter for delegation.`,
            );
          }

          let validator: z.ZodTypeAny = z.unknown();

          // Map input types to Zod
          if (inputDef.type === 'string') validator = z.string();
          else if (inputDef.type === 'number') validator = z.number();
          else if (inputDef.type === 'boolean') validator = z.boolean();
          else if (inputDef.type === 'integer') validator = z.number().int();
          else if (inputDef.type === 'string[]')
            validator = z.array(z.string());
          else if (inputDef.type === 'number[]')
            validator = z.array(z.number());

          if (!inputDef.required) validator = validator.optional();

          inputShape[key] = validator.describe(inputDef.description);
        }

        // Cast required because Zod can't infer the discriminator from dynamic keys
        return z.object(
          inputShape,
        ) as z.ZodDiscriminatedUnionOption<'agentName'>;
      });

      // Create the discriminated union
      // z.discriminatedUnion requires at least 2 options, so we handle the single agent case
      if (agentSchemas.length === 1) {
        schema = agentSchemas[0];
      } else {
        schema = z.discriminatedUnion(
          'agentName',
          agentSchemas as [
            z.ZodDiscriminatedUnionOption<'agentName'>,
            z.ZodDiscriminatedUnionOption<'agentName'>,
            ...Array<z.ZodDiscriminatedUnionOption<'agentName'>>,
          ],
        );
      }
    }

    const agentList =
      definitions.length > 0
        ? definitions.map((d) => d.name).join(', ')
        : 'none';

    super(
      DELEGATE_TO_AGENT_TOOL_NAME,
      'Delegate to Agent',
      `Delegates to a specialized sub-agent (available: ${agentList}). Use for deep analysis tasks like bug investigation or refactoring scope.`,
      Kind.Think,
      zodToJsonSchema(schema),
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ true,
      messageBus,
    );
  }

  protected createInvocation(
    params: DelegateParams,
  ): ToolInvocation<DelegateParams, ToolResult> {
    return new DelegateInvocation(
      params,
      this.registry,
      this.config,
      this.messageBus,
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
    messageBus?: MessageBus,
  ) {
    super(params, messageBus);
  }

  getDescription(): string {
    return `Delegating to agent '${this.params.agentName}'`;
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    const definition = this.registry.getDefinition(this.params.agentName);
    if (!definition) {
      throw new Error(
        `Agent '${this.params.agentName}' exists in the tool definition but could not be found in the registry.`,
      );
    }

    // Extract arguments (everything except agentName)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { agentName, ...agentArgs } = this.params;

    // Instantiate the Subagent Loop
    const subagentInvocation = new SubagentInvocation(
      agentArgs as AgentInputs,
      definition,
      this.config,
      this.messageBus,
    );

    return subagentInvocation.execute(signal, updateOutput);
  }
}
