/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { inTmux } from '../utils/commandUtils.js';

export function useTerminalEnvironment() {
  return useMemo(
    () => ({
      isTmux: inTmux(),
    }),
    [],
  );
}
