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

/**
 * Service responsible for sending system-level and terminal-specific notifications.
 * It handles focus detection to suppress notifications when the terminal is already focused,
 * and supports policy-mandated "force" notifications that bypass these checks.
 *
 * This service subscribes to the MessageBus to handle:
 * - TOOL_CONFIRMATION_REQUEST: Notifies the user when a tool requires explicit permission to execute.
 * - NOTIFICATION_REQUEST: General notification requests, often used for policy-mandated alerts.
 */
export class NotificationService {
  private isFocused = true; // Default to focused
  private bus?: MessageBus;
  private onFocusChanged = (payload: { focused: boolean }) => {
    this.isFocused = payload.focused;
  };

  constructor(
    private config: NotificationConfig,
    private eventEmitter: CoreEventEmitter = coreEvents,
  ) {
    this.eventEmitter.on(CoreEvent.WindowFocusChanged, this.onFocusChanged);
  }

  private onToolConfirmationRequest = (message: ToolConfirmationRequest) => {
    this.handleToolConfirmationRequest(message);
  };

  private onNotificationRequest = (message: NotificationRequest) => {
    this.handleNotificationRequest(message);
  };

  dispose(): void {
    this.eventEmitter.off(CoreEvent.WindowFocusChanged, this.onFocusChanged);
    if (this.bus) {
      this.bus.unsubscribe(
        MessageBusType.TOOL_CONFIRMATION_REQUEST,
        this.onToolConfirmationRequest,
      );
      this.bus.unsubscribe(
        MessageBusType.NOTIFICATION_REQUEST,
        this.onNotificationRequest,
      );
    }
  }

  /**
   * Triggers a system-level notification and terminal escape sequences.
   */
  async notify(options: NotificationOptions): Promise<void> {
    if (await this.shouldSuppress(options)) {
      return;
    }

    try {
      const notifierOptions = this.prepareNotifierOptions(options);

      notifier.notify(
        notifierOptions,
        (error: Error | null, response: string, meta?: unknown) => {
          if (error) {
            debugLogger.warn('Failed to send system notification', error);
          }
          debugLogger.debug('Notification callback', { response, meta });
        },
      );

      this.sendTerminalNotification(options);
      debugLogger.debug(`Notification sent: ${options.message}`);
    } catch (error) {
      debugLogger.warn('Failed to initiate notification', error);
    }
  }

  /**
   * Checks if the notification should be suppressed based on configuration and focus.
   */
  private async shouldSuppress(options: NotificationOptions): Promise<boolean> {
    if (!this.config.enabled && !options.force) {
      debugLogger.debug('Notification suppressed (disabled in settings)');
      return true;
    }

    if (!options.force && (await this.getEffectiveFocus())) {
      debugLogger.debug('Notification suppressed (window is focused)');
      return true;
    }

    return false;
  }

  /**
   * Determines the effective focus state, accounting for terminals that do not
   * support standard focus reporting by using OS-level checks.
   */
  private async getEffectiveFocus(): Promise<boolean> {
    const termProgram = process.env['TERM_PROGRAM'];
    const unsupportedTerminals = ['Apple_Terminal', 'WarpTerminal'];
    const isUnsupportedTerminal =
      termProgram && unsupportedTerminals.includes(termProgram);

    let effectiveFocused: boolean;

    // 1. Prioritize OS-level check as it's more reliable across terminals.
    const osFocused = await isTerminalAppFocused();

    if (osFocused !== null) {
      effectiveFocused = osFocused;
      debugLogger.debug(
        `Focus check (OS-level): focused=${effectiveFocused}, termProgram=${termProgram}`,
      );
    } else {
      // 2. Fallback to ANSI-based focus detection (from UI).
      effectiveFocused = this.isFocused;

      // 3. Safety check for known problematic terminals.
      // If both checks fail (osFocused is null, and ANSI reports focus, which could be a false positive),
      // we assume NOT focused for known problematic terminals to be safe.
      if (effectiveFocused && isUnsupportedTerminal) {
        effectiveFocused = false;
        debugLogger.debug(
          `Focus check (Fallback): Suppressing ANSI focus for unsupported terminal ${termProgram}`,
        );
      } else {
        debugLogger.debug(
          `Focus check (Fallback): focused=${effectiveFocused} (ANSI), termProgram=${termProgram}`,
        );
      }
    }

    return effectiveFocused;
  }

  /**
   * Prepares the options for node-notifier, applying defaults and platform-specific tweaks.
   */
  private prepareNotifierOptions(
    options: NotificationOptions,
  ): NotificationOptions {
    const notifierOptions: NotificationOptions = {
      title: options.title || 'Gemini CLI',
      message: options.message || 'Requires Permission to Execute Command',
      sound: !!options.sound,
      wait: !!options.wait,
      force: !!options.force,
    };

    if (process.platform === 'darwin') {
      const bundleId = process.env['__CFBundleIdentifier'];

      if (options.activate) {
        notifierOptions.activate = options.activate;
      } else if (bundleId) {
        notifierOptions.activate = bundleId;
      }
    }

    return notifierOptions;
  }

  /**
   * Sends terminal-specific notification escape sequences.
   * These are handled by the terminal emulator itself.
   */
  private sendTerminalNotification(options: NotificationOptions): void {
    if (!process.stdout.isTTY) {
      return;
    }

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
    this.bus = bus;
    bus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      this.onToolConfirmationRequest,
    );

    bus.subscribe(
      MessageBusType.NOTIFICATION_REQUEST,
      this.onNotificationRequest,
    );
  }

  private handleToolConfirmationRequest(
    message: ToolConfirmationRequest,
  ): void {
    const toolName = message.toolCall.name;
    void this.notify({
      message: `Require tool Permission: ${toolName}`,
    });
  }

  private handleNotificationRequest(message: NotificationRequest): void {
    void this.notify({
      message: message.message,
      title: message.title,
      force: message.force,
    });
  }
}
