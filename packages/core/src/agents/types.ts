/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Defines the core configuration interfaces and types for the agent architecture.
 */

import type { Content, FunctionDeclaration } from '@google/genai';
import type { AnyDeclarativeTool } from '../tools/tools.js';
import { type z } from 'zod';
import type { JSONSchema7 } from 'json-schema';

/**
 * Describes the possible termination modes for an agent.
 */
export enum AgentTerminateMode {
  ERROR = 'ERROR',
  TIMEOUT = 'TIMEOUT',
  GOAL = 'GOAL',
  MAX_TURNS = 'MAX_TURNS',
  ABORTED = 'ABORTED',
  ERROR_NO_COMPLETE_TASK_CALL = 'ERROR_NO_COMPLETE_TASK_CALL',
}

/**
 * Represents the output structure of an agent's execution.
 */
export interface OutputObject {
  result: string;
  terminate_reason: AgentTerminateMode;
}

/**
 * Represents the validated input parameters passed to an agent upon invocation.
 * Used primarily for templating the system prompt. (Replaces ContextState)
 */
export type AgentInputs = Record<string, unknown>;

/**
 * Structured events emitted during subagent execution for user observability.
 */
export interface SubagentActivityEvent {
  isSubagentActivityEvent: true;
  agentName: string;
  type: 'TOOL_CALL_START' | 'TOOL_CALL_END' | 'THOUGHT_CHUNK' | 'ERROR';
  data: Record<string, unknown>;
}

/**
 * The definition for an agent.
 * @template TOutput The specific Zod schema for the agent's final output object.
 */
export interface AgentDefinition<TOutput extends z.ZodTypeAny = z.ZodUnknown> {
  /** Unique identifier for the agent. */
  name: string;
  displayName?: string;
  description: string;
  promptConfig: PromptConfig;
  modelConfig: ModelConfig;
  runConfig: RunConfig;
  toolConfig?: ToolConfig;
  outputConfig?: OutputConfig<TOutput>;
  inputConfig: InputConfig;
  /**
   * An optional function to process the raw output from the agent's final tool
   * call into a string format.
   *
   * @param output The raw output value from the `complete_task` tool, now strongly typed with TOutput.
   * @returns A string representation of the final output.
   */
  processOutput?: (output: z.infer<TOutput>) => string;
}

/**
 * Configures the initial prompt for the agent.
 */
export interface PromptConfig {
  /**
   * A single system prompt string. Supports templating using `${input_name}` syntax.
   */
  systemPrompt?: string;
  /**
   * An array of user/model content pairs for few-shot prompting.
   */
  initialMessages?: Content[];

  /**
   * The specific task or question to trigger the agent's execution loop.
   * This is sent as the first user message, distinct from the systemPrompt (identity/rules)
   * and initialMessages (history/few-shots). Supports templating.
   * If not provided, a generic "Get Started!" message is used.
   */
  query?: string;
}

/**
 * Configures the tools available to the agent during its execution.
 */
export interface ToolConfig {
  tools: Array<string | FunctionDeclaration | AnyDeclarativeTool>;
}

/**
 * New format: Uses standard JSONSchema7 for validation and tool generation.
 * This is the preferred format going forward.
 */
export interface InputConfigNew {
  /**
   * Standard JSON Schema (draft-07) for validation and tool generation.
   * Supports advanced features like enum, oneOf, nested objects, etc.
   */
  inputSchema: JSONSchema7;
}

/**
 * Legacy format: Uses custom type descriptors.
 * @deprecated Use InputConfigNew with inputSchema instead. This format will be
 * removed in a future version.
 */
export interface InputConfigLegacy {
  /**
   * Defines the parameters the agent accepts using a simplified type system.
   * This is vital for generating the tool wrapper schema.
   * @deprecated Use inputSchema with JSONSchema7 instead.
   */
  inputs: Record<
    string,
    {
      description: string;
      type:
        | 'string'
        | 'number'
        | 'boolean'
        | 'integer'
        | 'string[]'
        | 'number[]';
      required: boolean;
    }
  >;
}

/**
 * Configures the expected inputs (parameters) for the agent.
 * Supports both the new JSONSchema7 format and the legacy format for backward compatibility.
 */
export type InputConfig = InputConfigNew | InputConfigLegacy;

/**
 * Configures the expected outputs for the agent.
 */
export interface OutputConfig<T extends z.ZodTypeAny> {
  /**
   * The name of the final result parameter. This will be the name of the
   * argument in the `submit_final_output` tool (e.g., "report", "answer").
   */
  outputName: string;
  /**
   * A description of the expected output. This will be used as the description
   * for the tool argument.
   */
  description: string;
  /**
   * Optional JSON schema for the output. If provided, it will be used as the
   * schema for the tool's argument, allowing for structured output enforcement.
   * Defaults to { type: 'string' }.
   */
  schema: T;
}

/**
 * Configures the generative model parameters for the agent.
 */
export interface ModelConfig {
  model: string;
  temp: number;
  top_p: number;
  thinkingBudget?: number;
}

/**
 * Configures the execution environment and constraints for the agent.
 */
export interface RunConfig {
  /** The maximum execution time for the agent in minutes. */
  max_time_minutes: number;
  /** The maximum number of conversational turns. */
  max_turns?: number;
}
