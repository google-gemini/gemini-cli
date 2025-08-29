/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Get initial language from environment variable or default to 'en'
const getInitialLanguage = (): string => {
  const envLang = process.env['GEMINI_LANG'];
  if (envLang && languages.includes(envLang)) {
    return envLang;
  }
  return 'en';
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
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
  ],
  defaultNS: 'help',

  debug: !!process.env['DEBUG'],
});

// Export i18n instance for potential core package integration
// This addresses bot feedback about error translation initialization
export { i18n as errorTranslator };

export default i18n;
