/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { PRESENT_PLAN_TOOL_NAME } from './tool-names.js';

export const PRESENT_PLAN_DESCRIPTION = `Present a completed implementation plan for user review.

Use this tool when you have finished researching and creating an implementation plan. This tool:
1. Displays the plan to the user in a structured format
2. Lists the files that will be affected
3. Shows any dependencies or prerequisites

After presenting the plan, the user can:
- Execute the plan (switch to implementation mode)
- Save the plan for later
- Provide feedback for refinement
- Cancel and start over

## When to Use
- After completing your research in planning mode
- When you have a clear, actionable implementation plan
- Before switching from planning to implementation

## Parameters
- title: A short descriptive title for the plan
- content: The full plan in markdown format
- affected_files: List of files that will be created or modified
- dependencies: Shell commands that need to run first (e.g., npm install)
`;

export interface PresentPlanParams {
  /**
   * A short descriptive title for the plan.
   */
  title: string;

  /**
   * The full implementation plan in markdown format.
   */
  content: string;

  /**
   * List of file paths that will be created or modified.
   */
  affected_files?: string[];

  /**
   * Shell commands that should run before implementation (e.g., npm install).
   */
  dependencies?: string[];
}

class PresentPlanToolInvocation extends BaseToolInvocation<
  PresentPlanParams,
  ToolResult
> {
  constructor(
    params: PresentPlanParams,
    messageBus?: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    return `Plan: ${this.params.title}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const { title, content, affected_files, dependencies } = this.params;

    // Build the structured output
    // Note: We don't add a header here since the tool description already shows
    // "Plan: <title>" and the content often includes its own heading
    const sections: string[] = [];

    sections.push(content);
    sections.push('');

    if (affected_files && affected_files.length > 0) {
      sections.push('## Files to be Modified');
      for (const file of affected_files) {
        sections.push(`- ${file}`);
      }
      sections.push('');
    }

    if (dependencies && dependencies.length > 0) {
      sections.push('## Prerequisites');
      sections.push('The following commands should run before implementation:');
      sections.push('```bash');
      for (const cmd of dependencies) {
        sections.push(cmd);
      }
      sections.push('```');
      sections.push('');
    }

    sections.push('---');
    sections.push('');
    sections.push('**Plan Options:**');
    sections.push('- Use `/plan save <title>` to save this plan for later');
    sections.push('- Press `Shift+Tab` to switch to implementation mode');
    sections.push('- Or provide feedback to refine the plan');

    const planOutput = sections.join('\n');

    return {
      llmContent: JSON.stringify({
        success: true,
        message: 'Plan presented successfully. Waiting for user action.',
        plan: {
          title,
          affectedFiles: affected_files || [],
          dependencies: dependencies || [],
        },
      }),
      // Return structured data so UI can detect and handle plan completion
      returnDisplay: {
        presentedPlan: {
          title,
          content,
          affectedFiles: affected_files || [],
          dependencies: dependencies || [],
          displayText: planOutput,
        },
      },
    };
  }
}

export class PresentPlanTool extends BaseDeclarativeTool<
  PresentPlanParams,
  ToolResult
> {
  static readonly Name = PRESENT_PLAN_TOOL_NAME;

  constructor(messageBus?: MessageBus) {
    super(
      PresentPlanTool.Name,
      'PresentPlan',
      PRESENT_PLAN_DESCRIPTION,
      Kind.Think, // Allowed in Plan Mode
      {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'A short descriptive title for the plan.',
          },
          content: {
            type: 'string',
            description: 'The full implementation plan in markdown format.',
          },
          affected_files: {
            type: 'array',
            items: { type: 'string' },
            description:
              'List of file paths that will be created or modified by this plan.',
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Shell commands that should run before implementation (e.g., npm install, pip install).',
          },
        },
        required: ['title', 'content'],
        additionalProperties: false,
      },
      false, // requiresConfirmation
      false, // isOutputMarkdown
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: PresentPlanParams,
  ): string | null {
    if (!params.title || params.title.trim() === '') {
      return 'Parameter "title" must be a non-empty string.';
    }
    if (!params.content || params.content.trim() === '') {
      return 'Parameter "content" must be a non-empty string.';
    }
    return null;
  }

  protected createInvocation(
    params: PresentPlanParams,
    messageBus?: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new PresentPlanToolInvocation(
      params,
      messageBus ?? this.messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }
}
