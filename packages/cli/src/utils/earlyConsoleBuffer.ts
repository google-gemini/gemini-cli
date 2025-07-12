/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import util from 'util';
import { ConsoleMessageItem } from '../ui/types.js';

type ConsoleMethod = 'log' | 'warn' | 'error' | 'debug';

// Define which console messages should be shown in DetailedMessagesDisplay
const CONSOLE_DISPLAY_PATTERNS: string[] = ['MCP STDERR'];

/**
 * Checks if a console message should be displayed in DetailedMessagesDisplay
 * based on configured patterns.
 *
 * @param message The console message content
 * @param patterns The patterns to check against
 * @returns true if the message should be shown in DetailedMessagesDisplay, false for regular console
 */
function shouldShowInDisplay(message: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return true; // Default to showing in display if no patterns
  }

  return patterns.some((pattern) => message.includes(pattern));
}

interface BufferedMessage {
  type: ConsoleMethod;
  args: unknown[];
  timestamp: number;
}

class EarlyConsoleBuffer {
  private buffer: BufferedMessage[] = [];
  private isActive = false;
  private originalMethods: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };

  constructor() {
    this.originalMethods = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
  }

  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    const createInterceptor =
      (type: ConsoleMethod) =>
      (...args: unknown[]) => {
        const formattedMessage = util.format(...args);

        // Check if message should be shown in display
        const shouldShowInDisplayFlag = shouldShowInDisplay(
          formattedMessage,
          CONSOLE_DISPLAY_PATTERNS,
        );

        if (shouldShowInDisplayFlag) {
          // Buffer the message for DetailedMessagesDisplay
          this.buffer.push({
            type,
            args,
            timestamp: Date.now(),
          });
        } else {
          // Pass through to original console
          this.originalMethods[type](...args);
        }
      };

    console.log = createInterceptor('log');
    console.warn = createInterceptor('warn');
    console.error = createInterceptor('error');
    console.debug = createInterceptor('debug');
  }

  stop(): void {
    if (!this.isActive) return;
    this.isActive = false;

    // Restore original methods
    console.log = this.originalMethods.log;
    console.warn = this.originalMethods.warn;
    console.error = this.originalMethods.error;
    console.debug = this.originalMethods.debug;
  }

  getBufferedMessages(): ConsoleMessageItem[] {
    const messages = this.buffer.map((msg) => ({
      type: msg.type,
      content: util.format(...msg.args),
      count: 1,
    }));
    // Clear the buffer after returning messages to avoid duplicates
    this.buffer = [];
    return messages;
  }

  clear(): void {
    this.buffer = [];
  }
}

// Singleton instance
export const earlyConsoleBuffer = new EarlyConsoleBuffer();
