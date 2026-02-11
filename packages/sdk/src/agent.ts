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
} from '@google/gemini-cli-core';

import { type Tool, SdkTool, type z } from './tool.js';
import { SdkAgentFilesystem } from './fs.js';
import { SdkAgentShell } from './shell.js';
import type { SessionContext } from './types.js';

export type SystemInstructions = string | ((context: SessionContext) => string);

export interface GeminiCliAgentOptions {
  instructions: SystemInstructions;
  tools?: Array<Tool<z.ZodType>>;
  model?: string;
  cwd?: string;
  debug?: boolean;
  recordResponses?: string;
  fakeResponses?: string;
}

export class GeminiCliAgent {
  private config: Config;
  private tools: Array<Tool<z.ZodType>>;
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

  async *sendStream(prompt: string): AsyncGenerator<ServerGeminiStreamEvent> {
    // Lazy initialization of auth and client
    if (!this.config.getContentGenerator()) {
      // Simple auth detection
      let authType = AuthType.COMPUTE_ADC;
      if (process.env['GEMINI_API_KEY']) {
        authType = AuthType.USE_GEMINI;
      } else if (process.env['GOOGLE_API_KEY']) {
        authType = AuthType.USE_VERTEX_AI;
      }

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
          agent: this,
        };
        try {
          const newInstructions = this.instructions(context);
          this.config.setUserMemory(newInstructions);
          client.updateSystemInstruction();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Error resolving dynamic instructions:', e);
          // Continue with previous instructions if function fails
        }
      }

      // sendMessageStream returns AsyncGenerator<ServerGeminiStreamEvent, Turn>
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
        agent: this,
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
          // Cast toolCall.args to object to satisfy AnyDeclarativeTool.build
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
