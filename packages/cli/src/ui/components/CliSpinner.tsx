/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Spinner from 'ink-spinner';
import cliSpinners, { type SpinnerName } from 'cli-spinners';
import { Text } from 'ink';
import React, { type ComponentProps, useEffect, useState } from 'react';
import { isTmux } from '@google/gemini-cli-core';
import { debugState } from '../debug.js';
import { useSettings } from '../contexts/SettingsContext.js';

export type SpinnerProps = ComponentProps<typeof Spinner>;

export const TMUX_SPINNER_INTERVAL_MS = 120;

const TmuxSpinner: React.FC<{ type?: SpinnerName }> = React.memo(
  ({ type = 'dots' }: { type?: SpinnerName }) => {
    const [frame, setFrame] = useState(0);
    const spinner = cliSpinners[type] ?? cliSpinners.dots;
    const intervalMs = Math.max(spinner.interval, TMUX_SPINNER_INTERVAL_MS);

    useEffect(() => {
      const timer = setInterval(() => {
        setFrame((previousFrame) =>
          previousFrame >= spinner.frames.length - 1 ? 0 : previousFrame + 1,
        );
      }, intervalMs);

      return () => {
        clearInterval(timer);
      };
    }, [spinner, intervalMs]);

    return <Text>{spinner.frames[frame % spinner.frames.length]}</Text>;
  },
);
TmuxSpinner.displayName = 'TmuxSpinner';

export const CliSpinner: React.FC<SpinnerProps> = React.memo(
  (props: SpinnerProps) => {
    const settings = useSettings();
    const shouldShow = settings.merged.ui?.showSpinner !== false;
    const inTmux = isTmux();

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

    if (inTmux) {
      return <TmuxSpinner type={props.type} />;
    }

    return <Spinner {...props} />;
  },
);
CliSpinner.displayName = 'CliSpinner';
