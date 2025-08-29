/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation as useI18nTranslation } from 'react-i18next';
import i18n from './index.js';

export const useTranslation = (namespace = 'help') =>
  useI18nTranslation(namespace);

// Language switching utility for CLI environment
export const switchLanguage = async (lng: string): Promise<boolean> => {
  try {
    await i18n.changeLanguage(lng);
    return true;
  } catch (error) {
    console.error('Failed to switch language:', error);
    return false;
  }
};
