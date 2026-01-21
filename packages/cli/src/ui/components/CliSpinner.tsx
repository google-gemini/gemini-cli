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
  const settings = useSettings();

  if (settings.merged.ui?.showSpinner === false) {
    return null;
  }

  useEffect(() => {
    debugState.debugNumAnimatedComponents++;
    return () => {
      debugState.debugNumAnimatedComponents--;
    };
  }, []);

  return <Spinner {...props} />;
};
