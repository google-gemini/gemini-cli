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
} from '@google/gemini-cli-core';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentResponse,
} from '@google/genai';
import { listSessions, loadSession } from './utils/session.js';

import { parseAndFormatApiError } from './ui/utils/errorParsing.js';

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
  initialHistory: Content[] = [],
): Promise<Content[]> {
  // Handle EPIPE errors when the output is piped to a command that closes early.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      // Exit gracefully if the pipe is closed.
      process.exit(0);
    }
  });

  const geminiClient = config.getGeminiClient();
  const toolRegistry: ToolRegistry = await config.getToolRegistry();

  const chat = await geminiClient.getChat();
  const abortController = new AbortController();
  let currentMessages: Content[] =
    initialHistory.length > 0
      ? initialHistory
      : [{ role: 'user', parts: [{ text: input }] }];

  if (input.startsWith('/chat list-auto')) {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      process.stdout.write('No automatically saved sessions found.\n');
    } else {
      process.stdout.write('Automatically saved sessions:\n');
      sessions.forEach((session) => {
        process.stdout.write(
          `  ${session.shortId} - ${session.fullId} - ${session.timestamp}\n`,
        );
      });
    }
    return currentMessages;
  } else if (input.startsWith('/chat resume-auto ')) {
    const sessionId = input.substring('/chat resume-auto '.length).trim();
    if (sessionId) {
      const loadedHistory = await loadSession(sessionId);
      if (loadedHistory) {
        process.stdout.write(`Session ${sessionId} loaded successfully.\n`);
        return loadedHistory;
      } else {
        process.stdout.write(`Failed to load session ${sessionId}.\n`);
      }
    } else {
      process.stdout.write('Please provide a session ID to resume.\n');
    }
    return currentMessages;
  }

  try {
    while (true) {
      const functionCalls: FunctionCall[] = [];

      const responseStream = await chat.sendMessageStream({
        message: currentMessages[0]?.parts || [], // Ensure parts are always provided
        config: {
          abortSignal: abortController.signal,
          tools: [
            { functionDeclarations: toolRegistry.getFunctionDeclarations() },
          ],
        },
      });

      for await (const resp of responseStream) {
        if (abortController.signal.aborted) {
          return currentMessages;
        }
        const textPart = getResponseText(resp);
        if (textPart) {
          process.stdout.write(textPart);
        }
        if (resp.functionCalls) {
          functionCalls.push(...resp.functionCalls);
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
          };

          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            toolRegistry,
            abortController.signal,
          );

          if (toolResponse.error) {
            const isToolNotFound = toolResponse.error.message.includes(
              'not found in registry',
            );
            console.error(
              `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
            if (!isToolNotFound) {
              throw new Error(
                `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
              );
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
        process.stdout.write('\n'); // Ensure a final newline
        return currentMessages;
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig().authType,
      ),
    );
    throw error; // Re-throw the error to be handled by the caller
  } finally {
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry();
    }
  }
}
