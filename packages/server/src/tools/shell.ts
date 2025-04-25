/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import toolParameterSchema from './shell.json' with { type: 'json' };

export interface ShellToolParams {
  command: string;
  description?: string;
}

export class ShellTool extends BaseTool<ShellToolParams, ToolResult> {
  static Name: string = 'execute_bash_command';
  private readonly config: Config;
  private cwd: string;
  private whitelist: Set<string> = new Set();

  constructor(config: Config) {
    const toolDisplayName = 'Shell';
    const descriptionUrl = new URL('shell.md', import.meta.url);
    const toolDescription = fs.readFileSync(descriptionUrl, 'utf-8');
    super(
      ShellTool.Name,
      toolDisplayName,
      toolDescription,
      toolParameterSchema,
    );
    this.config = config;
    this.cwd = config.getTargetDir();
  }

  getDescription(params: ShellToolParams): string {
    return params.description || `Execute \`${params.command}\` in ${this.cwd}`;
  }

  validateToolParams(_params: ShellToolParams): string | null {
    // TODO: validate the command here
    return null;
  }

  async shouldConfirmExecute(
    params: ShellToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    const rootCommand =
      params.command
        .trim()
        .split(/[\s;&&|]+/)[0]
        ?.split(/[/\\]/)
        .pop() || 'unknown';
    if (this.whitelist.has(rootCommand)) {
      return false;
    }
    const confirmationDetails: ToolExecuteConfirmationDetails = {
      title: 'Confirm Shell Command',
      command: params.command,
      rootCommand,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.whitelist.add(rootCommand);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(_params: ShellToolParams): Promise<ToolResult> {
    return {
      llmContent: 'hello',
      returnDisplay: 'hello',
    };
  }
}
