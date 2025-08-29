/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation as useI18nTranslation } from 'react-i18next';

export const useTranslation = (namespace = 'help') =>
  useI18nTranslation(namespace);

// Language switching utility
export const switchLanguage = (lng: string) => {
  // This will be implemented to switch languages
  // For PoC, we'll add a simple mechanism
  if (typeof window !== 'undefined') {
    // In a browser environment
    localStorage.setItem('gemini-cli-language', lng);
  }
  // Note: In a CLI environment, we might use a config file or environment variable
};
