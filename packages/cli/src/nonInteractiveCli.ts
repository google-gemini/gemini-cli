/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  executeToolCall,
  ToolRegistry,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  parseAndFormatApiError,
} from '@google/gemini-cli-core';
import { Content, Part, FunctionCall } from '@google/genai';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import fs from 'fs/promises';
import path from 'path';

const geminiTmpDir = '/tmp/gemini'

async function saveConfig(prefix: string, config: Config) {
  const savePath = `${prefix}-config.json`;
  console.log(`\n\n!!! Saving config to: ${savePath}`)
  await fs.mkdir(path.dirname(savePath), {recursive: true});

  const chat = config?.getGeminiClient()?.getChat();
  const generationConfig = chat?.generationConfig;
  await fs.writeFile(savePath, JSON.stringify(generationConfig, null, 2), 'utf-8');
}

async function saveChatHistory(prefix: string, config: Config) {
  const savePath = `${prefix}-history.json`;
  console.log(`\n\n!!! Saving history to: ${savePath}`)
  await fs.mkdir(path.dirname(savePath), {recursive: true});

  const chat = config?.getGeminiClient()?.getChat();
  const history = chat.getHistory();
  const strippedHistory: Content[] = history.map(content => {
    const parts = content?.parts?.map(part => ({...part}));
    for (const part of parts ?? []) {
      part.thoughtSignature = '<<omitted for debugging>>';
    }
    return {parts, role: content.role };
  });
  await fs.writeFile(savePath, JSON.stringify(strippedHistory, null, 2), 'utf-8');
}

async function saveDebug(input: string, config: Config) {
  try {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const timestamp = `${month}-${day}-${year}-${hours}-${minutes}-${seconds}`;
    const pathPrefix = path.join(geminiTmpDir, `chat--p-${input.substring(0, 10).split(/\s+/).join('-')}--ts-${timestamp}--uuid-${crypto.randomUUID()}`);
    await saveConfig(pathPrefix, config);
    await saveChatHistory(pathPrefix, config);
  } catch (error) {
    console.error(`Error saving: ${String(error)}`);
  }
}

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });

  try {
    consolePatcher.patch();
    // Handle EPIPE errors when the output is piped to a command that closes early.
    process.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // Exit gracefully if the pipe is closed.
        process.exit(0);
      }
    });

    const geminiClient = config.getGeminiClient();
    const toolRegistry: ToolRegistry = await config.getToolRegistry();

    const abortController = new AbortController();
    let currentMessages: Content[] = [
      { role: 'user', parts: [{ text: input }] },
    ];
    let turnCount = 0;
    while (true) {
      turnCount++;
      if (
        config.getMaxSessionTurns() >= 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        console.error(
          '\n Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
        );
        await saveDebug(input, config);
        return;
      }
      const functionCalls: FunctionCall[] = [];

      const responseStream = geminiClient.sendMessageStream(
        currentMessages[0]?.parts || [],
        abortController.signal,
        prompt_id,
      );

      for await (const event of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          await saveDebug(input, config);
          return;
        }

        if (event.type === GeminiEventType.Content) {
          process.stdout.write(event.value);
        } else if (event.type === GeminiEventType.ToolCallRequest) {
          const toolCallRequest = event.value;
          const fc: FunctionCall = {
            name: toolCallRequest.name,
            args: toolCallRequest.args,
            id: toolCallRequest.callId,
          };
          functionCalls.push(fc);
        }
      }

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
            console.error(
              `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
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
        process.stdout.write('\n'); // Ensure a final newline
        await saveDebug(input, config);
        return;
      }
    }
  } catch (error) {
    await saveDebug(input, config);
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    process.exit(1);
  } finally {
    consolePatcher.cleanup();
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry(config);
    }
  }
}
