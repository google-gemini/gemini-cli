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
  allowStaticToggle?: boolean;
}

export interface LayoutConfigOptions {
  forceStaticMode?: boolean;
  allowToggle?: boolean;
}

export const useLayoutConfig = (
  options?: LayoutConfigOptions,
): LayoutConfig => {
  const isScreenReader = useIsScreenReaderEnabled();

  // Allow overriding static behavior when toggle is enabled
  const shouldUseStatic =
    options?.forceStaticMode !== undefined
      ? options.forceStaticMode
      : !isScreenReader;

  return {
    shouldUseStatic,
    shouldShowFooterInComposer: !isScreenReader,
    mode: isScreenReader ? 'screenReader' : 'default',
    allowStaticToggle: options?.allowToggle ?? false,
  };
};
