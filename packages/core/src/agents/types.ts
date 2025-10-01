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

/**
 * Describes the possible termination modes for an agent.
 */
export enum AgentTerminateMode {
  ERROR = 'ERROR',
  TIMEOUT = 'TIMEOUT',
  GOAL = 'GOAL',
  MAX_TURNS = 'MAX_TURNS',
  ABORTED = 'ABORTED',
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
 */
export interface AgentDefinition {
  /** Unique identifier for the agent. */
  name: string;
  displayName?: string;
  description: string;
  promptConfig: PromptConfig;
  modelConfig: ModelConfig;
  runConfig: RunConfig;
  toolConfig?: ToolConfig;
  outputConfig?: OutputConfig;
  inputConfig: InputConfig;
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
 * Configures the expected inputs (parameters) for the agent.
 */
export interface InputConfig {
  /**
   * Defines the parameters the agent accepts.
   * This is vital for generating the tool wrapper schema.
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
 * Configures the expected outputs for the agent.
 */
export interface OutputConfig {
  /** Description of what the agent should return when finished. */
  description: string;
  /** Optional criteria that must be completed before the agent finishes. */
  completion_criteria?: string[];
  // TODO(abhipatel12): Add required_outputs if natural completion insufficient
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
