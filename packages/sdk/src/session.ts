/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  type ConfigParameters,
  AuthType,
  PREVIEW_GEMINI_MODEL_AUTO,
  GeminiEventType,
  type ToolCallRequestInfo,
  type ServerGeminiStreamEvent,
  type GeminiClient,
  type Content,
  type SkillDefinition,
  loadSkillsFromDir,
  ActivateSkillTool,
  type ResumedSessionData,
} from '@google/gemini-cli-core';

import { type Tool, SdkTool, type z } from './tool.js';
import { SdkAgentFilesystem } from './fs.js';
import { SdkAgentShell } from './shell.js';
import type {
  SessionContext,
  GeminiCliAgentOptions,
  SystemInstructions,
} from './types.js';
import type { SkillReference } from './skills.js';
import type { GeminiCliAgent } from './agent.js';

export class GeminiCliSession {
  private config: Config;
  private tools: Array<Tool<z.ZodType>>;
  private skillRefs: SkillReference[];
  private instructions: SystemInstructions | undefined;
  private client: GeminiClient | undefined;
  private initialized = false;

  constructor(
    options: GeminiCliAgentOptions,
    private sessionId: string,
    private agent: GeminiCliAgent,
    private resumedData?: ResumedSessionData,
  ) {
    this.instructions = options.instructions;
    const cwd = options.cwd || process.cwd();
    this.tools = options.tools || [];
    this.skillRefs = options.skills || [];

    const initialMemory =
      typeof this.instructions === 'string' ? this.instructions : '';

    const configParams: ConfigParameters = {
      sessionId: this.sessionId,
      targetDir: cwd,
      cwd,
      debugMode: options.debug ?? false,
      model: options.model || PREVIEW_GEMINI_MODEL_AUTO,
      userMemory: initialMemory,
      // Minimal config
      enableHooks: false,
      mcpEnabled: false,
      extensionsEnabled: false,
      recordResponses: options.recordResponses,
      fakeResponses: options.fakeResponses,
      skillsSupport: true,
      adminSkillsEnabled: true,
    };

    this.config = new Config(configParams);
  }

  /**
   * Returns the unique ID for this session.
   */
  get id(): string {
    return this.sessionId;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Simple auth detection
    let authType = AuthType.COMPUTE_ADC;
    if (process.env['GEMINI_API_KEY']) {
      authType = AuthType.USE_GEMINI;
    } else if (process.env['GOOGLE_API_KEY']) {
      authType = AuthType.USE_VERTEX_AI;
    }

    await this.config.refreshAuth(authType);
    await this.config.initialize();

    // Load additional skills from options
    if (this.skillRefs.length > 0) {
      const skillManager = this.config.getSkillManager();
      const loadedSkills: SkillDefinition[] = [];

      for (const ref of this.skillRefs) {
        try {
          if (ref.type === 'dir' || ref.type === 'root') {
            const skills = await loadSkillsFromDir(ref.path);
            loadedSkills.push(...skills);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`Failed to load skills from ${ref.path}:`, e);
        }
      }

      if (loadedSkills.length > 0) {
        skillManager.addSkills(loadedSkills);
      }
    }

    // Re-register ActivateSkillTool if we have skills
    const skillManager = this.config.getSkillManager();
    if (skillManager.getSkills().length > 0) {
      const registry = this.config.getToolRegistry();
      const toolName = ActivateSkillTool.Name;
      if (registry.getTool(toolName)) {
        registry.unregisterTool(toolName);
      }
      registry.registerTool(
        new ActivateSkillTool(this.config, this.config.getMessageBus()),
      );
    }

    // Register tools
    const registry = this.config.getToolRegistry();
    const messageBus = this.config.getMessageBus();

    for (const toolDef of this.tools) {
      const sdkTool = new SdkTool(toolDef, messageBus, this.agent);
      registry.registerTool(sdkTool);
    }

    this.client = this.config.getGeminiClient();

    if (this.resumedData) {
      const history: Content[] = this.resumedData.conversation.messages.map(
        (m) => {
          const role = m.type === 'gemini' ? 'model' : 'user';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let parts: any[] = [];
          if (Array.isArray(m.content)) {
            parts = m.content;
          } else if (m.content) {
            parts = [{ text: String(m.content) }];
          }
          return { role, parts };
        },
      );
      await this.client.resumeChat(history, this.resumedData);
    }

    this.initialized = true;
  }

  async *sendStream(prompt: string): AsyncGenerator<ServerGeminiStreamEvent> {
    if (!this.initialized || !this.client) {
      await this.initialize();
    }
    const client = this.client!;
    const registry = this.config.getToolRegistry();

    let request: Parameters<GeminiClient['sendMessageStream']>[0] = [
      { text: prompt },
    ];
    const signal = new AbortController().signal; // TODO: support signal
    const sessionId = this.config.getSessionId();

    const fs = new SdkAgentFilesystem(this.config);
    const shell = new SdkAgentShell(this.config);

    while (true) {
      if (typeof this.instructions === 'function') {
        const context: SessionContext = {
          sessionId,
          transcript: client.getHistory(),
          cwd: this.config.getWorkingDir(),
          timestamp: new Date().toISOString(),
          fs,
          shell,
          agent: this.agent,
          session: this,
        };
        try {
          const newInstructions = this.instructions(context);
          this.config.setUserMemory(newInstructions);
          client.updateSystemInstruction();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Error resolving dynamic instructions:', e);
        }
      }

      const stream = client.sendMessageStream(request, signal, sessionId);

      const toolCalls: ToolCallRequestInfo[] = [];

      for await (const event of stream) {
        yield event;
        if (event.type === GeminiEventType.ToolCallRequest) {
          toolCalls.push(event.value);
        }
      }

      if (toolCalls.length === 0) {
        break;
      }

      const functionResponses: Array<Record<string, unknown>> = [];
      const transcript: Content[] = client.getHistory();
      const context: SessionContext = {
        sessionId,
        transcript,
        cwd: this.config.getWorkingDir(),
        timestamp: new Date().toISOString(),
        fs,
        shell,
        agent: this.agent,
        session: this,
      };

      for (const toolCall of toolCalls) {
        const tool = registry.getTool(toolCall.name);
        if (!tool) {
          functionResponses.push({
            functionResponse: {
              name: toolCall.name,
              response: { error: `Tool ${toolCall.name} not found` },
              id: toolCall.callId,
            },
          });
          continue;
        }

        try {
          const invocation =
            tool instanceof SdkTool
              ? tool.createInvocationWithContext(
                  toolCall.args as object,
                  this.config.getMessageBus(),
                  context,
                )
              : tool.build(toolCall.args as object);
          const result = await invocation.execute(signal);

          functionResponses.push({
            functionResponse: {
              name: toolCall.name,
              response: { result: result.llmContent },
              id: toolCall.callId,
            },
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`Tool execution error for ${toolCall.name}:`, e);
          functionResponses.push({
            functionResponse: {
              name: toolCall.name,
              response: {
                error:
                  'Error: Tool execution failed. Please try again or use a different approach.',
              },
              id: toolCall.callId,
            },
          });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      request = functionResponses as unknown as Parameters<
        GeminiClient['sendMessageStream']
      >[0];
    }
  }
}
