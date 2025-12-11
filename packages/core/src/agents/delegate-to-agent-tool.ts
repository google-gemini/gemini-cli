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
import { SchemaValidator } from '../utils/schemaValidator.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { JSONSchema7 } from 'json-schema';

type DelegateParams = { agent_name: string } & Record<string, unknown>;

export class DelegateToAgentTool extends BaseDeclarativeTool<
  DelegateParams,
  ToolResult
> {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    const definitions = registry
      .getAllDefinitions()
      .filter((def) => registry.isAgentEnabled(def.name));

    let jsonSchema: JSONSchema7;

    if (definitions.length === 0) {
      // Fallback if no agents are registered (mostly for testing/safety)
      jsonSchema = {
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
      const agentSchemas = definitions
        .map((def) => {
          // Check if agent uses new or legacy format
          if ('inputSchema' in def.inputConfig) {
            // New format: Use JSONSchema7 directly
            const schemaError = SchemaValidator.validateSchema(
              def.inputConfig.inputSchema,
            );
            if (schemaError) {
              debugLogger.warn(
                `Skipping agent '${def.name}' due to invalid schema: ${schemaError}`,
              );
              return null;
            }

            // Validate schema is object type with properties
            if (
              def.inputConfig.inputSchema.type !== 'object' ||
              !def.inputConfig.inputSchema.properties
            ) {
              debugLogger.warn(
                `Skipping agent '${def.name}': inputSchema must have type "object" and define properties.`,
              );
              return null;
            }

            // Check for reserved 'agent_name' parameter
            if (def.inputConfig.inputSchema.properties['agent_name']) {
              debugLogger.warn(
                `Skipping agent '${def.name}': cannot have an input parameter named 'agent_name' as it is a reserved parameter for delegation.`,
              );
              return null;
            }

            // Merge agent_name with the agent's schema
            return {
              type: 'object' as const,
              properties: {
                agent_name: {
                  const: def.name,
                  description: def.description,
                },
                ...def.inputConfig.inputSchema.properties,
              },
              required: [
                'agent_name',
                ...(def.inputConfig.inputSchema.required || []),
              ],
            };
          } else {
            // Legacy format: Fallback to Zod mapping with deprecation warning
            debugLogger.warn(
              `[DelegateToAgentTool] Agent '${def.name}' uses deprecated InputConfig.inputs format. ` +
                'Migrate to InputConfig.inputSchema with JSONSchema7. ' +
                'The legacy format will be removed in a future version.',
            );

            const inputShape: Record<string, z.ZodTypeAny> = {
              agent_name: z.literal(def.name).describe(def.description),
            };

            for (const [key, inputDef] of Object.entries(
              def.inputConfig.inputs,
            )) {
              if (key === 'agent_name') {
                debugLogger.warn(
                  `Skipping agent '${def.name}': cannot have an input parameter named 'agent_name' as it is a reserved parameter for delegation.`,
                );
                return null;
              }

              let validator: z.ZodTypeAny;

              // Map input types to Zod (legacy path)
              switch (inputDef.type) {
                case 'string':
                  validator = z.string();
                  break;
                case 'number':
                  validator = z.number();
                  break;
                case 'boolean':
                  validator = z.boolean();
                  break;
                case 'integer':
                  validator = z.number().int();
                  break;
                case 'string[]':
                  validator = z.array(z.string());
                  break;
                case 'number[]':
                  validator = z.array(z.number());
                  break;
                default: {
                  debugLogger.warn(
                    `Skipping agent '${def.name}': unhandled agent input type '${inputDef.type}'.`,
                  );
                  return null;
                }
              }

              if (!inputDef.required) {
                validator = validator.optional();
              }

              inputShape[key] = validator.describe(inputDef.description);
            }

            // Convert Zod schema to JSON Schema for legacy format
            const zodSchema = z.object(inputShape);
            return zodToJsonSchema(zodSchema) as JSONSchema7;
          }
        })
        .filter((schema): schema is JSONSchema7 => schema !== null);

      // Create the discriminated union using oneOf
      if (agentSchemas.length === 0) {
        // Fallback if all agents were filtered out
        jsonSchema = {
          type: 'object',
          properties: {
            agent_name: {
              type: 'string',
              description: 'No valid agents are currently available.',
            },
          },
          required: ['agent_name'],
        };
      } else if (agentSchemas.length === 1) {
        jsonSchema = agentSchemas[0];
      } else {
        jsonSchema = {
          oneOf: agentSchemas,
        };
      }
    }

    super(
      DELEGATE_TO_AGENT_TOOL_NAME,
      'Delegate to Agent',
      registry.getToolDescription(),
      Kind.Think,
      jsonSchema,
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
    super(params, messageBus, DELEGATE_TO_AGENT_TOOL_NAME);
  }

  getDescription(): string {
    return `Delegating to agent '${this.params.agent_name}'`;
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    const definition = this.registry.getDefinition(this.params.agent_name);
    if (!definition || !this.registry.isAgentEnabled(this.params.agent_name)) {
      throw new Error(
        `Agent '${this.params.agent_name}' is not available or has been disabled.`,
      );
    }

    // Extract arguments (everything except agent_name)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { agent_name, ...agentArgs } = this.params;

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
