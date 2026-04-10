/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';

export interface OverflowState {
  overflowingIds: ReadonlySet<string>;
}

export interface OverflowActions {
  addOverflowingId: (id: string) => void;
  removeOverflowingId: (id: string) => void;
  reset: () => void;
}

const OverflowStateContext = createContext<OverflowState | undefined>(
  undefined,
);

const OverflowActionsContext = createContext<OverflowActions | undefined>(
  undefined,
);

export const useOverflowState = (): OverflowState | undefined =>
  useContext(OverflowStateContext);

export const useOverflowActions = (): OverflowActions | undefined =>
  useContext(OverflowActionsContext);

export const OverflowProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [overflowingIds, setOverflowingIds] = useState(new Set<string>());

  /**
   * We use a ref to track the current set of overflowing IDs and a timeout to
   * batch updates to the next tick. This prevents infinite render loops (layout
   * oscillation) where showing an overflow hint causes a layout shift that
   * hides the hint, which then restores the layout and shows the hint again.
   */
  const idsRef = useRef(new Set<string>());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const syncState = useCallback(() => {
    if (timeoutRef.current) return;

    // Use a microtask to batch updates and break synchronous recursive loops.
    // This prevents "Maximum update depth exceeded" errors during layout shifts.
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setOverflowingIds((prevIds) => {
        // Optimization: only update state if the set has actually changed
        if (
          prevIds.size === idsRef.current.size &&
          [...prevIds].every((id) => idsRef.current.has(id))
        ) {
          return prevIds;
        }
        return new Set(idsRef.current);
      });
    }, 0);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const addOverflowingId = useCallback(
    (id: string) => {
      if (!idsRef.current.has(id)) {
        idsRef.current.add(id);
        syncState();
      }
    },
    [syncState],
  );

  const removeOverflowingId = useCallback(
    (id: string) => {
      if (idsRef.current.has(id)) {
        idsRef.current.delete(id);
        syncState();
      }
    },
    [syncState],
  );

  const reset = useCallback(() => {
    if (idsRef.current.size > 0) {
      idsRef.current.clear();
      syncState();
    }
  }, [syncState]);

  const stateValue = useMemo(
    () => ({
      overflowingIds,
    }),
    [overflowingIds],
  );

  const actionsValue = useMemo(
    () => ({
      addOverflowingId,
      removeOverflowingId,
      reset,
    }),
    [addOverflowingId, removeOverflowingId, reset],
  );

  return (
    <OverflowStateContext.Provider value={stateValue}>
      <OverflowActionsContext.Provider value={actionsValue}>
        {children}
      </OverflowActionsContext.Provider>
    </OverflowStateContext.Provider>
  );
};
