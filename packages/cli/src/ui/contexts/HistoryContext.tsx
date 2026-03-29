/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type { HistoryItem } from '../types.js';
import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';

export interface HistoryContextValue {
  history: HistoryItem[];
  historyManager: UseHistoryManagerReturn;
  historyRemountKey: number;
}

export const HistoryContext = createContext<HistoryContextValue | null>(null);

export const useHistory = () => {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
};
