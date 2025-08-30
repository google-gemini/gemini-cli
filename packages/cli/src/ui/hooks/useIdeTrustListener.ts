/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import type { Config } from '@google/gemini-cli-core';
import { ideContext } from '@google/gemini-cli-core';

/**
 * This hook listens for trust status updates from the IDE companion extension.
 * It provides the current trust status from the IDE and a flag indicating
 * if a restart is needed because the trust state has changed.
 */
export function useIdeTrustListener(config: Config) {
  const [isIdeTrusted, setIsIdeTrusted] = useState<boolean | undefined>(
    undefined,
  );
  const [needsRestart, setNeedsRestart] = useState(false);
  const initialCheckPerformed = useRef(false);

  useEffect(() => {
    const ideClient = config.getIdeClient();

    const handleTrustChange = (newTrustValue: boolean) => {
      setIsIdeTrusted((prevTrustValue) => {
        // Only trigger a restart if a previous value existed and it changed.
        if (prevTrustValue !== undefined && prevTrustValue !== newTrustValue) {
          setNeedsRestart(true);
        }
        return newTrustValue;
      });
    };

    if (!initialCheckPerformed.current) {
      const initialContext = ideContext.getIdeContext();
      if (initialContext?.workspaceState?.isTrusted !== undefined) {
        // Set the very first value without triggering a restart check.
        setIsIdeTrusted(initialContext.workspaceState.isTrusted);
      }
      initialCheckPerformed.current = true;
    }

    ideClient.addTrustChangeListener(handleTrustChange);

    return () => {
      ideClient.removeTrustChangeListener(handleTrustChange);
    };
  }, [config]);

  return { isIdeTrusted, needsRestart };
}
