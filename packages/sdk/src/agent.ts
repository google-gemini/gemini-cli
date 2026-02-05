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
} from '@google/gemini-cli-core';

import { type Tool, SdkTool } from './tool.js';
import { SdkAgentFilesystem } from './fs.js';
import { SdkAgentShell } from './shell.js';
import type { SessionContext } from './types.js';

export type SystemInstructions = string | ((context: SessionContext) => string);

export interface GeminiCliAgentOptions {
  instructions: SystemInstructions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<Tool<any>>;
  model?: string;
  cwd?: string;
  debug?: boolean;
  recordResponses?: string;
  fakeResponses?: string;
}

export class GeminiCliAgent {
  private config: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tools: Array<Tool<any>>;
  private instructions: SystemInstructions;

  constructor(options: GeminiCliAgentOptions) {
    this.instructions = options.instructions;
    const cwd = options.cwd || process.cwd();
    this.tools = options.tools || [];

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
    };

    this.config = new Config(configParams);
  }

  async *sendStream(
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    // Lazy initialization of auth and client
    if (!this.config.getContentGenerator()) {
      const authType = getAuthTypeFromEnv() || AuthType.COMPUTE_ADC;

      await this.config.refreshAuth(authType);
      await this.config.initialize();

      // Register tools now that registry exists
      const registry = this.config.getToolRegistry();
      const messageBus = this.config.getMessageBus();

      for (const toolDef of this.tools) {
        const sdkTool = new SdkTool(toolDef, messageBus, this);
        registry.registerTool(sdkTool);
      }
    }

    const client = this.config.getGeminiClient();
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
          agent: this,
        };
        try {
          const newInstructions = this.instructions(context);
          this.config.setUserMemory(newInstructions);
          client.updateSystemInstruction();
        } catch (e) {
          const error =
            e instanceof Error
              ? e
              : new Error(`Error resolving dynamic instructions: ${String(e)}`);
          throw error;
        }
      }

      // sendMessageStream returns AsyncGenerator<ServerGeminiStreamEvent, Turn>
      const stream = client.sendMessageStream(request, abortSignal, sessionId);

      const toolCallsToSchedule: ToolCallRequestInfo[] = [];

      for await (const event of stream) {
        yield event;
        if (event.type === GeminiEventType.ToolCallRequest) {
          const toolCall = event.value;
          let args = toolCall.args;
          if (typeof args === 'string') {
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

      // Prepare SessionContext
      const transcript: Content[] = client.getHistory();
      const context: SessionContext = {
        sessionId,
        transcript,
        cwd: this.config.getWorkingDir(),
        timestamp: new Date().toISOString(),
        fs,
        shell,
        agent: this,
      };

      // Create a scoped registry for this turn to bind context safely
      const originalRegistry = this.config.getToolRegistry();
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
