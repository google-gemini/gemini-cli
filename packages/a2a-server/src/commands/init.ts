/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CoderAgentEvent, type AgentSettings } from '../types.js';
import { performInit, checkExhaustive } from '@google/gemini-cli-core';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';
import { CoderAgentExecutor } from '../agent/executor.js';
import type { ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import { v4 as uuidv4 } from 'uuid';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';

export class InitCommand implements Command {
  name = 'init';
  description = 'Analyzes the project and creates a tailored GEMINI.md file';

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
    autoConfirm?: boolean,
  ): Promise<CommandExecutionResponse> {
    const geminiMdPath = path.join(
      process.env['CODER_AGENT_WORKSPACE_PATH']!,
      'GEMINI.md',
    );
    const result = performInit({
      doesGeminiMdExist: () => fs.existsSync(geminiMdPath),
    });

    const taskId = uuidv4();
    const contextId = uuidv4();

    switch (result.type) {
      case 'info': {
        // Since there's no running agent, we can't send a thought.
        // We can publish a simple status update.
        eventBus.publish({
          kind: 'status-update',
          taskId,
          contextId,
          status: {
            state: 'completed',
            message: {
              kind: 'message',
              role: 'agent',
              parts: [{ kind: 'text', text: result.message }],
              messageId: uuidv4(),
              taskId,
              contextId,
            },
            timestamp: new Date().toISOString(),
          },
          final: true,
          metadata: {
            coderAgent: { kind: CoderAgentEvent.TextContentEvent },
            model: context.config.getModel(),
          },
        });
        break;
      }
      case 'error': {
        eventBus.publish({
          kind: 'status-update',
          taskId,
          contextId,
          status: {
            state: 'failed',
            message: {
              kind: 'message',
              role: 'agent',
              parts: [{ kind: 'text', text: result.message }],
              messageId: uuidv4(),
              taskId,
              contextId,
            },
            timestamp: new Date().toISOString(),
          },
          final: true,
          metadata: {
            coderAgent: { kind: CoderAgentEvent.StateChangeEvent },
            model: context.config.getModel(),
          },
        });
        break;
      }
      case 'new_file': {
        fs.writeFileSync(geminiMdPath, '', 'utf8');

        // The executor needs a TaskStore. For this one-off command,
        // an in-memory one is sufficient.
        const taskStore = new InMemoryTaskStore();
        const agentExecutor = new CoderAgentExecutor(taskStore);

        const agentSettings: AgentSettings = {
          kind: CoderAgentEvent.StateAgentSettingsEvent,
          workspacePath: process.env['CODER_AGENT_WORKSPACE_PATH']!,
          autoConfirm,
        };

        const requestContext: RequestContext = {
          userMessage: {
            kind: 'message',
            role: 'user',
            parts: [{ kind: 'text', text: result.prompt }],
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
        break;
      }
      default: {
        checkExhaustive(result);
      }
    }
    return {
      name: this.name,
      data: 'OK',
    };
  }
}
