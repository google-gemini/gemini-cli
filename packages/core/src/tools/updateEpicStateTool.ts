/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import { UPDATE_EPIC_STATE_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { UPDATE_EPIC_STATE_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

interface UpdateEpicStateParams {
  update_type: 'context' | 'task_log' | 'notes';
  content: string;
}

class UpdateEpicStateInvocation extends BaseToolInvocation<
  UpdateEpicStateParams,
  ToolResult
> {
  private readonly config: Config;

  constructor(
    params: UpdateEpicStateParams,
    config: Config,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ) {
    super(params, messageBus, toolName, displayName);
    this.config = config;
  }

  getDescription(): string {
    return `Updating epic ${this.params.update_type}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const epicId = this.config.getActiveEpicId();
    if (!epicId) {
      return {
        llmContent: JSON.stringify({
          success: false,
          error: 'No active Epic ID found.',
        }),
        returnDisplay: 'Error: No active Epic found.',
        error: {
          message: 'No active Epic ID found.',
          type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
        },
      };
    }

    const { update_type, content } = this.params;
    const fileName = `${update_type}.md`;
    const filePath = path.join(
      process.cwd(),
      '.gemini',
      'epics',
      epicId,
      fileName,
    );

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      let newContent = content;
      if (update_type === 'task_log' || update_type === 'notes') {
        const currentContent = await this.readCurrentContent(filePath);
        const timestamp = new Date().toISOString();
        newContent =
          `${currentContent}\n\n### [${timestamp}]\n${content}`.trim();
      }

      await fs.writeFile(filePath, newContent, 'utf-8');

      const message = `Updated epic ${update_type} for ${epicId}`;
      return {
        llmContent: JSON.stringify({ success: true, message, filePath }),
        returnDisplay: message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: JSON.stringify({ success: false, error: errorMessage }),
        returnDisplay: `Error updating epic state: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
        },
      };
    }
  }

  private async readCurrentContent(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }
}

export class UpdateEpicStateTool extends BaseDeclarativeTool<
  UpdateEpicStateParams,
  ToolResult
> {
  static readonly Name = UPDATE_EPIC_STATE_TOOL_NAME;
  private readonly config: Config;

  constructor(config: Config, messageBus: MessageBus) {
    super(
      UpdateEpicStateTool.Name,
      'UpdateEpicState',
      UPDATE_EPIC_STATE_DEFINITION.base.description!,
      Kind.Think,
      UPDATE_EPIC_STATE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
    this.config = config;
  }

  protected createInvocation(
    params: UpdateEpicStateParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new UpdateEpicStateInvocation(
      params,
      this.config,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(UPDATE_EPIC_STATE_DEFINITION, modelId);
  }
}
