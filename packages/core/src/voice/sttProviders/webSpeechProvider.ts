/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Placeholder STT provider for the Web Speech API.
 *
 * This provider is intended for future browser-based integration
 * where the Web Speech API (`SpeechRecognition`) is available.
 * In a Node.js / CLI context this provider is non-functional and
 * will throw if started. It exists to define the integration point
 * and satisfy the {@link STTProvider} interface contract.
 */

import type { STTProvider, TranscriptResult } from '../types.js';

/**
 * Web Speech API speech-to-text provider (placeholder).
 *
 * This class implements the {@link STTProvider} interface but will
 * throw an error when `start()` is called in a non-browser environment.
 */
export class WebSpeechProvider implements STTProvider {
  private transcriptHandler: ((result: TranscriptResult) => void) | null = null;
  private _isListening = false;

  /**
   * Start listening via the Web Speech API.
   *
   * @throws Always throws in a Node.js environment.
   */
  async start(): Promise<void> {
    // In a browser context, this would use:
    //   const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    //   recognition.continuous = true;
    //   recognition.interimResults = true;
    //   recognition.lang = this.language;
    //   recognition.onresult = (event) => { ... };
    //   recognition.start();
    throw new Error(
      'WebSpeechProvider is not available in a Node.js environment. ' +
        'Use ExternalSTTProvider with a command-line STT tool instead.',
    );
  }

  async stop(): Promise<void> {
    this._isListening = false;
  }

  onTranscript(handler: (result: TranscriptResult) => void): void {
    this.transcriptHandler = handler;
  }

  isListening(): boolean {
    return this._isListening;
  }

  /**
   * Emit a transcript result. Provided for subclasses or future
   * browser integration to use.
   */
  protected emitTranscript(result: TranscriptResult): void {
    this.transcriptHandler?.(result);
  }
}
