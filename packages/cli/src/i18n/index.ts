/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n, { t } from 'i18next';
import { initReactI18next } from 'react-i18next';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
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

const namespaces = ['common', 'help', 'dialogs', 'loading'];
const localesDir = path.join(__dirname, 'locales');

// Language display names for settings UI
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ja: '日本語',
  // Add more language labels here as locales are added
};

/**
 * Synchronously scan the locales directory to find available language packs.
 * This runs at module load time so the schema can access the options.
 */
function detectAvailableLanguagesSync(): string[] {
  try {
    const entries = fsSync.readdirSync(localesDir, { withFileTypes: true });
    const langs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('.')); // Exclude hidden directories

    // Ensure 'en' is always first (default/fallback language)
    if (langs.includes('en')) {
      return ['en', ...langs.filter((l) => l !== 'en')];
    }
    return langs.length > 0 ? langs : ['en'];
  } catch {
    // If we can't read the directory, fall back to English only
    return ['en'];
  }
}

// Detect available languages synchronously at module load
const availableLanguages: string[] = detectAvailableLanguagesSync();

// Cache language options at module load to prevent re-creation on each access
// This prevents React flickering from new object references
const cachedLanguageOptions: ReadonlyArray<{ value: string; label: string }> =
  Object.freeze([
    { value: 'auto', label: 'Auto' },
    ...availableLanguages.map((lang) => ({
      value: lang,
      label: LANGUAGE_LABELS[lang] ?? lang.toUpperCase(),
    })),
  ]);

/**
 * Get the list of available languages (detected from locale folders).
 */
export function getAvailableLanguages(): readonly string[] {
  return availableLanguages;
}

/**
 * Check if a language code is available (has a locale pack).
 */
export function isLanguageAvailable(lang: string): boolean {
  return availableLanguages.includes(lang);
}

/**
 * Get language options formatted for the settings schema.
 * Returns a cached, frozen array to prevent React re-render flickering.
 */
export function getLanguageOptions(): ReadonlyArray<{
  value: string;
  label: string;
}> {
  return cachedLanguageOptions;
}

/**
 * Detect the system language from environment variables or Intl API.
 * Priority: GEMINI_LANG > LANG > Intl > 'en' (fallback)
 * Only returns languages that have available locale packs.
 */
function getSystemLanguage(): string {
  const checkLang = (locale: string | undefined): string | null => {
    if (!locale) return null;
    const lang = locale.split(/[-_]/)[0]?.toLowerCase();
    return lang && availableLanguages.includes(lang) ? lang : null;
  };

  // 1. Check GEMINI_LANG environment variable (explicit override)
  const fromGeminiLang = checkLang(process.env['GEMINI_LANG']);
  if (fromGeminiLang) return fromGeminiLang;

  // 2. Check LANG environment variable (Unix-style locale)
  const fromLangEnv = checkLang(process.env['LANG']);
  if (fromLangEnv) return fromLangEnv;

  // 3. Check Intl API (browser/Node.js locale detection)
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    const fromIntl = checkLang(intlLocale);
    if (fromIntl) return fromIntl;
  } catch {
    // Intl may not be available in some environments
  }

  // 4. Fallback to English
  return 'en';
}

// Async resource loading - only loads for available languages
async function loadResources(languages: string[]) {
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
  // Load resources only for available languages (detected at module load)
  const resources = await loadResources(availableLanguages);

  // Determine the language to use (auto-detect or fallback)
  const detectedLanguage = getSystemLanguage();

  // eslint-disable-next-line import/no-named-as-default-member
  await i18n.use(initReactI18next).init({
    resources,
    lng: detectedLanguage,
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
