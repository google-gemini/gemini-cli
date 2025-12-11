/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import notifier from 'node-notifier';
import process from 'node:process';
import { StreamingState } from '../types.js';
import type { Settings } from '../../config/settingsSchema.js';

/**
 * Triggers a system notification when the CLI is waiting for confirmation,
 * the window is not focused, and notifications are enabled.
 *
 * @param streamingState The current streaming state of the application.
 * @param isFocused Whether the application window is currently focused.
 * @param settings The application settings.
 */
export const useNotification = (
  streamingState: StreamingState,
  isFocused: boolean,
  settings: Settings,
) => {
  const hasNotified = useRef(false);

  useEffect(() => {
    if (streamingState !== StreamingState.WaitingForConfirmation) {
      hasNotified.current = false;
      return;
    }
    /**
     * List of terminals that do not properly support focus detection.
     * In these terminals, we always send notifications when waiting for confirmation.
     */
    const unsupportedTerminals = ['WarpTerminal'];
    const currentTerminal = process.env['TERM_PROGRAM'];
    const isUnsupportedTerminal =
      currentTerminal && unsupportedTerminals.includes(currentTerminal);

    if (
      streamingState === StreamingState.WaitingForConfirmation &&
      (isUnsupportedTerminal || !isFocused) &&
      settings.ui?.enableNotifications &&
      !hasNotified.current
    ) {
      const isMac = process.platform === 'darwin';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: any = {
        title: 'Gemini CLI',
        message: 'Requires Permission to Execute Command',
        sound: false,
        wait: false,
      };

      // On macOS, set the activate option to bring the app to the foreground when
      // the notification is clicked.
      if (isMac) {
        const bundleId = process.env['__CFBundleIdentifier'];

        if (bundleId) {
          options.activate = bundleId;
        }
      }

      notifier.notify(options);
      hasNotified.current = true;
    }
  }, [streamingState, isFocused, settings.ui?.enableNotifications]);
};
