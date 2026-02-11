/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { type Config } from '@google/gemini-cli-core';
import { type Settings } from '../../config/settings.js';

export function useSessionRetentionCheck(config: Config, settings: Settings) {
  const [shouldShowWarning, setShouldShowWarning] = useState(false);
  const [checkComplete, setCheckComplete] = useState(false);

  useEffect(() => {
    // If warning already acknowledged, skip check
    if (settings.general?.sessionRetention?.warningAcknowledged) {
      setShouldShowWarning(false);
      setCheckComplete(true);
      return;
    }

    // If user has manually enabled retention, we skip the warning
    if (
      settings.general?.sessionRetention?.enabled &&
      settings.general?.sessionRetention?.maxAge !== '60d'
    ) {
      setShouldShowWarning(false);
      setCheckComplete(true);
      return;
    }

    setShouldShowWarning(true);
    setCheckComplete(true);
  }, [settings.general?.sessionRetention]);

  return { shouldShowWarning, checkComplete };
}
