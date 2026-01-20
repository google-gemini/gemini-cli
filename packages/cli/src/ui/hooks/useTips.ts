/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { persistentState } from '../../utils/persistentState.js';

export function useTips() {
  const [tipsShown] = useState(() => !!persistentState.get('tipsShown'));

  useEffect(() => {
    if (!tipsShown) {
      persistentState.set('tipsShown', true);
    }
  }, [tipsShown]);

  return tipsShown;
}
