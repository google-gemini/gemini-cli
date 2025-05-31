/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useInput } from 'ink';
import type { Config } from '@gemini-code/core';

export interface UseAutoAcceptIndicatorArgs {
  config: Config;
}

export function useAutoAcceptIndicator({
  config,
}: UseAutoAcceptIndicatorArgs): boolean {
  const currentConfigValue = config.getAlwaysSkipModificationConfirmation();
  const [showAutoAcceptIndicator, setShowAutoAcceptIndicator] =
    useState(currentConfigValue);

  useEffect(() => {
    setShowAutoAcceptIndicator(currentConfigValue);
  }, [currentConfigValue]);

  useInput((_input, key) => {
    if (key.tab && key.shift) {
      const alwaysAcceptModificationConfirmations =
        !config.getAlwaysSkipModificationConfirmation();
      config.setAlwaysSkipModificationConfirmation(
        alwaysAcceptModificationConfirmations,
      );
      // Update local state immediately for responsiveness
      setShowAutoAcceptIndicator(alwaysAcceptModificationConfirmations);
    }
  });

  return showAutoAcceptIndicator;
}
