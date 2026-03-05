/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { InterruptController, debugLogger } from '@google/gemini-cli-core';

/**
 * Minimal interface for a stream-based generation client.
 * Mirrors the subset of GeminiClient used for response generation.
 */
export interface GenerationClient {
  sendMessageStream(
    parts: unknown[],
    signal: AbortSignal,
    promptId: string,
  ): AsyncGenerator<GenerationEvent>;
}

/**
 * A single chunk from the generation stream.
 * Maps to the `Content` event type emitted by GeminiClient.
 */
export interface GenerationEvent {
  type: 'content' | 'error' | 'done';
  value?: string;
}

/**
 * Callback invoked whenever new user input arrives.
 * Implementations can read from stdin, a voice transcription pipeline,
 * or any other source. Return `null` to signal end of input.
 */
export type InputProvider = () => Promise<string | null>;

/**
 * Demonstrates interruptible generation using {@link InterruptController}.
 *
 * When new user input arrives while a response is still streaming, the
 * session cancels the active generation and immediately starts a new one
 * with the updated prompt. This is the core UX pattern needed for voice
 * mode, where a user may speak a new instruction mid-response.
 *
 * Usage with a real GeminiClient:
 * ```ts
 * import { InterruptibleSession } from './voice/interruptibleSession.js';
 *
 * const session = new InterruptibleSession(geminiClient, 'prompt-id');
 * await session.run(async () => {
 *   // Return next user input from voice transcription, stdin, etc.
 *   return getNextUserInput();
 * });
 * ```
 *
 * Future voice integrations (node-record-lpcm16, node-vad) would provide
 * the InputProvider callback, feeding transcribed text into this session.
 */
export class InterruptibleSession {
  private readonly interruptController = new InterruptController();
  private readonly client: GenerationClient;
  private readonly promptId: string;
  private generating = false;

  constructor(client: GenerationClient, promptId: string) {
    this.client = client;
    this.promptId = promptId;
  }

  /** Whether a generation is currently in progress. */
  get isGenerating(): boolean {
    return this.generating;
  }

  /**
   * Run the interactive session loop.
   *
   * Reads input via {@link getInput}. If a generation is active when new
   * input arrives, the current generation is interrupted and restarted
   * with the new prompt.
   *
   * @param getInput - Async callback that returns the next user input,
   *   or `null` to end the session.
   * @param onChunk - Optional callback for each streamed content chunk.
   */
  async run(
    getInput: InputProvider,
    onChunk?: (text: string) => void,
  ): Promise<void> {
    while (true) {
      const input = await getInput();
      if (input === null) {
        // End of input — cancel any in-flight generation and exit.
        if (this.generating) {
          this.interruptController.interrupt('Session ended');
        }
        break;
      }

      // If a generation is in flight, interrupt it.
      if (this.generating) {
        debugLogger.log('[voice] interruption detected');
        debugLogger.log('[voice] cancelling current response');
        this.interruptController.interrupt();
      }

      await this.generate(input, onChunk);
    }
  }

  /**
   * Generate a response for a single prompt, respecting the interrupt signal.
   * Exposed for direct use outside the {@link run} loop.
   */
  async generate(
    input: string,
    onChunk?: (text: string) => void,
  ): Promise<string> {
    this.generating = true;
    let accumulated = '';

    try {
      const stream = this.client.sendMessageStream(
        [{ text: input }],
        this.interruptController.signal,
        this.promptId,
      );

      for await (const event of stream) {
        // Check abort after each chunk.
        if (this.interruptController.aborted) {
          debugLogger.log('[voice] generation aborted mid-stream');
          break;
        }

        if (event.type === 'content' && event.value) {
          accumulated += event.value;
          onChunk?.(event.value);
        }

        if (event.type === 'error') {
          break;
        }
      }
    } catch (error: unknown) {
      // AbortError is expected when interrupted — swallow it.
      if (!isAbortError(error)) {
        throw error;
      }
      debugLogger.log('[voice] generation interrupted');
    } finally {
      this.generating = false;
      this.interruptController.reset();
    }

    return accumulated;
  }
}

/** Check whether an error is an AbortError thrown by an aborted signal. */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
