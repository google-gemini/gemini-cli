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
import { RECORD_DECISION_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { RECORD_DECISION_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

interface RecordDecisionParams {
  title: string;
  context: string;
  decision: string;
  consequences: string;
}

class RecordDecisionInvocation extends BaseToolInvocation<
  RecordDecisionParams,
  ToolResult
> {
  private readonly config: Config;

  constructor(
    params: RecordDecisionParams,
    config: Config,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ) {
    super(params, messageBus, toolName, displayName);
    this.config = config;
  }

  getDescription(): string {
    return `Recording Architecture Decision: ${this.params.title}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const epicId = this.config.getActiveEpicId();
    if (!epicId) {
      return {
        llmContent: JSON.stringify({
          success: false,
          error: 'No active Epic ID found. Cannot record decision.',
        }),
        returnDisplay: 'Error: No active Epic found.',
        error: {
          message: 'No active Epic ID found.',
          type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
        },
      };
    }

    const { title, context, decision, consequences } = this.params;
    const adrDir = path.join(
      process.cwd(),
      '.gemini',
      'epics',
      epicId,
      'decisions',
    );

    try {
      await fs.mkdir(adrDir, { recursive: true });

      const files = await fs.readdir(adrDir);
      const nextNum = (files.length + 1).toString().padStart(3, '0');
      const fileName = `ADR-${nextNum}-${title.toLowerCase().replace(/\s+/g, '-')}.md`;
      const filePath = path.join(adrDir, fileName);

      const content = `# ADR-${nextNum}: ${title}\n\n## Status\nAccepted\n\n## Context\n${context}\n\n## Decision\n${decision}\n\n## Consequences\n${consequences}\n`;

      await fs.writeFile(filePath, content, 'utf-8');

      const message = `Recorded ADR: ${fileName}`;
      return {
        llmContent: JSON.stringify({ success: true, message, filePath }),
        returnDisplay: message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: JSON.stringify({ success: false, error: errorMessage }),
        returnDisplay: `Error recording decision: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
        },
      };
    }
  }
}

export class RecordDecisionTool extends BaseDeclarativeTool<
  RecordDecisionParams,
  ToolResult
> {
  static readonly Name = RECORD_DECISION_TOOL_NAME;
  private readonly config: Config;

  constructor(config: Config, messageBus: MessageBus) {
    super(
      RecordDecisionTool.Name,
      'RecordDecision',
      RECORD_DECISION_DEFINITION.base.description!,
      Kind.Think,
      RECORD_DECISION_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
    this.config = config;
  }

  protected createInvocation(
    params: RecordDecisionParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new RecordDecisionInvocation(
      params,
      this.config,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(RECORD_DECISION_DEFINITION, modelId);
  }
}
