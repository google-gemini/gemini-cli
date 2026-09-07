/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProvider, ChatMessage, ModelEvent } from '../providers/ModelProvider.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { PermissionManager } from '../permissions/PermissionManager.js';
import type { ProjectInfo } from '../tools/project/ProjectDetector.js';
import { buildSystemPrompt } from './prompts/systemPrompt.js';
import type { EventBus } from '../events/EventBus.js';
import type { MentorPolicy } from '../mentor/MentorPolicy.js';

export interface AgentHarnessOptions {
  provider: ModelProvider;
  toolRegistry: ToolRegistry;
  permissions: PermissionManager;
  project: ProjectInfo;
  events?: EventBus;
  model?: string;
  maxToolTurns?: number;
}

export class AgentHarness {
  private provider: ModelProvider;
  private toolRegistry: ToolRegistry;
  private permissions: PermissionManager;
  private project: ProjectInfo;
  private events?: EventBus;
  private model: string;
  private maxToolTurns: number;

  constructor(options: AgentHarnessOptions) {
    this.provider = options.provider;
    this.toolRegistry = options.toolRegistry;
    this.permissions = options.permissions;
    this.project = options.project;
    this.events = options.events;
    this.model = options.model || 'placeholder';
    this.maxToolTurns = options.maxToolTurns || 5;
  }

  public setModel(model: string, provider?: ModelProvider): void {
    this.model = model;
    if (provider) {
      this.provider = provider;
    }
  }

  public async *run(conversation: ChatMessage[], policy?: MentorPolicy): AsyncIterable<ModelEvent> {
    const systemPrompt = buildSystemPrompt(this.project, this.toolRegistry, policy);

    const workingMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversation,
    ];

    let turns = 0;

    while (turns < this.maxToolTurns) {
      turns++;

      let assistantText = '';

      for await (const event of this.provider.chat({
        messages: workingMessages,
        model: this.model,
      })) {
        if (event.type === 'chunk') {
          assistantText += event.text;
          yield event;
        } else if (event.type === 'complete') {
          assistantText = event.fullText || assistantText;
        } else if (event.type === 'error') {
          yield event;
          return;
        }
      }

      // Check if output requested a tool call
      const toolCallRegex = /```tool:([a-zA-Z0-9_-]+)\s*\n([\s\S]*?)\n```/;
      const match = toolCallRegex.exec(assistantText);

      if (!match) {
        // Normal text response without tool call — done!
        yield { type: 'complete', fullText: assistantText };
        return;
      }

      const toolName = match[1].trim();
      const rawArgs = match[2].trim();

      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch {
        parsedArgs = { raw: rawArgs };
      }

      // Notify UI that a tool execution started
      const toolStatusMessage = `\n[Inspecting: ${toolName}...]\n`;
      yield { type: 'chunk', text: toolStatusMessage };

      let toolResult = '';
      try {
        toolResult = await this.toolRegistry.execute(toolName, parsedArgs, {
          workspaceRoot: this.project.workspacePath,
          permissions: this.permissions,
        });
      } catch (err: unknown) {
        toolResult = `Error executing tool "${toolName}": ${err instanceof Error ? err.message : String(err)}`;
      }

      // Add assistant output and tool result to working conversation
      workingMessages.push({ role: 'assistant', content: assistantText });
      workingMessages.push({
        role: 'system',
        content: `Tool Result (${toolName}):\n${toolResult}`,
      });
    }

    yield { type: 'complete', fullText: 'Tool turn limit reached.' };
  }
}
