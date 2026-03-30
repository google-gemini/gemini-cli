/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { persistentState } from '../../utils/persistentState.js';

interface UseTipsResult {
  showTips: boolean;
}

interface UseTipsOptions {
  isVisible?: boolean;
}

export function useTips(options: UseTipsOptions = {}): UseTipsResult {
  const { isVisible = true } = options;
  const [tipsCount] = useState(() => persistentState.get('tipsShown') ?? 0);

  const showTips = tipsCount < 10;

  useEffect(() => {
    if (showTips && isVisible) {
      persistentState.set('tipsShown', tipsCount + 1);
    }
  }, [tipsCount, showTips, isVisible]);

  return { showTips };
}
