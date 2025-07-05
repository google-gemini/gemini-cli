/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import { BaseTool, type ToolResult } from './tools.js';
import { A2AClient } from '../a2a/client.js';
import { Message, Part, Task } from '../a2a/types.js';

const INFO = {
  name: 'a2a',
  displayName: 'A2A',
  description: 'Sends a message to another agent and returns the response.',
  parameterSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL of the agent to send the message to.',
      },
      message: {
        type: 'string',
        description: 'The message to send to the agent.',
      },
    },
    required: ['url', 'message'],
  },
};

export class A2ATool extends BaseTool<
  { url: string; message: string },
  ToolResult
> {
  constructor() {
    super(INFO.name, INFO.displayName, INFO.description, INFO.parameterSchema);
  }

  async execute(params: { url: string; message: string }): Promise<ToolResult> {
    const client = new A2AClient({ baseUrl: params.url });
    const response = await client.sendMessage({
      message: {
        messageId: crypto.randomUUID(),
        role: 'user',
        parts: [{ kind: 'text', text: params.message }],
      },
    });

    const llmContent = this.formatResponse(response);
    const returnDisplay = `Received response: ${llmContent}`;

    return { llmContent, returnDisplay };
  }

  private formatResponse(response: Task | Message): string {
    if (response.kind === 'task') {
      return `Task ID: ${response.id}, Status: ${response.status.state}`;
    } else {
      return response.parts
        .map((part: Part) => {
          if (part.kind === 'text') {
            return part.text;
          }
          return '';
        })
        .join(' ');
    }
  }
}
