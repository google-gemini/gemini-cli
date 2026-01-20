/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { persistentState } from '../../utils/persistentState.js';

export function useTips() {
  const [tipsCount] = useState(() => persistentState.get('tipsShown') ?? 0);

  const tipsHidden = tipsCount >= 10;

  useEffect(() => {
    if (!tipsHidden) {
      persistentState.set('tipsShown', tipsCount + 1);
    }
  }, [tipsCount, tipsHidden]);

  return tipsHidden;
}
