/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { persistentState } from '../../utils/persistentState.js';
import {
  shouldPromptForTerminalSetup,
  terminalSetup,
  formatTerminalSetupResultMessage,
  TERMINAL_SETUP_CONSENT_MESSAGE,
} from '../utils/terminalSetup.js';
import { requestConsentInteractive } from '../../config/extensions/consent.js';
import type { ConfirmationRequest } from '../types.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';

interface UseTerminalSetupPromptParams {
  /** Function to add a confirmation request to the UI */
  addConfirmUpdateExtensionRequest: (request: ConfirmationRequest) => void;
  /** History manager to display result messages */
  historyManager: UseHistoryManagerReturn;
}

/**
 * Hook that shows a one-time prompt to run /terminal-setup when it would help.
 *
 * The prompt is shown only once per user (tracked via persistentState) and only
 * when shouldPromptForTerminalSetup() returns true (i.e., in a supported terminal
 * without the necessary keybindings configured).
 */
export function useTerminalSetupPrompt({
  addConfirmUpdateExtensionRequest,
  historyManager,
}: UseTerminalSetupPromptParams): void {
  useEffect(() => {
    const hasBeenPrompted = persistentState.get('terminalSetupPromptShown');
    if (hasBeenPrompted) {
      return;
    }

    let cancelled = false;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      const shouldPrompt = await shouldPromptForTerminalSetup();
      if (!shouldPrompt || cancelled) return;

      // Record that we've shown the prompt so it never appears again.
      persistentState.set('terminalSetupPromptShown', true);

      const confirmed = await requestConsentInteractive(
        TERMINAL_SETUP_CONSENT_MESSAGE,
        addConfirmUpdateExtensionRequest,
      );

      if (!confirmed || cancelled) return;

      const result = await terminalSetup();
      if (cancelled) return;

      historyManager.addItem(
        {
          type: result.success ? 'info' : 'error',
          text: formatTerminalSetupResultMessage(result),
        },
        Date.now(),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [addConfirmUpdateExtensionRequest, historyManager]);
}
