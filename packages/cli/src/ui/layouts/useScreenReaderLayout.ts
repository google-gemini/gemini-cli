/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useIsScreenReaderEnabled } from 'ink';

export interface LayoutConfig {
  shouldUseStatic: boolean;
  shouldShowFooterInComposer: boolean;
  mode: 'default' | 'screenReader';
}

export const useScreenReaderLayout = (): LayoutConfig => {
  const isScreenReader = useIsScreenReaderEnabled();
  
  return {
    shouldUseStatic: !isScreenReader,
    shouldShowFooterInComposer: !isScreenReader,
    mode: isScreenReader ? 'screenReader' : 'default',
  };
};