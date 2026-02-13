/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  type ConfigParameters,
  PREVIEW_GEMINI_MODEL_AUTO,
  GeminiEventType,
  type ToolCallRequestInfo,
  type ServerGeminiStreamEvent,
  type GeminiClient,
  scheduleAgentTools,
  getAuthTypeFromEnv,
  AuthType,
} from '@google/gemini-cli-core';

import { type Tool, SdkTool, type z } from './tool.js';

export interface GeminiCliAgentOptions {
  instructions: string;
  tools?: Array<Tool<z.ZodType>>;
  model?: string;
  cwd?: string;
  debug?: boolean;
}

export class GeminiCliAgent {
  private readonly config: Config;
  private readonly tools: Array<Tool<z.ZodType>>;

  constructor(options: GeminiCliAgentOptions) {
    const cwd = options.cwd || process.cwd();
    this.tools = options.tools || [];

    const configParams: ConfigParameters = {
      sessionId: `sdk-${Date.now()}`,
      targetDir: cwd,
      cwd,
      debugMode: options.debug ?? false,
      model: options.model || PREVIEW_GEMINI_MODEL_AUTO,
      userMemory: options.instructions,
      // Minimal config
      enableHooks: false,
      mcpEnabled: false,
      extensionsEnabled: false,
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
        const sdkTool = new SdkTool(toolDef, messageBus);
        registry.registerTool(sdkTool);
      }
    }

    const client = this.config.getGeminiClient();

    let request: Parameters<GeminiClient['sendMessageStream']>[0] = [
      { text: prompt },
    ];
    const abortSignal = signal ?? new AbortController().signal;
    const sessionId = this.config.getSessionId();

    while (true) {
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

      const completedCalls = await scheduleAgentTools(
        this.config,
        toolCallsToSchedule,
        {
          schedulerId: sessionId,
          toolRegistry: this.config.getToolRegistry(),
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
