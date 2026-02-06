/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Spinner from 'ink-spinner';
import { type ComponentProps, useEffect, useMemo } from 'react';
import { debugState } from '../debug.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { isAndroid } from '../utils/terminalUtils.js';

export type SpinnerProps = ComponentProps<typeof Spinner>;

export const CliSpinner = (props: SpinnerProps) => {
  const settings = useSettings();
  const shouldShow = settings.merged.ui?.showSpinner !== false;

  useEffect(() => {
    if (shouldShow) {
      debugState.debugNumAnimatedComponents++;
      return () => {
        debugState.debugNumAnimatedComponents--;
      };
    }
    return undefined;
  }, [shouldShow]);

  const optimizedProps = useMemo(() => {
    if (isAndroid()) {
      // Align with 60Hz refresh rate multiples (16.67ms * 8 = ~133ms)
      const interval = (props).interval || 133;
      return {
        ...props,
        type: props.type || 'dots',
        interval,
      };
    }
    return props;
  }, [props]);

  if (!shouldShow) {
    return null;
  }

  return <Spinner {...optimizedProps} />;
};
