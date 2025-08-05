/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import blessed from 'blessed';
import {
  Config,
  ToolRegistry,
  executeToolCall,
  ToolCallRequestInfo,
  ToolErrorType,
  GeminiEventType,
} from '@google/gemini-cli-core';
import { Content, FunctionCall, Part } from '@google/genai';
import { parseAndFormatApiError } from './utils/errorParsing.js';
import { registerCleanup } from '../utils/cleanup.js';
import { LoadedSettings } from '../config/settings.js';

interface BlessedAppOptions {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
  interruptMode?: boolean;
}


  const screen = blessed.screen({ smartCSR: true });
  const output = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '90%',
    border: 'line',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
  });
  const input = blessed.textbox({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    border: 'line',
    inputOnFocus: true,
  });
  screen.append(output);
  screen.append(input);
  input.focus();
  registerCleanup(() => screen.destroy());

  let conversation = '';
  if (startupWarnings.length > 0) {
    conversation += startupWarnings.join('\n') + '\n';
    output.setContent(conversation);
  }
  screen.render();


      input.clearValue();
      input.focus();
      if (!text.trim()) {
        screen.render();
        return;
      }
      conversation += `> ${text}\n`;
      output.setContent(conversation);
      screen.render();

      const prompt_id = Math.random().toString(16).slice(2);
      let currentMessages: Content[] = [{ role: 'user', parts: [{ text }] }];

      try {
        while (true) {
          const functionCalls: FunctionCall[] = [];
          let responseBuffer = '';
          const abortController = new AbortController();
          const stream = geminiClient.sendMessageStream(
            currentMessages[0]?.parts || [],
            abortController.signal,
            prompt_id,
          );
          for await (const event of stream) {
            if (event.type === GeminiEventType.Content) {
              responseBuffer += event.value;
              output.setContent(conversation + responseBuffer);
              screen.render();
            } else if (event.type === GeminiEventType.ToolCallRequest) {
              const fc: FunctionCall = {
                name: event.value.name,
                args: event.value.args,
                id: event.value.callId,
              };
              functionCalls.push(fc);
            }
          }
          conversation += responseBuffer + '\n';
          output.setContent(conversation);
          screen.render();

          if (functionCalls.length > 0) {
            const toolResponseParts: Part[] = [];
            for (const fc of functionCalls) {
              const callId = fc.id ?? `${fc.name}-${Date.now()}`;
              const requestInfo: ToolCallRequestInfo = {
                callId,
                name: fc.name as string,
                args: (fc.args ?? {}) as Record<string, unknown>,
                isClientInitiated: false,
                prompt_id,
              };
              const toolResponse = await executeToolCall(
                config,
                requestInfo,
                toolRegistry,
                abortController.signal,
              );
              if (toolResponse.error) {
                conversation +=
                  `Error executing tool ${fc.name}: ${
                    toolResponse.resultDisplay || toolResponse.error.message
                  }\n`;
                output.setContent(conversation);
                screen.render();
                if (toolResponse.errorType === ToolErrorType.UNHANDLED_EXCEPTION) {
                  return;
                }
              }
              if (toolResponse.responseParts) {
                const parts = Array.isArray(toolResponse.responseParts)
                  ? toolResponse.responseParts
                  : [toolResponse.responseParts];
                for (const part of parts) {
                  if (typeof part === 'string') {
                    toolResponseParts.push({ text: part });
                  } else if (part) {
                    toolResponseParts.push(part);
                  }
                }
              }
            }
            currentMessages = [{ role: 'user', parts: toolResponseParts }];
          } else {
            break;
          }
        }
      } catch (error) {
        conversation +=
          parseAndFormatApiError(
            error,
            config.getContentGeneratorConfig()?.authType,
          ) + '\n';
        output.setContent(conversation);
        screen.render();
      }
    });

}

