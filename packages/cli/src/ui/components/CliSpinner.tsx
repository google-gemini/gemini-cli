/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Spinner from 'ink-spinner';
import { type ComponentProps, useEffect } from 'react';
import { debugState } from '../debug.js';

export type SpinnerProps = ComponentProps<typeof Spinner>;

export const CliSpinner = (props: SpinnerProps) => {
  useEffect(() => {
    debugState.debugNumAnimatedComponents++;
    return () => {
      debugState.debugNumAnimatedComponents--;
    };
  }, []);

  return <Spinner {...props} />;
};
