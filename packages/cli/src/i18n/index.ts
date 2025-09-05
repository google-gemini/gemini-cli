/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n, { changeLanguage, t } from 'i18next';
import { initReactI18next } from 'react-i18next';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setErrorTranslator } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic resource loading
function loadTranslationFile(
  lang: string,
  namespace: string,
): Record<string, unknown> {
  try {
    const filePath = path.join(__dirname, 'locales', lang, `${namespace}.json`);
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    console.warn(
      `Failed to load translation file for ${lang}/${namespace}:`,
      error,
    );
    return {};
  }
}

// Build resources dynamically
const languages = ['en', 'zh', 'fr', 'es'];
const namespaces = [
  'help',
  'commands',
  'dialogs',
  'ui',
  'errors',
  'messages',
  'feedback',
  'validation',
  'tools',
  'settings',
];

const resources = languages.reduce(
  (acc, lang) => {
    acc[lang] = namespaces.reduce(
      (nsAcc, ns) => {
        nsAcc[ns] = loadTranslationFile(lang, ns);
        return nsAcc;
      },
      {} as Record<string, Record<string, unknown>>,
    );
    return acc;
  },
  {} as Record<string, Record<string, Record<string, unknown>>>,
);

// Initialize with default language, will be updated by initializeI18nWithSettings

// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources,
  lng: 'en', // Default to English, will be updated by main() function
  fallbackLng: 'en',

  interpolation: {
    escapeValue: false, // React already escapes values
  },

  ns: [
    'help',
    'commands',
    'dialogs',
    'ui',
    'errors',
    'messages',
    'feedback',
    'validation',
    'tools',
    'settings',
  ],
  defaultNS: 'help',

  debug: !!process.env['DEBUG'],
});

// Export i18n instance for potential core package integration
// This addresses bot feedback about error translation initialization
export { i18n as errorTranslator };

/**
 * Detect language from environment variables
 * Supports standard Unix LANG/LC_ALL environment variables
 */
export const detectLanguageFromEnv = (): string | null => {
  // Check standard Unix environment variables
  const systemLocale = process.env['LANG'] || process.env['LC_ALL'] || '';
  if (systemLocale) {
    // Extract language code from locale format (e.g., zh_CN.UTF-8 → zh)
    const langCode = systemLocale.split('.')[0].split('_')[0];
    
    // Handle special cases
    if (langCode === 'C' || langCode === 'POSIX') {
      return 'en'; // C locale defaults to English
    }
    
    // Return if supported language
    if (languages.includes(langCode)) {
      return langCode;
    }
  }

  return null; // No valid language detected from environment
};

/**
 * Initialize i18n language using official settings system with environment variable support
 * This should be called from main() after settings are loaded
 * 
 * Priority order:
 * 1. Settings file (highest)
 * 2. LANG/LC_ALL environment variables
 * 3. Default 'en' (lowest)
 */
export const initializeI18nWithSettings = (settings: LoadedSettings): void => {
  try {
    let selectedLanguage = 'en'; // Default fallback

    // 1. Check settings file first (highest priority)
    const settingsLang = settings.merged.language;
    if (
      settingsLang &&
      typeof settingsLang === 'string' &&
      settingsLang !== '__ENV__' && // __ENV__ means use environment variables
      languages.includes(settingsLang)
    ) {
      selectedLanguage = settingsLang;
    } else {
      // 2. If no explicit language setting or __ENV__, check environment variables
      const envLang = detectLanguageFromEnv();
      if (envLang) {
        selectedLanguage = envLang;
      }
    }

    // Apply the selected language
    changeLanguage(selectedLanguage);
    
    // Debug log for language detection
    if (process.env['DEBUG']) {
      console.debug(`[i18n] Language initialized: ${selectedLanguage}`);
      console.debug(`[i18n] Settings language: ${settingsLang || 'none'}`);
      console.debug(`[i18n] LANG: ${process.env['LANG'] || 'none'}`);
      console.debug(`[i18n] LC_ALL: ${process.env['LC_ALL'] || 'none'}`);
    }
  } catch (error) {
    console.debug('[i18n] Failed to initialize language:', error);
    // Ensure we fall back to English on any error
    changeLanguage('en');
  }

  // Register error translator for core package
  setErrorTranslator(
    (
      key: string,
      fallback: string,
      params?: Record<string, string | number>,
    ) => {
      try {
        return t(key, { ...params, defaultValue: fallback });
      } catch {
        return fallback;
      }
    },
  );
};

/**
 * @deprecated Use initializeI18nWithSettings instead
 * This function is kept for compatibility but should not be used in new code
 */
export const initializeLanguageFromSettings = async (
  workspaceRoot?: string,
): Promise<void> => {
  try {
    const { loadSettings } = await import('../config/settings.js');
    const settings = loadSettings(workspaceRoot || process.cwd());
    initializeI18nWithSettings(settings);
  } catch (error) {
    console.debug('Failed to load language from settings:', error);
  }
};

export { languages };

// Export t function for convenient usage
export { t };

// eslint-disable-next-line import/no-default-export
export default i18n;
