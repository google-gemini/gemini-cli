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
} from '../tools/tools.js';
import type { Config } from '../config/config.js';
import type { AgentDefinition, AgentInputs } from './types.js';
import { convertInputConfigToJsonSchema } from './schema-utils.js';
import { SubagentInvocation } from './invocation.js';

/**
 * A tool wrapper that dynamically exposes a subagent as a standard,
 * strongly-typed `DeclarativeTool`.
 */
export class SubagentToolWrapper extends BaseDeclarativeTool<
  AgentInputs,
  ToolResult
> {
  /**
   * Constructs the tool wrapper.
   *
   * The constructor dynamically generates the JSON schema for the tool's
   * parameters based on the subagent's input configuration.
   *
   * @param definition The `AgentDefinition` of the subagent to wrap.
   * @param config The runtime configuration, passed down to the subagent.
   */
  constructor(
    private readonly definition: AgentDefinition,
    private readonly config: Config,
  ) {
    // Dynamically generate the JSON schema required for the tool definition.
    const parameterSchema = convertInputConfigToJsonSchema(
      definition.inputConfig,
    );

    super(
      definition.name,
      definition.displayName ?? definition.name,
      definition.description,
      Kind.Think,
      parameterSchema,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ true,
    );
  }

  /**
   * Creates an invocation instance for executing the subagent.
   *
   * This method is called by the tool framework when the parent agent decides
   * to use this tool.
   *
   * @param params The validated input parameters from the parent agent's call.
   * @returns A `ToolInvocation` instance ready for execution.
   */
  protected createInvocation(
    params: AgentInputs,
  ): ToolInvocation<AgentInputs, ToolResult> {
    return new SubagentInvocation(params, this.definition, this.config);
  }
}
