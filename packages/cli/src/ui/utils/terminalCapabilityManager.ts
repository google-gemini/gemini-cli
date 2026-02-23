/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import {
  debugLogger,
  enableKittyKeyboardProtocol,
  disableKittyKeyboardProtocol,
  enableModifyOtherKeys,
  disableModifyOtherKeys,
  enableBracketedPasteMode,
  disableBracketedPasteMode,
} from '@google/gemini-cli-core';
import { parseColor } from '../themes/color-utils.js';

export type TerminalBackgroundColor = string | undefined;

const TERMINAL_CLEANUP_SEQUENCE = '\x1b[<u\x1b[>4;0m\x1b[?2004l';

export function cleanupTerminalOnExit() {
  try {
    if (process.stdout?.fd !== undefined) {
      fs.writeSync(process.stdout.fd, TERMINAL_CLEANUP_SEQUENCE);
      return;
    }
  } catch (e) {
    debugLogger.warn('Failed to synchronously cleanup terminal modes:', e);
  }

  disableKittyKeyboardProtocol();
  disableModifyOtherKeys();
  disableBracketedPasteMode();
}

export class TerminalCapabilityManager {
  private static instance: TerminalCapabilityManager | undefined;

  private static readonly KITTY_QUERY = '\x1b[?u';
  private static readonly OSC_11_QUERY = '\x1b]11;?\x1b\\';
  private static readonly TERMINAL_NAME_QUERY = '\x1b[>q';
  private static readonly DEVICE_ATTRIBUTES_QUERY = '\x1b[c';
  private static readonly MODIFY_OTHER_KEYS_QUERY = '\x1b[>4;?m';
  private static readonly HIDDEN_MODE = '\x1b[8m';
  private static readonly CLEAR_LINE_AND_RETURN = '\x1b[2K\r';
  private static readonly RESET_ATTRIBUTES = '\x1b[0m';

  /**
   * Triggers a terminal background color query.
   * @param stdout The stdout stream to write to.
   */
  static queryBackgroundColor(stdout: {
    write: (data: string) => void | boolean;
  }): void {
    stdout.write(TerminalCapabilityManager.OSC_11_QUERY);
  }

