/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from '../../i18n/index.js';

/**
 * Get internationalized command description with fallback to original description
 */
export function getCommandDescription(commandName: string, originalDescription: string, parentCommand?: string): string {
  try {
    // Try to get translation from commands namespace
    let translationKey: string;
    
    if (parentCommand) {
      // For subcommands, try parent.child format first
      translationKey = `${parentCommand}.${commandName}`;
    } else {
      // For main commands, use descriptions.commandName
      translationKey = `descriptions.${commandName}`;
    }
    
    const translatedDesc = i18n.t(translationKey, { ns: 'commands' });
    
    // If translation exists and is not the key itself, use it
    if (translatedDesc && 
        translatedDesc !== translationKey && 
        translatedDesc !== `commands:${translationKey}`) {
      return translatedDesc;
    }
    
    // If parent command failed, try without parent
    if (parentCommand) {
      const fallbackKey = `descriptions.${commandName}`;
      const fallbackDesc = i18n.t(fallbackKey, { ns: 'commands' });
      if (fallbackDesc && 
          fallbackDesc !== fallbackKey && 
          fallbackDesc !== `commands:${fallbackKey}`) {
        return fallbackDesc;
      }
    }
  } catch (error) {
    // Ignore translation errors and fall back
  }
  
  // Fallback to original description
  return originalDescription;
}