/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import notifier from 'node-notifier';
import process from 'node:process';
import { debugLogger } from '../../utils/debugLogger.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type ToolConfirmationRequest,
  type NotificationRequest,
} from '../../confirmation-bus/types.js';
import {
  coreEvents,
  CoreEvent,
  type CoreEventEmitter,
} from '../../utils/events.js';
import { isTerminalAppFocused } from './focusUtils.js';

export interface NotificationConfig {
  enabled: boolean;
}

export interface NotificationOptions {
  title?: string;
  message: string;
  sound?: boolean;
  wait?: boolean;
  activate?: string;
  /**
   * If true, bypasses focus and config checks.
   * Useful for policy-mandated notifications.
   */
  force?: boolean;
}

export class NotificationService {
  private isFocused = true; // Default to focused

  constructor(
    private config: NotificationConfig,
    eventEmitter: CoreEventEmitter = coreEvents,
  ) {
    eventEmitter.on(CoreEvent.WindowFocusChanged, (payload) => {
      this.isFocused = payload.focused;
    });
  }

  notify(options: NotificationOptions): void {
    if (!this.config.enabled && !options.force) {
      debugLogger.debug('Notification suppressed (disabled in settings)');
      return;
    }

    if (!options.force) {
      // List of terminals that do not properly support focus detection reporting (ANSI ?1004h).
      // In these terminals, we use an OS-level check to see if the terminal app is frontmost.
      const unsupportedTerminals = ['Apple_Terminal', 'WarpTerminal'];
      const termProgram = process.env['TERM_PROGRAM'];
      const isUnsupportedTerminal =
        termProgram && unsupportedTerminals.includes(termProgram);

      let focused = this.isFocused;

      // If the terminal doesn't support focus reporting, or if we want to double-check,
      // we use the OS-level focus check.
      if (isUnsupportedTerminal) {
        const osFocused = isTerminalAppFocused();
        if (osFocused !== null) {
          focused = osFocused;
        } else {
          // If we can't determine OS-level focus for an unsupported terminal,
          // we assume NOT focused to be safe and send the notification.
          focused = false;
        }
      }

      debugLogger.debug(
        `Notification check: isFocused=${this.isFocused}, isUnsupportedTerminal=${isUnsupportedTerminal}, effectiveFocused=${focused}`,
      );

      if (focused) {
        debugLogger.debug('Notification suppressed (window is focused)');
        return;
      }
    }

    const platform = process.platform;
    const isMac = platform === 'darwin';

    const notifierOptions: NotificationOptions = {
      title: options.title || 'Gemini CLI',
      message: options.message || 'Requires Permission to Execute Command',
      sound: !!options.sound,
      wait: !!options.wait,
      force: !!options.force,
    };

    if (isMac) {
      const bundleId = process.env['__CFBundleIdentifier'];

      if (options.activate) {
        notifierOptions.activate = options.activate;
      } else if (bundleId) {
        notifierOptions.activate = bundleId;
      }
    }

    try {
      notifier.notify(notifierOptions, (error, response, meta) => {
        if (error) {
          debugLogger.warn('Failed to send system notification', error);
        }
        debugLogger.debug('Notification callback', { response, meta });
      });
      this.sendTerminalNotification(options);
      debugLogger.debug(`Notification sent: ${options.message}`);
    } catch (error) {
      debugLogger.warn('Failed to initiate notification', error);
    }
  }

  /**
   * Sends terminal-specific notification escape sequences.
   * These are handled by the terminal emulator itself.
   */
  private sendTerminalNotification(options: NotificationOptions): void {
    const termProgram = process.env['TERM_PROGRAM'];
    const term = process.env['TERM'];

    // OSC 9; <message> BEL is supported by iTerm2, Kitty, Warp and others.
    const isIterm = termProgram === 'iTerm.app';
    const isKitty = termProgram === 'kitty' || term === 'xterm-kitty';
    const isWarp = termProgram === 'WarpTerminal';

    if (isIterm || isKitty || isWarp) {
      // Sanitize message to avoid escape sequence injection
      // eslint-disable-next-line no-control-regex
      const sanitizedMessage = options.message.replace(/[\x00-\x1f\x7f]/g, '');
      process.stdout.write(`\x1b]9;${sanitizedMessage}\x07`);
    }
  }

  updateConfig(config: NotificationConfig) {
    this.config = config;
  }

  subscribeToBus(bus: MessageBus): void {
    bus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      (message: ToolConfirmationRequest) => {
        this.handleToolConfirmationRequest(message);
      },
    );

    bus.subscribe(
      MessageBusType.NOTIFICATION_REQUEST,
      (message: NotificationRequest) => {
        this.handleNotificationRequest(message);
      },
    );
  }

  private handleToolConfirmationRequest(
    message: ToolConfirmationRequest,
  ): void {
    const toolName = message.toolCall.name;
    this.notify({
      message: `Confirm: ${toolName}`,
    });
  }

  private handleNotificationRequest(message: NotificationRequest): void {
    this.notify({
      message: message.message,
      title: message.title,
      force: message.force,
    });
  }
}
