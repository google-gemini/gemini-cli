/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gemini CLI tool wrapper for the V8 memory/performance investigation module.
 * Registers `investigate` as a first-class built-in tool so the LLM can call
 * it directly without going through a skill activation step.
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import {
  InvestigationExecutor,
  INVESTIGATION_TOOL_NAME,
  INVESTIGATION_TOOL_DESCRIPTION,
  INVESTIGATION_PARAMETER_SCHEMA,
  type InvestigationToolParams,
} from '../investigation/investigationTool.js';

// ─── Invocation ───────────────────────────────────────────────────────────────

class InvestigationToolInvocation extends BaseToolInvocation<
  InvestigationToolParams,
  ToolResult
> {
  /** Shared per-session executor (passed in by the tool) */
  private readonly executor: InvestigationExecutor;

  constructor(
    params: InvestigationToolParams,
    messageBus: MessageBus,
    executor: InvestigationExecutor,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
    this.executor = executor;
  }

  getDescription(): string {
    return `${this.params.action}${this.params.file_path ? ` on ${this.params.file_path}` : ''}${this.params.port ? ` (port ${this.params.port})` : ''}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const result = await this.executor.execute(this.params);

    const llmText = result.markdownReport ?? result.summary;
    const displayText = result.error
      ? `❌ ${result.error}`
      : result.markdownReport ?? result.summary;

    return {
      llmContent: llmText,
      returnDisplay: displayText,
    };
  }
}

// ─── Tool ────────────────────────────────────────────────────────────────────

/**
 * Built-in Gemini CLI tool for V8 memory and performance investigation.
 *
 * Exposes the `investigate` action to the LLM with a stable per-session
 * {@link InvestigationExecutor} so that state (last heap report, Perfetto
 * export, etc.) is preserved across multiple tool calls within one session.
 */
export class InvestigationTool extends BaseDeclarativeTool<
  InvestigationToolParams,
  ToolResult
> {
  static readonly Name = INVESTIGATION_TOOL_NAME;

  /** Single executor instance per tool instance (= per session). */
  private readonly executor: InvestigationExecutor;

  constructor(messageBus: MessageBus) {
    super(
      InvestigationTool.Name,
      'InvestigationTool',
      INVESTIGATION_TOOL_DESCRIPTION,
      Kind.Execute,
      INVESTIGATION_PARAMETER_SCHEMA,
      messageBus,
      /* requiresApproval */ false,
      /* isBackground */ false,
    );
    this.executor = new InvestigationExecutor();
  }

  protected createInvocation(
    params: InvestigationToolParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): InvestigationToolInvocation {
    return new InvestigationToolInvocation(
      params,
      messageBus,
      this.executor,
      toolName ?? this.name,
      toolDisplayName ?? this.displayName,
    );
  }
}
