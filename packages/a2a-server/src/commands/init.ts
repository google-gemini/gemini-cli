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
import type { CoderAgentExecutor } from '../agent/executor.js';
import type {
  ExecutionEventBus,
  RequestContext,
  AgentExecutionEvent,
} from '@a2a-js/sdk/server';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export class InitCommand implements Command {
  name = 'init';
  description = 'Analyzes the project and creates a tailored GEMINI.md file';
  requiresWorkspace = true;
  streaming = true;

  private handleMessageResult(
    result: { content: string; messageType: 'info' | 'error' },
    context: CommandContext,
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
  ): CommandExecutionResponse {
    const statusState = result.messageType === 'error' ? 'failed' : 'completed';
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
  }

  private async handleSubmitPromptResult(
    result: { content: unknown },
    context: CommandContext,
    geminiMdPath: string,
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
  ): Promise<CommandExecutionResponse> {
    fs.writeFileSync(geminiMdPath, '', 'utf8');

    if (!context.agentExecutor) {
      throw new Error('Agent executor not found in context.');
    }
    const agentExecutor = context.agentExecutor as CoderAgentExecutor;

    const agentSettings: AgentSettings = {
      kind: CoderAgentEvent.StateAgentSettingsEvent,
      workspacePath: process.env['CODER_AGENT_WORKSPACE_PATH']!,
      autoExecute: true,
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

  async execute(
    context: CommandContext,
    _args: string[] = [],
  ): Promise<CommandExecutionResponse> {
    if (!context.eventBus) {
      return {
        name: this.name,
        data: 'Use executeStream to get streaming results.',
      };
    }

    const geminiMdPath = path.join(
      process.env['CODER_AGENT_WORKSPACE_PATH']!,
      'GEMINI.md',
    );
    const result = performInit(fs.existsSync(geminiMdPath));

    const taskId = uuidv4();
    const contextId = uuidv4();

    switch (result.type) {
      case 'message':
        return this.handleMessageResult(
          result,
          context,
          context.eventBus,
          taskId,
          contextId,
        );
      case 'submit_prompt':
        return this.handleSubmitPromptResult(
          result,
          context,
          geminiMdPath,
          context.eventBus,
          taskId,
          contextId,
        );
      default:
        throw new Error('Unknown result type from performInit');
    }
  }
}
