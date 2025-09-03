/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from '../../i18n/index.js';

/**
 * Get internationalized command description - consistent with UI component pattern
 * This function mimics the t() function used in UI components but works outside React context
 */
export function getCommandDescription(
  commandName: string,
  originalDescription: string,
  parentCommand?: string,
): string {
  try {
    // Use same pattern as UI components: t('descriptions.commandName', { ns: 'commands' })
    let translationKey: string;

    if (parentCommand) {
      // For subcommands, try parent.child format first
      translationKey = `${parentCommand}.${commandName}`;
    } else {
      // For main commands, use descriptions.commandName (same as UI pattern)
      translationKey = `descriptions.${commandName}`;
    }

    // Call i18n.t() directly - same as what t() does in UI components
    const translatedDesc = i18n.t(translationKey, { ns: 'commands' });

    // Check if translation exists (same validation as UI components)
    if (
      translatedDesc &&
      translatedDesc !== translationKey &&
      translatedDesc !== `commands:${translationKey}`
    ) {
      return translatedDesc;
    }

    // Fallback for subcommands
    if (parentCommand) {
      const fallbackKey = `descriptions.${commandName}`;
      const fallbackDesc = i18n.t(fallbackKey, { ns: 'commands' });
      if (
        fallbackDesc &&
        fallbackDesc !== fallbackKey &&
        fallbackDesc !== `commands:${fallbackKey}`
      ) {
        return fallbackDesc;
      }
    }
  } catch (error) {
    // Graceful fallback on translation errors
  }

  // Fallback to original English description
  return originalDescription;
}
