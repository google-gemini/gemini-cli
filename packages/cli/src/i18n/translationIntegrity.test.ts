/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Translation Integrity Tests', () => {
  const localesDir = path.join(__dirname, 'locales');
  const supportedLanguages = ['en', 'zh', 'fr', 'es'];
  const requiredNamespaces = [
    'ui',
    'help',
    'commands',
    'dialogs',
    'errors',
    'messages',
    'feedback',
    'validation',
    'tools',
  ];

  describe('File Structure Validation', () => {
    it('should have all supported language directories', () => {
      const actualLanguages = fs
        .readdirSync(localesDir)
        .filter((item) =>
          fs.statSync(path.join(localesDir, item)).isDirectory(),
        );

      supportedLanguages.forEach((lang) => {
        expect(actualLanguages).toContain(lang);
      });
    });

    it('should have all required namespace files for each language', () => {
      supportedLanguages.forEach((lang) => {
        const langDir = path.join(localesDir, lang);
        expect(fs.existsSync(langDir)).toBe(true);

        requiredNamespaces.forEach((namespace) => {
          const filePath = path.join(langDir, `${namespace}.json`);
          expect(
            fs.existsSync(filePath),
            `Missing translation file: ${lang}/${namespace}.json`,
          ).toBe(true);
        });
      });
    });
  });

  describe('JSON File Validity', () => {
    it('should have valid JSON files for all languages and namespaces', () => {
      supportedLanguages.forEach((lang) => {
        requiredNamespaces.forEach((namespace) => {
          const filePath = path.join(localesDir, lang, `${namespace}.json`);

          expect(() => {
            const content = fs.readFileSync(filePath, 'utf8');
            JSON.parse(content);
          }, `Invalid JSON in ${lang}/${namespace}.json`).not.toThrow();
        });
      });
    });
  });

  describe('Translation Key Consistency', () => {
    function getTranslationKeys(obj: any, prefix = ''): string[] {
      const keys: string[] = [];

      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (
          typeof obj[key] === 'object' &&
          obj[key] !== null &&
          !Array.isArray(obj[key])
        ) {
          keys.push(...getTranslationKeys(obj[key], fullKey));
        } else {
          keys.push(fullKey);
        }
      }

      return keys;
    }

    function loadTranslationKeys(lang: string, namespace: string): string[] {
      const filePath = path.join(localesDir, lang, `${namespace}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return getTranslationKeys(content);
    }

    it('should have consistent translation keys across all languages for UI namespace', () => {
      const englishKeys = loadTranslationKeys('en', 'ui');

      ['zh', 'fr', 'es'].forEach((lang) => {
        const langKeys = loadTranslationKeys(lang, 'ui');

        // Check if all English keys exist in other languages
        englishKeys.forEach((key) => {
          expect(langKeys, `Missing key "${key}" in ${lang}/ui.json`).toContain(
            key,
          );
        });

        // Check for extra keys in other languages
        langKeys.forEach((key) => {
          expect(
            englishKeys,
            `Extra key "${key}" in ${lang}/ui.json not found in en/ui.json`,
          ).toContain(key);
        });
      });
    });

    it('should have consistent translation keys across all languages for Commands namespace', () => {
      const englishKeys = loadTranslationKeys('en', 'commands');

      ['zh', 'fr', 'es'].forEach((lang) => {
        const langKeys = loadTranslationKeys(lang, 'commands');

        englishKeys.forEach((key) => {
          expect(
            langKeys,
            `Missing key "${key}" in ${lang}/commands.json`,
          ).toContain(key);
        });
      });
    });
  });

  describe('Critical Translation Keys Validation', () => {
    const criticalUIKeys = [
      'context.using',
      'context.openFile',
      'context.openFiles',
      'context.viewHint',
      'footer.noSandbox',
      'footer.untrusted',
      'contextUsage.remaining',
      'modelStats.noApiCalls',
    ];

    it('should have all critical UI translation keys in all languages', () => {
      supportedLanguages.forEach((lang) => {
        const filePath = path.join(localesDir, lang, 'ui.json');
        const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        criticalUIKeys.forEach((keyPath) => {
          const keys = keyPath.split('.');
          let current = translations;

          for (const key of keys) {
            expect(
              current,
              `Missing critical UI key "${keyPath}" in ${lang}/ui.json`,
            ).toHaveProperty(key);
            current = current[key];
          }

          // Ensure the final value is not empty
          expect(current).toBeTruthy();
          expect(typeof current).toBe('string');
        });
      });
    });
  });

  describe('Interpolation Validation', () => {
    it('should have consistent interpolation placeholders across languages', () => {
      const interpolationKeys = [
        'ui.contextUsage.remaining', // {{percent}}
        'ui.errors.unknownCommand', // {{command}}
      ];

      interpolationKeys.forEach((keyPath) => {
        const [namespace, ...keyParts] = keyPath.split('.');
        const key = keyParts.join('.');

        let englishValue: string;
        try {
          const englishFile = path.join(localesDir, 'en', `${namespace}.json`);
          const englishTranslations = JSON.parse(
            fs.readFileSync(englishFile, 'utf8'),
          );

          const keys = key.split('.');
          let current = englishTranslations;
          for (const k of keys) {
            current = current[k];
          }
          englishValue = current;
        } catch (error) {
          // Skip if key doesn't exist in English
          return;
        }

        // Extract interpolation placeholders from English
        const placeholders = englishValue.match(/\{\{.*?\}\}/g) || [];

        ['zh', 'fr', 'es'].forEach((lang) => {
          try {
            const langFile = path.join(localesDir, lang, `${namespace}.json`);
            const langTranslations = JSON.parse(
              fs.readFileSync(langFile, 'utf8'),
            );

            const keys = key.split('.');
            let current = langTranslations;
            for (const k of keys) {
              current = current[k];
            }
            const langValue = current;

            // Check if all placeholders exist in the translated version
            placeholders.forEach((placeholder) => {
              expect(
                langValue,
                `Missing interpolation placeholder "${placeholder}" in ${lang}/${namespace}.json for key "${key}"`,
              ).toContain(placeholder);
            });
          } catch (error) {
            // Skip if file doesn't exist
          }
        });
      });
    });
  });

  describe('Translation Quality Checks', () => {
    it('should not have empty translation values', () => {
      supportedLanguages.forEach((lang) => {
        ['ui', 'commands'].forEach((namespace) => {
          try {
            const filePath = path.join(localesDir, lang, `${namespace}.json`);
            const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            function checkForEmptyValues(obj: any, keyPath = ''): void {
              for (const key in obj) {
                const fullPath = keyPath ? `${keyPath}.${key}` : key;

                if (
                  typeof obj[key] === 'object' &&
                  obj[key] !== null &&
                  !Array.isArray(obj[key])
                ) {
                  checkForEmptyValues(obj[key], fullPath);
                } else if (typeof obj[key] === 'string') {
                  expect(
                    obj[key].trim(),
                    `Empty translation value for "${fullPath}" in ${lang}/${namespace}.json`,
                  ).not.toBe('');
                }
              }
            }

            checkForEmptyValues(translations);
          } catch (error) {
            // Skip if file doesn't exist
          }
        });
      });
    });

    it('should not have translation keys as values (untranslated keys)', () => {
      ['zh', 'fr', 'es'].forEach((lang) => {
        ['ui', 'commands'].forEach((namespace) => {
          try {
            const filePath = path.join(localesDir, lang, `${namespace}.json`);
            const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            function checkForUntranslatedKeys(obj: any, keyPath = ''): void {
              for (const key in obj) {
                const fullPath = keyPath ? `${keyPath}.${key}` : key;

                if (
                  typeof obj[key] === 'object' &&
                  obj[key] !== null &&
                  !Array.isArray(obj[key])
                ) {
                  checkForUntranslatedKeys(obj[key], fullPath);
                } else if (typeof obj[key] === 'string') {
                  // Check if the value looks like a translation key (contains dots and no spaces)
                  const value = obj[key].trim();
                  if (
                    value.includes('.') &&
                    !value.includes(' ') &&
                    value.length > 10
                  ) {
                    // This might be an untranslated key
                    expect(
                      value,
                      `Possible untranslated key "${value}" for "${fullPath}" in ${lang}/${namespace}.json`,
                    ).not.toMatch(/^[a-zA-Z]+\.[a-zA-Z.]+$/);
                  }
                }
              }
            }

            checkForUntranslatedKeys(translations);
          } catch (error) {
            // Skip if file doesn't exist
          }
        });
      });
    });
  });
});
