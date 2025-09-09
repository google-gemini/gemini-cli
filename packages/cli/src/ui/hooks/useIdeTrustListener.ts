/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { IdeClient, ideContext } from '@google/gemini-cli-core';

/**
 * This hook listens for trust status updates from the IDE companion extension.
 * It provides the current trust status from the IDE and a flag indicating
 * if a restart is needed because the trust state has changed.
 */
export function useIdeTrustListener() {
  const subscribe = useCallback((onStoreChange: () => void) => {
    (async () => {
      const ideClient = await IdeClient.getInstance();
      ideClient.addTrustChangeListener(onStoreChange);
    })();
    return () => {
      (async () => {
        const ideClient = await IdeClient.getInstance();
        ideClient.removeTrustChangeListener(onStoreChange);
      })();
    };
  }, []);

  const getSnapshot = () =>
    ideContext.getIdeContext()?.workspaceState?.isTrusted;

  const isIdeTrusted = useSyncExternalStore(subscribe, getSnapshot);

  const [needsRestart, setNeedsRestart] = useState(false);
  const [initialTrustValue] = useState(isIdeTrusted);

  useEffect(() => {
    if (
      !needsRestart &&
      initialTrustValue !== undefined &&
      initialTrustValue !== isIdeTrusted
    ) {
      setNeedsRestart(true);
    }
  }, [isIdeTrusted, initialTrustValue, needsRestart]);

  return { isIdeTrusted, needsRestart };
}
