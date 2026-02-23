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
  scheduleAgentTools,
  getAuthTypeFromEnv,
  type ToolRegistry,
  loadSkillsFromDir,
  ActivateSkillTool,
  type ResumedSessionData,
  PolicyDecision,
} from '@google/gemini-cli-core';

import { type Tool, SdkTool } from './tool.js';
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
  private readonly config: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly tools: Array<Tool<any>>;
  private readonly skillRefs: SkillReference[];
  private readonly instructions: SystemInstructions | undefined;
  private client: GeminiClient | undefined;
  private initialized = false;

  constructor(
    options: GeminiCliAgentOptions,
    private readonly sessionId: string,
    private readonly agent: GeminiCliAgent,
    private readonly resumedData?: ResumedSessionData,
  ) {
    this.instructions = options.instructions;
    const cwd = options.cwd || process.cwd();
    this.tools = options.tools || [];
    this.skillRefs = options.skills || [];

    let initialMemory = '';
    if (typeof this.instructions === 'string') {
      initialMemory = this.instructions;
    } else if (this.instructions && typeof this.instructions !== 'function') {
      throw new Error('Instructions must be a string or a function.');
    }

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
      policyEngineConfig: {
        // TODO: Revisit this default when we have a mechanism for wiring up approvals
        defaultDecision: PolicyDecision.ALLOW,
      },
    };

    this.config = new Config(configParams);
  }

  get id(): string {
    return this.sessionId;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const authType = getAuthTypeFromEnv() || AuthType.COMPUTE_ADC;

    await this.config.refreshAuth(authType);
    await this.config.initialize();

    // Load additional skills from options
    if (this.skillRefs.length > 0) {
      const skillManager = this.config.getSkillManager();

      const loadPromises = this.skillRefs.map(async (ref) => {
        try {
          if (ref.type === 'dir') {
            return await loadSkillsFromDir(ref.path);
          }
        } catch (e) {
          // TODO: refactor this to use a proper logger interface
          // eslint-disable-next-line no-console
          console.error(`Failed to load skills from ${ref.path}:`, e);
        }
        return [];
      });

      const loadedSkills = (await Promise.all(loadPromises)).flat();

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
      const sdkTool = new SdkTool(toolDef, messageBus, this.agent, undefined);
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

  async *sendStream(
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    if (!this.initialized || !this.client) {
      await this.initialize();
    }
    const client = this.client!;
    const abortSignal = signal ?? new AbortController().signal;
    const sessionId = this.config.getSessionId();

    const fs = new SdkAgentFilesystem(this.config);
    const shell = new SdkAgentShell(this.config);

    let request: Parameters<GeminiClient['sendMessageStream']>[0] = [
      { text: prompt },
    ];

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
        const newInstructions = await this.instructions(context);
        this.config.setUserMemory(newInstructions);
        client.updateSystemInstruction();
      }

      const stream = client.sendMessageStream(request, abortSignal, sessionId);

      const toolCallsToSchedule: ToolCallRequestInfo[] = [];

      for await (const event of stream) {
        yield event;
        if (event.type === GeminiEventType.ToolCallRequest) {
          const toolCall = event.value;
          let args = toolCall.args;
          if (typeof args === 'string') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            args = JSON.parse(args);
          }
          toolCallsToSchedule.push({
            ...toolCall,
            args,
            isClientInitiated: false,
            prompt_id: sessionId,
          });
        }
      }

      if (toolCallsToSchedule.length === 0) {
        break;
      }

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

      const originalRegistry = this.config.getToolRegistry();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const scopedRegistry: ToolRegistry = Object.create(originalRegistry);
      scopedRegistry.getTool = (name: string) => {
        const tool = originalRegistry.getTool(name);
        if (tool instanceof SdkTool) {
          return tool.bindContext(context);
        }
        return tool;
      };

      const completedCalls = await scheduleAgentTools(
        this.config,
        toolCallsToSchedule,
        {
          schedulerId: sessionId,
          toolRegistry: scopedRegistry,
          signal: abortSignal,
        },
      );

      const functionResponses = completedCalls.flatMap(
        (call) => call.response.responseParts,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      request = functionResponses as unknown as Parameters<
        GeminiClient['sendMessageStream']
      >[0];
    }
  }
}
