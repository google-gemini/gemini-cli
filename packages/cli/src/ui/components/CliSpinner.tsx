/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Spinner from 'ink-spinner';
import { type ComponentProps, useEffect } from 'react';
import { debugState } from '../debug.js';
import { useSettings } from '../contexts/SettingsContext.js';

export type SpinnerProps = ComponentProps<typeof Spinner>;

export const CliSpinner = (props: SpinnerProps) => {
  const settings = useSettings().merged;
  const disableSpinner = settings.ui?.accessibility?.disableSpinner;

  useEffect(() => {
    if (disableSpinner) {
      return;
    }
    debugState.debugNumAnimatedComponents++;
    return () => {
      debugState.debugNumAnimatedComponents--;
    };
  }, [disableSpinner]);

  if (disableSpinner) {
    return null;
  }

  return <Spinner {...props} />;
};