  // Kitty keyboard flags: CSI ? flags u
  // eslint-disable-next-line no-control-regex
  private static readonly KITTY_REGEX = /\x1b\[\?(\d+)u/;
  // Terminal Name/Version response: DCS > | text ST (or BEL)
  // eslint-disable-next-line no-control-regex
  private static readonly TERMINAL_NAME_REGEX = /\x1bP>\|(.+?)(\x1b\\|\x07)/;
  // Primary Device Attributes: CSI ? ID ; ... c
  // eslint-disable-next-line no-control-regex
  private static readonly DEVICE_ATTRIBUTES_REGEX = /\x1b\[\?(\d+)(;\d+)*c/;
  // OSC 11 response: OSC 11 ; rgb:rrrr/gggg/bbbb ST (or BEL)
  static readonly OSC_11_REGEX =
    // eslint-disable-next-line no-control-regex
    /\x1b\]11;rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})(\x1b\\|\x07)/;
  // modifyOtherKeys response: CSI > 4 ; level m
  // eslint-disable-next-line no-control-regex
  private static readonly MODIFY_OTHER_KEYS_REGEX = /\x1b\[>4;(\d+)m/;

  private detectionComplete = false;
  private terminalBackgroundColor: TerminalBackgroundColor;
  private kittySupported = false;
  private kittyEnabled = false;
  private modifyOtherKeysSupported = false;
  private terminalName: string | undefined;

  private constructor() {}

  static getInstance(): TerminalCapabilityManager {
    if (!this.instance) {
      this.instance = new TerminalCapabilityManager();
    }
    return this.instance;
  }

  static resetInstanceForTesting(): void {
    this.instance = undefined;
  }

  /**
   * Detects terminal capabilities (Kitty protocol support, terminal name,
   * background color).
   * This should be called once at app startup.
   */
  async detectCapabilities(): Promise<void> {
    if (this.detectionComplete) return;

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      this.detectionComplete = true;
      return;
    }

    process.off('exit', cleanupTerminalOnExit);
    process.off('SIGTERM', cleanupTerminalOnExit);
    process.off('SIGINT', cleanupTerminalOnExit);
    process.on('exit', cleanupTerminalOnExit);
    process.on('SIGTERM', cleanupTerminalOnExit);
    process.on('SIGINT', cleanupTerminalOnExit);

    return new Promise((resolve) => {
      const originalRawMode = process.stdin.isRaw;
      if (!originalRawMode) {
        process.stdin.setRawMode(true);
      }

      let buffer = '';
      let kittyKeyboardReceived = false;
      let terminalNameReceived = false;
      let deviceAttributesReceived = false;
      let bgReceived = false;
      let modifyOtherKeysReceived = false;
      // eslint-disable-next-line prefer-const
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        process.stdin.removeListener('data', onData);
        if (!originalRawMode) {
          process.stdin.setRawMode(false);
        }
        this.detectionComplete = true;

        this.enableSupportedModes();

        resolve();
      };

      // A somewhat long timeout is acceptable as all terminals should respond
      // to the device attributes query used as a sentinel.
      timeoutId = setTimeout(cleanup, 1000);

      const onData = (data: Buffer) => {
        buffer += data.toString();

        // Check OSC 11
        if (!bgReceived) {
          const match = buffer.match(TerminalCapabilityManager.OSC_11_REGEX);
          if (match) {
            bgReceived = true;
            this.terminalBackgroundColor = parseColor(
              match[1],
              match[2],
              match[3],
            );
            debugLogger.log(
              `Detected terminal background color: ${this.terminalBackgroundColor}`,
            );
          }
        }

        if (
          !kittyKeyboardReceived &&
          TerminalCapabilityManager.KITTY_REGEX.test(buffer)
        ) {
          kittyKeyboardReceived = true;
          this.kittySupported = true;
        }

        // check for modifyOtherKeys support
        if (!modifyOtherKeysReceived) {
          const match = buffer.match(
            TerminalCapabilityManager.MODIFY_OTHER_KEYS_REGEX,
          );
          if (match) {
            modifyOtherKeysReceived = true;
            const level = parseInt(match[1], 10);
            this.modifyOtherKeysSupported = level >= 2;
            debugLogger.log(
              `Detected modifyOtherKeys support: ${this.modifyOtherKeysSupported} (level ${level})`,
            );
          }
        }

        // Check for Terminal Name/Version response.
        if (!terminalNameReceived) {
          const match = buffer.match(
            TerminalCapabilityManager.TERMINAL_NAME_REGEX,
          );
          if (match) {
            terminalNameReceived = true;
            this.terminalName = match[1];

            debugLogger.log(`Detected terminal name: ${this.terminalName}`);
          }
        }

        // We use the Primary Device Attributes response as a sentinel to know
        // that the terminal has processed all our queries. Since we send it
        // last, receiving it means we can stop waiting.
        if (!deviceAttributesReceived) {
          const match = buffer.match(
            TerminalCapabilityManager.DEVICE_ATTRIBUTES_REGEX,
          );
          if (match) {
            deviceAttributesReceived = true;
            cleanup();
          }
        }
      };

      process.stdin.on('data', onData);

      try {
        fs.writeSync(
          process.stdout.fd,
          // Use hidden mode to prevent potential "m" character from being printed
          // to the terminal during startup when querying for modifyOtherKeys.
          // This can happen on some terminals that might echo the query or
          // malform the response. We hide the output, send queries, then
          // immediately clear the line and reset attributes.
          TerminalCapabilityManager.HIDDEN_MODE +
            TerminalCapabilityManager.KITTY_QUERY +
            TerminalCapabilityManager.OSC_11_QUERY +
            TerminalCapabilityManager.TERMINAL_NAME_QUERY +
            TerminalCapabilityManager.MODIFY_OTHER_KEYS_QUERY +
            TerminalCapabilityManager.DEVICE_ATTRIBUTES_QUERY +
            TerminalCapabilityManager.CLEAR_LINE_AND_RETURN +
            TerminalCapabilityManager.RESET_ATTRIBUTES,
        );
      } catch (e) {
        debugLogger.warn('Failed to write terminal capability queries:', e);
        cleanup();
      }
    });
  }

  enableSupportedModes() {
    try {
      if (this.kittySupported) {
        enableKittyKeyboardProtocol();
        this.kittyEnabled = true;
      } else if (this.modifyOtherKeysSupported) {
        enableModifyOtherKeys();
      }
      // Always enable bracketed paste since it'll be ignored if unsupported.
      enableBracketedPasteMode();
    } catch (e) {
      debugLogger.warn('Failed to enable keyboard protocols:', e);
    }
  }

  getTerminalBackgroundColor(): TerminalBackgroundColor {
    return this.terminalBackgroundColor;
  }

  getTerminalName(): string | undefined {
    return this.terminalName;
  }

  isKittyProtocolEnabled(): boolean {
    return this.kittyEnabled;
  }

  supportsOsc9Notifications(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env['WT_SESSION']) {
      return false;
    }

    return (
      this.hasOsc9TerminalSignature(this.getTerminalName()) ||
      this.hasOsc9TerminalSignature(env['TERM_PROGRAM']) ||
      this.hasOsc9TerminalSignature(env['TERM'])
    );
  }

  private hasOsc9TerminalSignature(value: string | undefined): boolean {
    if (!value) {
      return false;
    }

    const normalized = value.toLowerCase();
    return (
      normalized.includes('wezterm') ||
      normalized.includes('ghostty') ||
      normalized.includes('iterm') ||
      normalized.includes('kitty')
    );
  }
}

export const terminalCapabilityManager =
  TerminalCapabilityManager.getInstance();
