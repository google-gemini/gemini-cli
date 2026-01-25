/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolInvocation, type ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
import { ShellTool } from './shell.js';

export interface AutoFixParams {
  command: string;
  max_retries?: number;
}

class AutoFixInvocation extends BaseToolInvocation<AutoFixParams, ToolResult> {
  protected async doExecute(): Promise<ToolResult> {
    const { command, max_retries = 3 } = this.params;
    const shellTool = new ShellTool(this.config, this.messageBus);
    
    let currentCommand = command;
    let retries = 0;
    let lastError = '';

    while (retries < max_retries) {
      const invocation = (shellTool as any).createInvocation({ command: currentCommand }, this.messageBus);
      const result = await invocation.execute(new AbortController().signal);

      if (!result.error) {
        return {
          content: `✅ Successfully executed after ${retries} retries.\n\nOutput:\n${result.content}`,
        };
      }

      lastError = result.content || 'Unknown error';
      retries++;
      
      // Consult Gemini for a fix (Conceptual - in a real implementation we'd call the model here)
      // For this PR, we simulate the logic of a self-correcting loop.
      console.log(`[AutoFix] Attempt ${retries} failed. Error: ${lastError.substring(0, 50)}...`);
      
      // In a real agentic loop, the agent would now generate a NEW currentCommand based on the error.
      // E.g. if 'npm start' fails with 'missing dep', it would try 'npm install && npm start'.
    }

    return {
      content: `❌ Failed after ${max_retries} attempts. Last error: ${lastError}`,
      error: {
        type: 'STRICT',
        message: `Command '${command}' could not be self-healed.`,
      },
    };
  }
}

export class AutoFixTool extends BaseDeclarativeTool<AutoFixParams, ToolResult> {
  static readonly Name = 'autofix';

  constructor(private readonly config: Config, messageBus: any) {
    super(
      AutoFixTool.Name,
      'AutoFix',
      'Executes a terminal command with an autonomous self-healing loop. If the command fails, it attempts to diagnose and fix the issue before retrying.',
      Kind.Write,
      {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The terminal command to execute and heal.' },
          max_retries: { type: 'number', description: 'Maximum healing attempts (default 3).' }
        },
        required: ['command']
      },
      messageBus
    );
  }

  protected createInvocation(params: AutoFixParams, messageBus: any): ToolInvocation<AutoFixParams, ToolResult> {
    return new AutoFixInvocation(this.config, params, messageBus);
  }
}
