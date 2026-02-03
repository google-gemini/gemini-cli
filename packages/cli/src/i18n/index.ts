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
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic resource loading
async function loadTranslationFile(
  lang: string,
  namespace: string,
): Promise<Record<string, unknown>> {
  const filePath = path.join(__dirname, 'locales', lang, `${namespace}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    // Silently fail if file doesn't exist - i18next handles missing keys
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'ENOENT'
    ) {
      return {};
    }
    // For other errors (like JSON parsing), fail loudly to aid debugging
    throw new Error(`Failed to load or parse translation file: ${filePath}`, {
      cause: error,
    });
  }
}

const namespaces = [
  'common',
  'help',
  'dialogs',
  'loading',
  'commands',
  'ui',
  'messages',
  'privacy',
  'auth',
];
const localesDir = path.join(__dirname, 'locales');

interface LocaleManifest {
  displayName: string;
}

/**
 * Read a locale's manifest.json to get its self-reported display name.
 * Returns null if the manifest is missing or unreadable.
 */
function readLocaleManifest(langDir: string): LocaleManifest | null {
  try {
    const manifestPath = path.join(langDir, 'manifest.json');
    const content = fsSync.readFileSync(manifestPath, 'utf8');
    return JSON.parse(content) as LocaleManifest;
  } catch {
    return null;
  }
}

/**
 * Synchronously scan the locales directory to find available language packs.
 * Each locale folder must contain a manifest.json with a displayName field.
 * This runs at module load time so the schema can access the options.
 */
function detectAvailableLanguagesSync(): {
  codes: string[];
  labels: Map<string, string>;
} {
  const labels = new Map<string, string>();
  try {
    const entries = fsSync.readdirSync(localesDir, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('.')); // Exclude hidden directories

    for (const dir of dirs) {
      const manifest = readLocaleManifest(path.join(localesDir, dir));
      if (manifest?.displayName) {
        labels.set(dir, manifest.displayName);
      } else {
        // Locale folder without manifest — use the folder name as-is
        labels.set(dir, dir.toUpperCase());
      }
    }

    // Ensure 'en' is always first (default/fallback language)
    const codes = [...labels.keys()];
    if (codes.includes('en')) {
      const sorted = ['en', ...codes.filter((l) => l !== 'en').sort()];
      return { codes: sorted, labels };
    }
    return { codes: codes.length > 0 ? codes.sort() : ['en'], labels };
  } catch (error) {
    // If we can't read the directory, fall back to English only
    // Log a warning in debug mode for easier debugging, but don't crash
    if (process.env['DEBUG']) {
      // eslint-disable-next-line no-console
      console.warn(
        `Could not detect available languages in ${localesDir}:`,
        error,
      );
    }
    labels.set('en', 'English');
    return { codes: ['en'], labels };
  }
}

// Detect available languages synchronously at module load
const { codes: availableLanguages, labels: languageLabels } =
  detectAvailableLanguagesSync();

// Cache language options at module load to prevent re-creation on each access
// This prevents React flickering from new object references
const cachedLanguageOptions: ReadonlyArray<{ value: string; label: string }> =
  Object.freeze([
    { value: 'auto', label: 'Auto' },
    ...availableLanguages.map((lang) => ({
      value: lang,
      label: languageLabels.get(lang) ?? lang.toUpperCase(),
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
 * Read the saved language preference directly from ~/.gemini/settings.json.
 * This avoids a circular dependency: the settings schema imports from this
 * module (for getLanguageOptions()), so we cannot import the settings module
 * here. Instead we read the raw JSON file at a known path.
 */
function getSavedLanguagePreference(): string | null {
  try {
    const homeDir =
      process.env['HOME'] ?? process.env['USERPROFILE'] ?? os.homedir();
    const settingsPath = path.join(homeDir, '.gemini', 'settings.json');
    const content = fsSync.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(content) as Record<string, unknown>;
    const experimental = settings['experimental'] as
      | Record<string, unknown>
      | undefined;
    const lang = experimental?.['language'];
    if (typeof lang === 'string' && lang !== 'auto') {
      return lang;
    }
  } catch {
    // Settings file may not exist or be unreadable — that's fine
  }
  return null;
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

  // 2. Check saved language preference from ~/.gemini/settings.json
  const fromSettings = getSavedLanguagePreference();
  if (fromSettings && availableLanguages.includes(fromSettings)) {
    return fromSettings;
  }

  // 3. Check LANG environment variable (Unix-style locale)
  const fromLangEnv = checkLang(process.env['LANG']);
  if (fromLangEnv) return fromLangEnv;

  // 4. Check Intl API (browser/Node.js locale detection)
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    const fromIntl = checkLang(intlLocale);
    if (fromIntl) return fromIntl;
  } catch {
    // Intl may not be available in some environments
  }

  // 5. Fallback to English
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

// eslint-disable-next-line import/no-default-export
export default i18n;
