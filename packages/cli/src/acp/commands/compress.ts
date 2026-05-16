/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CompressionStatus, getErrorMessage } from '@google/gemini-cli-core';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';

/**
 * `/compress` (aliases: `/summarize`, `/compact`) — ports the TUI's
 * compress command to ACP. Replaces the conversation history with a
 * model-generated summary so longer-running ACP sessions don't run
 * into context-window limits.
 *
 * Mirrors `packages/cli/src/ui/commands/compressCommand.ts`: same
 * aliases, same force-compress semantics, same telemetry shape
 * (originalTokenCount / newTokenCount / compressionStatus). The TUI
 * version renders a structured "CompressionMessage" with the token
 * counts; ACP returns the equivalent information as plain text since
 * the protocol doesn't surface a typed compression result yet.
 *
 * Addresses one of the near-term solutions listed in
 * https://github.com/google-gemini/gemini-cli/issues/23945
 * ("Implement `/compress` as an ACP supported slash command").
 */
export class CompressCommand implements Command {
  readonly name = 'compress';
  readonly aliases = ['summarize', 'compact'];
  readonly description =
    'Compresses the conversation by replacing it with a summary.';

  async execute(
    context: CommandContext,
    _args: string[],
  ): Promise<CommandExecutionResponse> {
    const promptId = `compress-${Date.now()}`;
    try {
      const result = await context.agentContext.geminiClient.tryCompressChat(
        promptId,
        /* force */ true,
      );

      switch (result.compressionStatus) {
        case CompressionStatus.COMPRESSED:
          return {
            name: this.name,
            data: `Compressed conversation: ${result.originalTokenCount} → ${result.newTokenCount} tokens.`,
          };
        case CompressionStatus.NOOP:
          return {
            name: this.name,
            data: 'No compression needed: the conversation is already small enough.',
          };
        case CompressionStatus.CONTENT_TRUNCATED:
          // Summarisation failed earlier this session, so the
          // compression service fell back to truncating older content
          // to fit the budget. Still useful to report the token delta.
          return {
            name: this.name,
            data: `Summarisation unavailable; content truncated: ${result.originalTokenCount} → ${result.newTokenCount} tokens.`,
          };
        case CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT:
          return {
            name: this.name,
            data: 'Failed to compress chat history: the generated summary was larger than the original.',
          };
        case CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR:
          return {
            name: this.name,
            data: 'Failed to compress chat history: could not count tokens.',
          };
        case CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY:
          return {
            name: this.name,
            data: 'Failed to compress chat history: the generated summary was empty.',
          };
        default:
          return {
            name: this.name,
            data: 'Failed to compress chat history.',
          };
      }
    } catch (e) {
      return {
        name: this.name,
        data: `Failed to compress chat history: ${getErrorMessage(e)}`,
      };
    }
  }
}
