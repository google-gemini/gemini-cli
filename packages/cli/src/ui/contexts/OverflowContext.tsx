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

  const addOverflowingId = useCallback((id: string) => {
    setOverflowingIds((prevIds) => {
      if (prevIds.has(id)) {
        return prevIds;
      }
      const newIds = new Set(prevIds);
      newIds.add(id);
      return newIds;
    });
  }, []);

  const removeOverflowingId = useCallback((id: string) => {
    setOverflowingIds((prevIds) => {
      if (!prevIds.has(id)) {
        return prevIds;
      }
      const newIds = new Set(prevIds);
      newIds.delete(id);
      return newIds;
    });
  }, []);

  const reset = useCallback(() => {
    setOverflowingIds(new Set());
  }, []);

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
