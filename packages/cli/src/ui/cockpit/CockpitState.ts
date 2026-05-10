/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

let cockpitVisible = false;
const listeners = new Set<() => void>();

function notifyCockpitListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getCockpitVisible(): boolean {
  return cockpitVisible;
}

export function setCockpitVisible(visible: boolean): void {
  if (cockpitVisible === visible) {
    return;
  }

  cockpitVisible = visible;
  notifyCockpitListeners();
}

export function toggleCockpit(): boolean {
  setCockpitVisible(!cockpitVisible);
  return cockpitVisible;
}

export function useCockpitVisible(): boolean {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => {
      setVersion((version) => version + 1);
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return cockpitVisible;
}
