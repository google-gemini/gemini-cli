/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Spinner from 'ink-spinner';
import { type ComponentProps, useEffect, useState } from 'react';
import { debugState } from '../debug.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { appEvents, AppEvent } from '../../utils/events.js';
import { Text } from 'ink';
import cliSpinners from 'cli-spinners';

export type SpinnerProps = ComponentProps<typeof Spinner>;

export const CliSpinner = (props: SpinnerProps) => {
  const settings = useSettings();
  const shouldShow = settings.merged.ui?.showSpinner !== false;
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (shouldShow) {
      debugState.debugNumAnimatedComponents++;
      return () => {
        debugState.debugNumAnimatedComponents--;
      };
    }
    return undefined;
  }, [shouldShow]);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined = undefined;
    const handleTyping = () => {
      setIsTyping(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        setIsTyping(false);
      }, 150); // Pause animation for 150ms after last keystroke
    };

    appEvents.on(AppEvent.UserTyping, handleTyping);
    return () => {
      appEvents.off(AppEvent.UserTyping, handleTyping);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  if (!shouldShow) {
    return null;
  }

  if (isTyping) {
    // Show static frame when typing to avoid tearing
    const spinner = cliSpinners[props.type || 'dots'];
    const staticFrame = spinner?.frames?.[0] || '⠋';
    return <Text>{staticFrame}</Text>;
  }

  return <Spinner {...props} />;
};
