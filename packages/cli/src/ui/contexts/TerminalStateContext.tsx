/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, type RefObject } from 'react';
import { type DOMElement } from 'ink';

export interface TerminalStateContextValue {
  terminalWidth: number;
  terminalHeight: number;
  mainAreaWidth: number;
  isAlternateBuffer: boolean;
  constrainHeight: boolean;
  embeddedShellFocused: boolean;
  rootUiRef: RefObject<DOMElement>;
  mainControlsRef: RefObject<DOMElement>;
  stableControlsHeight: number;
}

export const TerminalStateContext = createContext<
  TerminalStateContextValue | undefined
>(undefined);

export const useTerminalState = (): TerminalStateContextValue => {
  const context = useContext(TerminalStateContext);
  if (context === undefined) {
    throw new Error(
      'useTerminalState must be used within a TerminalStateProvider',
    );
  }
  return context;
};
