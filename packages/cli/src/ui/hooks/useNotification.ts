/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import notifier from 'node-notifier';
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamingState } from '../types.js';
import type { Settings } from '../../config/settingsSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    if (
      streamingState === StreamingState.WaitingForConfirmation &&
      !isFocused &&
      settings.ui?.enableNotifications &&
      !hasNotified.current
    ) {
      const isMac = process.platform === 'darwin';

      let iconPath = path.resolve(__dirname, '../../../assets/icon.png');
      if (!fs.existsSync(iconPath)) {
        iconPath = path.resolve(__dirname, '../../../../assets/icon.png');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: any = {
        title: 'Gemini CLI',
        message: 'Requires Permission to Execute Command',
        sound: isMac ? 'Glass' : true,
        wait: false,
        icon: iconPath,
        contentImage: iconPath,
      };

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
