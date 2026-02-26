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

export function useTips(): UseTipsResult {
  const [hideTipsCount] = useState(
    () => persistentState.get('hideTipsShown') ?? 0,
  );

  const showTips = hideTipsCount < 10;

  useEffect(() => {
    if (showTips) {
      persistentState.set('hideTipsShown', hideTipsCount + 1);
    }
  }, [hideTipsCount, showTips]);

  return { showTips };
}
