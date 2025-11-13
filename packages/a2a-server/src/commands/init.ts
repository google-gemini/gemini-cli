/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CoderAgentEvent, type AgentSettings } from '../types.js';
import { performInit } from '@google/gemini-cli-core';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';
import { CoderAgentExecutor } from '../agent/executor.js';
import type {
  ExecutionEventBus,
  RequestContext,
  AgentExecutionEvent,
} from '@a2a-js/sdk/server';
import { v4 as uuidv4 } from 'uuid';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { logger } from '../utils/logger.js';

export class InitCommand implements Command {
  name = 'init';
  description = 'Analyzes the project and creates a tailored GEMINI.md file';
  requiresWorkspace = true;
  autoExecute = true;

  async execute(
    _context: CommandContext,
    _args: string[],
  ): Promise<CommandExecutionResponse> {
    return {
      name: this.name,
      data: 'Use executeStream to get streaming results.',
    };
  }

  async executeStream(
    context: CommandContext,
    _args: string[] = [],
    eventBus: ExecutionEventBus,
    autoExecute?: boolean,
  ): Promise<CommandExecutionResponse> {
    const geminiMdPath = path.join(
      process.env['CODER_AGENT_WORKSPACE_PATH']!,
      'GEMINI.md',
    );
    const result = performInit(fs.existsSync(geminiMdPath));

    const taskId = uuidv4();
    const contextId = uuidv4();

    if (result.type === 'message') {
      const statusState =
        result.messageType === 'error' ? 'failed' : 'completed';
      const eventType =
        result.messageType === 'error'
          ? CoderAgentEvent.StateChangeEvent
          : CoderAgentEvent.TextContentEvent;

      const event: AgentExecutionEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: statusState,
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: result.content }],
            messageId: uuidv4(),
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
        metadata: {
          coderAgent: { kind: eventType },
          model: context.config.getModel(),
        },
      };

      logger.info('[EventBus event]: ', event);
      eventBus.publish(event);
      return {
        name: this.name,
        data: result,
      };
    } else if (result.type === 'submit_prompt') {
      fs.writeFileSync(geminiMdPath, '', 'utf8');

      // The executor needs a TaskStore. For this one-off command,
      // an in-memory one is sufficient.
      const taskStore = new InMemoryTaskStore();
      const agentExecutor = new CoderAgentExecutor(taskStore);

      const agentSettings: AgentSettings = {
        kind: CoderAgentEvent.StateAgentSettingsEvent,
        workspacePath: process.env['CODER_AGENT_WORKSPACE_PATH']!,
        autoExecute,
      };

      if (typeof result.content !== 'string') {
        throw new Error('Init command content must be a string.');
      }
      const promptText = result.content;

      const requestContext: RequestContext = {
        userMessage: {
          kind: 'message',
          role: 'user',
          parts: [{ kind: 'text', text: promptText }],
          messageId: uuidv4(),
          taskId,
          contextId,
          metadata: {
            coderAgent: agentSettings,
          },
        },
        taskId,
        contextId,
      };

      // The executor will handle the entire agentic loop, including
      // creating the task, streaming responses, and handling tools.
      await agentExecutor.execute(requestContext, eventBus);
      return {
        name: this.name,
        data: geminiMdPath,
      };
    }
    return {
      name: this.name,
      data: 'OK',
    };
  }
}
