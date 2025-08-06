/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import readline from 'readline';
import { BaseTool, Icon, ToolResult } from './tools.js';

interface HumanLoopParams {
  /**
   * Prompt to display to the user when requesting guidance.
   */
  prompt: string;
  /**
   * Optional predefined response, useful for tests or non-interactive environments.
   */
  response?: string;
}

/**
 * A tool that allows the model to request human guidance at any time.
 * If a response is not provided, the tool will prompt on stdin.
 */
export class HumanLoopTool extends BaseTool<HumanLoopParams> {
  static readonly Name = 'human_loop';
  constructor() {
    super(
      HumanLoopTool.Name,
      'Human in the loop',
      'Request direction or advice from the user.',
      Icon.LightBulb,
      {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          response: { type: 'string' },
        },
        required: ['prompt'],
      },
      false,
      false,
    );
  }

  validateToolParams(params: HumanLoopParams): string | null {
    if (!params.prompt || typeof params.prompt !== 'string') {
      return 'Missing "prompt" parameter';
    }
    return null;
  }

  async execute(params: HumanLoopParams): Promise<ToolResult> {
    let answer = params.response;
    if (answer === undefined) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      answer = await new Promise<string>((resolve) => {
        rl.question(`${params.prompt} `, (resp) => {
          rl.close();
          resolve(resp);
        });
      });
    }
    return {
      llmContent: answer,
      returnDisplay: answer,
    };
  }

  getDescription(params: HumanLoopParams): string {
    return `Ask human: ${params.prompt}`;
  }
}

export default HumanLoopTool;
