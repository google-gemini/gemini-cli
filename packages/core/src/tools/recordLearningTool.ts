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
import { Storage } from '../config/storage.js';
import { ToolErrorType } from './tool-error.js';
import { RECORD_LEARNING_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { RECORD_LEARNING_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { MACHINE_LEARNINGS_FILENAME } from './memoryTool.js';

interface RecordLearningParams {
  fact: string;
  level: 'global' | 'project' | 'micro';
  directory?: string;
}

class RecordLearningInvocation extends BaseToolInvocation<
  RecordLearningParams,
  ToolResult
> {
  getDescription(): string {
    return `Recording machine-learning at ${this.params.level} level`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { fact, level, directory } = this.params;
    const targetPath = await this.getTargetPath(level, directory);

    try {
      const currentContent = await this.readCurrentContent(targetPath);
      const newContent = this.computeNewContent(currentContent, fact);

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, newContent, 'utf-8');

      const message = `Recorded machine-learning at ${level} level: "${fact}" in ${targetPath}`;
      return {
        llmContent: JSON.stringify({ success: true, message }),
        returnDisplay: message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: JSON.stringify({ success: false, error: errorMessage }),
        returnDisplay: `Error recording learning: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
        },
      };
    }
  }

  private async getTargetPath(
    level: string,
    directory?: string,
  ): Promise<string> {
    switch (level) {
      case 'global':
        return path.join(
          Storage.getGlobalGeminiDir(),
          MACHINE_LEARNINGS_FILENAME,
        );
      case 'project':
        return path.join(process.cwd(), MACHINE_LEARNINGS_FILENAME);
      case 'micro':
      default:
        return path.join(
          directory || process.cwd(),
          MACHINE_LEARNINGS_FILENAME,
        );
    }
  }

  private async readCurrentContent(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private computeNewContent(currentContent: string, fact: string): string {
    const header = '## Agent Machine Learnings';
    const timestamp = new Date().toISOString().split('T')[0];
    const newEntry = `- [${timestamp}] ${fact.trim()}`;

    if (!currentContent.includes(header)) {
      return `${currentContent}\n\n${header}\n${newEntry}\n`.trimStart();
    }

    return currentContent.replace(header, `${header}\n${newEntry}`);
  }
}

export class RecordLearningTool extends BaseDeclarativeTool<
  RecordLearningParams,
  ToolResult
> {
  static readonly Name = RECORD_LEARNING_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      RecordLearningTool.Name,
      'RecordLearning',
      RECORD_LEARNING_DEFINITION.base.description!,
      Kind.Think,
      RECORD_LEARNING_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: RecordLearningParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new RecordLearningInvocation(
      params,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(RECORD_LEARNING_DEFINITION, modelId);
  }
}
