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

export interface GeminiCliAgentOptions {
  instructions: string;
  tools?: Array<Tool<z.ZodType>>;
  model?: string;
  cwd?: string;
  debug?: boolean;
}

export class GeminiCliAgent {
  private config: Config;
  private tools: Array<Tool<z.ZodType>>;

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
    // TODO: support AbortSignal cancellation properly
    const signal = new AbortController().signal;
    const sessionId = this.config.getSessionId();

    const fs = new SdkAgentFilesystem(this.config);
    const shell = new SdkAgentShell(this.config);

    while (true) {
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
          let args = toolCall.args;
          if (typeof args === 'string') {
            args = JSON.parse(args);
          }

          // Cast toolCall.args to object to satisfy AnyDeclarativeTool.build
          const invocation =
            tool instanceof SdkTool
              ? tool.createInvocationWithContext(
                  args as object,
                  this.config.getMessageBus(),
                  context
                )
              : tool.build(args as object);

          // Check if the tool execution requires confirmation according to policy
          const confirmation = await invocation.shouldConfirmExecute(signal);
          if (confirmation) {
            throw new Error(
              `Tool execution for '${toolCall.name}' requires confirmation, which is not supported in this SDK version.`,
            );
          }
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
