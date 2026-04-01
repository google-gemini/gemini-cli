/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackgroundTaskDisplay } from './BackgroundTaskDisplay.js';
import type { BackgroundTask } from '../hooks/useExecutionLifecycle.js';

interface BackgroundShellDisplayProps {
  shells: Map<number, BackgroundTask>;
  activePid: number;
  width: number;
  height: number;
  isFocused: boolean;
  isListOpenProp: boolean;
}

export const BackgroundShellDisplay = ({
  shells,
  activePid,
  width,
  height,
  isFocused,
  isListOpenProp,
}: BackgroundShellDisplayProps) => (
    <BackgroundTaskDisplay
      shells={shells}
      activePid={activePid}
      width={width}
      height={height}
      isFocused={isFocused}
      isListOpenProp={isListOpenProp}
    />
  );
