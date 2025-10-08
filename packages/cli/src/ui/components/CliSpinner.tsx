/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Spinner from 'ink-spinner';
import { type ComponentProps, useEffect } from 'react';

// A top-level field to track the total number of active spinners.
export let debugNumSpinners = 0;

export type SpinnerProps = ComponentProps<typeof Spinner>;

export const CliSpinner = (props: SpinnerProps) => {
  useEffect(() => {
    debugNumSpinners++;
    return () => {
      debugNumSpinners--;
    };
  }, []);

  return <Spinner {...props} />;
};
