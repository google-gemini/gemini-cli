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
  ChatRecordingService,
  ToolCallRecord,
  ResumedSessionData,
} from '@google/gemini-cli-core';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentResponse,
} from '@google/genai';

import { parseAndFormatApiError } from './ui/utils/errorParsing.js';
import { convertSessionToHistoryFormats } from './ui/hooks/useSessionBrowser.js';

function getResponseText(response: GenerateContentResponse): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      // We are running in headless mode so we don't need to return thoughts to STDOUT.
      const thoughtPart = candidate.content.parts[0];
      if (thoughtPart?.thought) {
        return null;
      }
      return candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
  resumedSessionData?: ResumedSessionData,
): Promise<void> {
  await config.initialize();
  // Handle EPIPE errors when the output is piped to a command that closes early.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      // Exit gracefully if the pipe is closed.
      process.exit(0);
    }
  });

  // Initialize session recording service
  const chatRecordingService = new ChatRecordingService(config);
  chatRecordingService.initialize(resumedSessionData);
  chatRecordingService.recordMessage({ type: 'user', content: input });

  const geminiClient = config.getGeminiClient();
  const toolRegistry: ToolRegistry = await config.getToolRegistry();

  // Initialize chat.  Set history if resuming.
  const chat = await geminiClient.getChat();
  if (resumedSessionData) {
    geminiClient.setHistory(
      convertSessionToHistoryFormats(resumedSessionData.conversation.messages)
        .clientHistory,
    );
  }

  const abortController = new AbortController();

  let currentMessages: Content[] = [{ role: 'user', parts: [{ text: input }] }];
  let turnCount = 0;
  try {
    while (true) {
      turnCount++;
      if (
        config.getMaxSessionTurns() > 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        console.error(
          '\n Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
        );
        return;
      }
      const functionCalls: FunctionCall[] = [];
      let fullResponseText = '';

      const responseStream = await chat.sendMessageStream(
        {
          message: currentMessages[0]?.parts || [], // Ensure parts are always provided
          config: {
            abortSignal: abortController.signal,
            tools: [
              { functionDeclarations: toolRegistry.getFunctionDeclarations() },
            ],
          },
        },
        prompt_id,
      );

      for await (const resp of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }
        const textPart = getResponseText(resp);
        if (textPart) {
          process.stdout.write(textPart);
          fullResponseText += textPart;
        }
        if (resp.functionCalls) {
          functionCalls.push(...resp.functionCalls);
        }
        if (resp.usageMetadata) {
          chatRecordingService.recordMessageTokens({
            input: resp.usageMetadata.promptTokenCount ?? 0,
            output: resp.usageMetadata.candidatesTokenCount ?? 0,
            cached: resp.usageMetadata.cachedContentTokenCount ?? 0,
            thoughts: resp.usageMetadata.thoughtsTokenCount ?? 0,
            tool: resp.usageMetadata.toolUsePromptTokenCount ?? 0,
            total: resp.usageMetadata.totalTokenCount ?? 0,
          });
        }
      }

      // Record the Gemini response if there was text content
      if (fullResponseText.trim()) {
        chatRecordingService.recordMessage({
          type: 'gemini',
          content: fullResponseText,
        });
      }

      if (functionCalls.length > 0) {
        // Record the initial tool calls before execution.
        const toolCallRecords: ToolCallRecord[] = functionCalls.map((fc) => ({
          id: fc.id ?? `${fc.name}-${Date.now()}`,
          name: fc.name as string,
          args: fc.args ?? {},
          status: 'executing',
          timestamp: new Date().toISOString(),
          displayName: fc.name as string,
        }));
        chatRecordingService.recordToolCalls(toolCallRecords);

        const toolResponseParts: Part[] = [];

        for (let i = 0; i < functionCalls.length; i++) {
          const fc = functionCalls[i];
          const requestInfo: ToolCallRequestInfo = {
            callId: toolCallRecords[i].id,
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

          // Update the saved tool call record's status and other properties.
          toolCallRecords[i].status = toolResponse.error ? 'error' : 'success';
          toolCallRecords[i].result = toolResponse.error
            ? undefined
            : toolResponse.responseParts;
          toolCallRecords[i].resultDisplay =
            typeof toolResponse.resultDisplay === 'string'
              ? toolResponse.resultDisplay
              : undefined;

          // Tool call error handling.
          if (toolResponse.error) {
            const isToolNotFound = toolResponse.error.message.includes(
              'not found in registry',
            );
            console.error(
              `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
            if (!isToolNotFound) {
              process.exit(1);
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

        // Update the session with final tool call results
        chatRecordingService.recordToolCalls(toolCallRecords);
        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        process.stdout.write('\n'); // Ensure a final newline
        return;
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    process.exit(1);
  } finally {
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry();
    }
  }
}
