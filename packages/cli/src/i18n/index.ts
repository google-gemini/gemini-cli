/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n, { t } from 'i18next';
import { initReactI18next } from 'react-i18next';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic resource loading
async function loadTranslationFile(
  lang: string,
  namespace: string,
): Promise<Record<string, unknown>> {
  try {
    const filePath = path.join(__dirname, 'locales', lang, `${namespace}.json`);
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    // Silently return empty object if translation file not found.
    // This allows graceful fallback to default language.
    return {};
  }
}

// Phase 1: Only English locale, core namespaces
const languages = ['en'];
const namespaces = ['common', 'help', 'dialogs', 'loading'];

// Async resource loading
async function loadResources() {
  const resources: Record<string, Record<string, Record<string, unknown>>> = {};

  for (const lang of languages) {
    resources[lang] = {};
    const loadPromises = namespaces.map(async (ns) => {
      const translation = await loadTranslationFile(lang, ns);
      return { namespace: ns, translation };
    });

    const results = await Promise.all(loadPromises);
    for (const { namespace, translation } of results) {
      resources[lang][namespace] = translation;
    }
  }

  return resources;
}

// Initialize i18next with async resource loading
async function initializeI18n() {
  const resources = await loadResources();

  // eslint-disable-next-line import/no-named-as-default-member
  await i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    ns: namespaces,
    defaultNS: 'common',

    debug: !!process.env['DEBUG'],
  });
}

// Initialize i18n immediately
await initializeI18n();

// Export t function for convenient usage
export { t };

/**
 * Get all informative tips as a flat array (from all tip categories).
 * Tips are used in the loading indicator to help users discover features.
 */
export function getInformativeTips(): string[] {
  const settings = t('loading:tips.settings', {
    returnObjects: true,
  }) as string[];
  const shortcuts = t('loading:tips.shortcuts', {
    returnObjects: true,
  }) as string[];
  const commands = t('loading:tips.commands', {
    returnObjects: true,
  }) as string[];

  return [...settings, ...shortcuts, ...commands];
}

/**
 * Get the interactive shell waiting message.
 */
export function getInteractiveShellWaitingPhrase(): string {
  return t('loading:interactiveShellWaiting');
}

/**
 * Get the waiting for confirmation message.
 */
export function getWaitingForConfirmationPhrase(): string {
  return t('loading:waitingForConfirmation');
}

// eslint-disable-next-line import/no-default-export
export default i18n;
