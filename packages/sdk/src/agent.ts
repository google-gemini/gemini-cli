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
  type ServerGeminiStreamEvent,
  getAuthTypeFromEnv,
  loadSkillsFromDir,
  ActivateSkillTool,
  AgentSession,
  type AgentConfig,
  Scheduler,
  ROOT_SCHEDULER_ID,
  GeminiEventType,
  type ToolCallRequestInfo,
} from '@google/gemini-cli-core';

import { type Tool } from './tool.js';
import { SdkAgentFilesystem } from './fs.js';
import { SdkAgentShell } from './shell.js';
import type { SessionContext } from './types.js';
import type { SkillReference } from './skills.js';

export type SystemInstructions =
  | string
  | ((context: SessionContext) => string | Promise<string>);

export interface GeminiCliAgentOptions {
  instructions: SystemInstructions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<Tool<any>>;
  skills?: SkillReference[];
  model?: string;
  cwd?: string;
  debug?: boolean;
  recordResponses?: string;
  fakeResponses?: string;
}

export class GeminiCliAgent {
  private readonly config: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly tools: Array<Tool<any>>;
  private readonly skillRefs: SkillReference[];
  private readonly instructions: SystemInstructions;
  private instructionsLoaded = false;
  private session: AgentSession | undefined;

  constructor(options: GeminiCliAgentOptions) {
    this.instructions = options.instructions;
    const cwd = options.cwd || process.cwd();
    this.tools = options.tools || [];
    this.skillRefs = options.skills || [];

    const initialMemory =
      typeof this.instructions === 'string' ? this.instructions : '';

    const configParams: ConfigParameters = {
      sessionId: `sdk-${Date.now()}`,
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

  private async initialize(): Promise<void> {
    if (this.config.getContentGenerator()) {
      return;
    }

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

    // Note: SDK-specific Tool instances (this.tools) are still using the SDKTool wrapper
    // which binds context. In the new AgentSession, we might need a better way to
    // pass these tools. For now, we'll register them in the global registry
    // so AgentSession can find them.
    const registry = this.config.getToolRegistry();
    const messageBus = this.config.getMessageBus();
    for (const toolDef of this.tools) {
      // We'll need a way to provide context to these tools.
      // In the legacy loop, it was done per-turn.
      // For now, we register them as-is.
      // TODO: Improve SDK tool context binding in AgentSession.
      const { SdkTool } = await import('./tool.js');
      const sdkTool = new SdkTool(toolDef, messageBus, this);
      registry.registerTool(sdkTool);
    }
  }

  async *sendStream(
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    await this.initialize();

    const sessionId = this.config.getSessionId();
    const client = this.config.getGeminiClient();

    if (!this.instructionsLoaded && typeof this.instructions === 'function') {
      const fs = new SdkAgentFilesystem(this.config);
      const shell = new SdkAgentShell(this.config);
      const context: SessionContext = {
        sessionId,
        transcript: client.getHistory(),
        cwd: this.config.getWorkingDir(),
        timestamp: new Date().toISOString(),
        fs,
        shell,
        agent: this,
      };
      try {
        const newInstructions = await this.instructions(context);
        this.config.setUserMemory(newInstructions);
        client.updateSystemInstruction();
        this.instructionsLoaded = true;
      } catch (e) {
        throw e instanceof Error
          ? e
          : new Error(`Error resolving dynamic instructions: ${String(e)}`);
      }
    }

    const agentConfig: AgentConfig = {
      name: 'sdk-agent',
      systemInstruction: this.config.getUserMemory(),
      model: this.config.getModel(),
      capabilities: {
        compression: true,
        loopDetection: true,
      },
    };

    const useAgentFactory =
      this.config.getExperimentalSetting('useAgentFactoryAll') ||
      this.config.getExperimentalSetting('useAgentFactorySdk');

    if (useAgentFactory) {
      if (!this.session) {
        this.session = new AgentSession(sessionId, agentConfig, this.config);
      }

      const stream = this.session.prompt(prompt, signal);

      for await (const event of stream) {
        // Map AgentEvent back to ServerGeminiStreamEvent if possible,
        // or yield as is. The SDK user expects ServerGeminiStreamEvent.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        yield event as unknown as ServerGeminiStreamEvent;
      }
    } else {
      // Legacy Manual Loop logic...
      // For now, if flag is off, we might want to fall back to the old logic
      // but the old logic was removed in the previous write_file.
      // I should probably restore it or keep it gated.
      // Since I overwrote it, I'll provide a minimal version or the original one.
      yield* this.legacySendStream(prompt, signal);
    }
  }

  private async *legacySendStream(
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    const sessionId = this.config.getSessionId();
    const client = this.config.getGeminiClient();
    const scheduler = new Scheduler({
      config: this.config,
      messageBus: this.config.getMessageBus(),
      getPreferredEditor: () => undefined,
      schedulerId: ROOT_SCHEDULER_ID,
    });

    let currentInput: string | Part[] = prompt;

    while (true) {
      const stream = client.sendMessageStream(
        Array.isArray(currentInput) ? currentInput : [{ text: currentInput }],
        signal ?? new AbortController().signal,
        `sdk-${sessionId}`,
      );

      const toolCalls: ToolCallRequestInfo[] = [];

      for await (const event of stream) {
        if (event.type === GeminiEventType.ToolCallRequest) {
          toolCalls.push(event.value);
        }
        yield event;
      }

      if (toolCalls.length > 0) {
        const completedCalls = await scheduler.schedule(
          toolCalls,
          signal ?? new AbortController().signal,
        );
        currentInput = completedCalls.flatMap((c) => c.response.responseParts);
      } else {
        break;
      }
    }
  }
}
