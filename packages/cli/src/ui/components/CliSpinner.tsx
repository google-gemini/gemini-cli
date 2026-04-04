/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Spinner from 'ink-spinner';
import { type ComponentProps, useEffect } from 'react';
import { debugState } from '../debug.js';
import { useSettings } from '../contexts/SettingsContext.js';
import {
  CircularSpinner,
  type CircularSpinnerVariant,
} from './CircularSpinner.js';

type SpinnerProps = ComponentProps<typeof Spinner> & {
  useBraille?: boolean;
  variant?: CircularSpinnerVariant;
};

export const CliSpinner = ({
  useBraille = false,
  variant = 'Medium',
  ...props
}: SpinnerProps) => {
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

  if (!shouldShow) {
    return null;
  }

  if (useBraille) {
    return <CircularSpinner variant={variant} />;
  }

  return <Spinner {...props} />;
};
