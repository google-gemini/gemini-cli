/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import { HistoryItem } from '../types.js';

export interface UIContextValue {
  openHelp: () => void;
  openAuthDialog: () => void;
  openThemeDialog: () => void;
  openEditorDialog: () => void;
  openPrivacyNotice: () => void;
  toggleCorgiMode: () => void;
  setDebugMessage: (message: string) => void;
  quit: (messages: HistoryItem[]) => void;
}

export const UIContext = createContext<UIContextValue | null>(null);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
