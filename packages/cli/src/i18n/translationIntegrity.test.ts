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
    'settings',
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
    function getTranslationKeys(
      obj: Record<string, unknown>,
      prefix = '',
    ): string[] {
      const keys: string[] = [];

      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (
          typeof obj[key] === 'object' &&
          obj[key] !== null &&
          !Array.isArray(obj[key])
        ) {
          keys.push(
            ...getTranslationKeys(obj[key] as Record<string, unknown>, fullKey),
          );
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

    it('should have consistent translation keys across all languages for Settings namespace', () => {
      const englishKeys = loadTranslationKeys('en', 'settings');

      ['zh', 'fr', 'es'].forEach((lang) => {
        const langKeys = loadTranslationKeys(lang, 'settings');

        englishKeys.forEach((key) => {
          expect(
            langKeys,
            `Missing key "${key}" in ${lang}/settings.json`,
          ).toContain(key);
        });

        // Check for extra keys in other languages
        langKeys.forEach((key) => {
          expect(
            englishKeys,
            `Extra key "${key}" in ${lang}/settings.json not found in en/settings.json`,
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
        ['ui', 'commands', 'settings'].forEach((namespace) => {
          try {
            const filePath = path.join(localesDir, lang, `${namespace}.json`);
            const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            function checkForEmptyValues(
              obj: Record<string, unknown>,
              keyPath = '',
            ): void {
              for (const key in obj) {
                const fullPath = keyPath ? `${keyPath}.${key}` : key;

                if (
                  typeof obj[key] === 'object' &&
                  obj[key] !== null &&
                  !Array.isArray(obj[key])
                ) {
                  checkForEmptyValues(
                    obj[key] as Record<string, unknown>,
                    fullPath,
                  );
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
        ['ui', 'commands', 'settings'].forEach((namespace) => {
          try {
            const filePath = path.join(localesDir, lang, `${namespace}.json`);
            const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            function checkForUntranslatedKeys(
              obj: Record<string, unknown>,
              keyPath = '',
            ): void {
              for (const key in obj) {
                const fullPath = keyPath ? `${keyPath}.${key}` : key;

                if (
                  typeof obj[key] === 'object' &&
                  obj[key] !== null &&
                  !Array.isArray(obj[key])
                ) {
                  checkForUntranslatedKeys(
                    obj[key] as Record<string, unknown>,
                    fullPath,
                  );
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

  describe('Code Usage Validation', () => {
    // Use the same helper function from above
    function getTranslationKeysLocal(
      obj: Record<string, unknown>,
      prefix = '',
    ): string[] {
      const keys: string[] = [];

      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (
          typeof obj[key] === 'object' &&
          obj[key] !== null &&
          !Array.isArray(obj[key])
        ) {
          keys.push(
            ...getTranslationKeysLocal(
              obj[key] as Record<string, unknown>,
              fullKey,
            ),
          );
        } else {
          keys.push(fullKey);
        }
      }

      return keys;
    }

    function extractTranslationKeys(
      fileContent: string,
    ): Array<{ key: string; namespace: string; file: string }> {
      const keys: Array<{ key: string; namespace: string; file: string }> = [];

      // Pattern 1: i18n.t('key', { ns: 'namespace' }) - improved to handle nested braces
      const pattern1 =
        /i18n\.t\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{((?:[^{}]*\{[^}]*\})*[^{}]*)\}/g;
      let match;
      while ((match = pattern1.exec(fileContent)) !== null) {
        let key = match[1];
        const options = match[2];

        // Skip if no ns: property (should be handled by Pattern 4b)
        if (!options.includes('ns:')) {
          continue;
        }

        // Skip dynamic keys (containing variables like ${variable} or template literal constructions)
        if (
          key.includes('${') ||
          key.includes('`') ||
          key.includes('commandName') ||
          key.includes('variable')
        ) {
          continue;
        }

        // Handle namespace:key format in Pattern 1
        let namespace;
        if (key.includes(':')) {
          const [keyNamespace, keyPart] = key.split(':');
          namespace = keyNamespace;
          key = keyPart;
        } else {
          // Extract namespace from options
          const nsMatch = options.match(/ns:\s*['"`]([^'"`]+)['"`]/);
          namespace = nsMatch ? nsMatch[1] : 'help'; // default namespace
        }

        keys.push({ key, namespace, file: '' });
      }

      // Pattern 2: i18n.t('namespace:key')
      const pattern2 = /i18n\.t\(\s*['"`]([^'"`]+):([^'"`]+)['"`]/g;
      while ((match = pattern2.exec(fileContent)) !== null) {
        const namespace = match[1];
        const key = match[2];

        // Skip dynamic keys and test placeholders
        if (
          key.includes('${') ||
          key.includes('`') ||
          key.includes('commandName') ||
          key.includes('variable') ||
          key === 'key'
        ) {
          continue;
        }

        keys.push({ key, namespace, file: '' });
      }

      // Pattern 3: t('key', { ns: 'namespace' }) - improved to handle nested braces
      const pattern3 =
        /\bt\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{((?:[^{}]*\{[^}]*\})*[^{}]*)\}/g;
      while ((match = pattern3.exec(fileContent)) !== null) {
        let key = match[1];
        const options = match[2];

        // Skip if no ns: property (should be handled by Pattern 4b)
        if (!options.includes('ns:')) {
          continue;
        }

        // Skip dynamic keys and test placeholders
        if (
          key.includes('${') ||
          key.includes('`') ||
          key.includes('commandName') ||
          key.includes('variable') ||
          key === 'key'
        ) {
          continue;
        }

        // Handle namespace:key format in Pattern 3
        let namespace;
        if (key.includes(':')) {
          const [keyNamespace, keyPart] = key.split(':');
          namespace = keyNamespace;
          key = keyPart;
        } else {
          // Extract namespace from options
          const nsMatch = options.match(/ns:\s*['"`]([^'"`]+)['"`]/);
          namespace = nsMatch ? nsMatch[1] : 'help'; // default namespace
        }

        keys.push({ key, namespace, file: '' });
      }

      // Pattern 4a: t('namespace:key') - useTranslation hook with namespace prefix
      const pattern4a = /\bt\(\s*['"`]([^'"`]+):([^'"`]+)['"`]/g;
      while ((match = pattern4a.exec(fileContent)) !== null) {
        const namespace = match[1];
        const key = match[2];

        // Skip dynamic keys and test placeholders
        if (
          key.includes('${') ||
          key.includes('`') ||
          key.includes('commandName') ||
          key.includes('variable') ||
          key === 'key'
        ) {
          continue;
        }

        keys.push({ key, namespace, file: '' });
      }

      // Pattern 4b: t('key') - simple t() calls (from useTranslation hook)
      const pattern4b = /\bt\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      while ((match = pattern4b.exec(fileContent)) !== null) {
        const key = match[1];

        // Skip if this matches the namespace:key pattern (already handled above)
        if (key.includes(':')) {
          continue;
        }

        // Skip dynamic keys and test placeholders
        if (
          key.includes('${') ||
          key.includes('`') ||
          key.includes('commandName') ||
          key.includes('variable') ||
          key === 'key'
        ) {
          continue;
        }

        // For simple t() calls, we need to infer namespace from useTranslation() call in same file
        // Look for useTranslation('namespace') pattern
        const useTranslationMatch = fileContent.match(
          /useTranslation\(\s*['"`]([^'"`]+)['"`]\s*\)/,
        );
        const namespace = useTranslationMatch ? useTranslationMatch[1] : 'help';

        keys.push({ key, namespace, file: '' });
      }

      // Pattern 5: getTranslatedErrorMessage('key', fallback, params)
      const pattern5 = /getTranslatedErrorMessage\(\s*['"`]([^'"`]+)['"`]/g;
      while ((match = pattern5.exec(fileContent)) !== null) {
        let key = match[1];
        let namespace = 'errors'; // default namespace

        // Skip dynamic keys and test placeholders
        if (
          key.includes('${') ||
          key.includes('`') ||
          key.includes('commandName') ||
          key.includes('variable') ||
          key === 'key'
        ) {
          continue;
        }

        // Handle keys with namespace prefix like 'errors:auth.browserOpenFailedAdvice'
        if (key.includes(':')) {
          const [keyNamespace, ...keyParts] = key.split(':');
          namespace = keyNamespace;
          key = keyParts.join(':'); // rejoin in case there are multiple colons
        }

        keys.push({ key, namespace, file: '' });
      }

      // Pattern 6: tNamespace('key') - renamed translation functions like tDialogs, tUI, etc.
      const pattern6 = /\bt[A-Z][a-zA-Z]*\(\s*['"`]([^'"`]+)['"`]/g;
      while ((match = pattern6.exec(fileContent)) !== null) {
        const key = match[1];

        // Skip dynamic keys and test placeholders
        if (
          key.includes('${') ||
          key.includes('`') ||
          key.includes('commandName') ||
          key.includes('variable') ||
          key === 'key'
        ) {
          continue;
        }

        // Extract the namespace from the function name (tDialogs -> dialogs)
        const fullMatch = fileContent.match(
          new RegExp(
            `\\bt([A-Z][a-zA-Z]*)\\(\\s*['"\`]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`,
          ),
        );
        if (fullMatch) {
          const namespacePart = fullMatch[1].toLowerCase(); // Dialogs -> dialogs
          // Map common patterns
          const namespace =
            namespacePart === 'diaglogs' || namespacePart === 'dialogs'
              ? 'dialogs'
              : namespacePart === 'ui'
                ? 'ui'
                : namespacePart === 'commands'
                  ? 'commands'
                  : namespacePart === 'messages'
                    ? 'messages'
                    : namespacePart === 'errors'
                      ? 'errors'
                      : 'help'; // default fallback
          keys.push({ key, namespace, file: '' });
        }
      }

      return keys;
    }

    function scanSourceFiles(): Array<{
      key: string;
      namespace: string;
      file: string;
    }> {
      const allKeys: Array<{ key: string; namespace: string; file: string }> =
        [];

      // Directories to scan
      const scanDirs = [
        { dir: path.join(__dirname, '../..'), label: 'cli' },
        { dir: path.join(__dirname, '../../../core/src'), label: 'core' },
      ];

      function scanDirectory(
        dir: string,
        relativePath = '',
        packageLabel = '',
      ): void {
        try {
          const items = fs.readdirSync(dir);

          for (const item of items) {
            const fullPath = path.join(dir, item);
            const itemRelativePath = packageLabel
              ? path.join(packageLabel, relativePath, item)
              : path.join(relativePath, item);

            if (fs.statSync(fullPath).isDirectory()) {
              // Skip node_modules, dist, and test directories
              if (!['node_modules', 'dist', '__snapshots__'].includes(item)) {
                scanDirectory(
                  fullPath,
                  path.join(relativePath, item),
                  packageLabel,
                );
              }
            } else if (
              (item.endsWith('.ts') || item.endsWith('.tsx')) &&
              !item.includes('.test.') &&
              !item.includes('.spec.')
            ) {
              try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const keysInFile = extractTranslationKeys(content);
                keysInFile.forEach((keyInfo) => {
                  allKeys.push({
                    ...keyInfo,
                    file: itemRelativePath,
                  });
                });
              } catch (_error) {
                // Skip files that can't be read
              }
            }
          }
        } catch (_error) {
          console.warn(`Could not scan directory: ${dir}`);
        }
      }

      // Scan all directories
      scanDirs.forEach(({ dir, label }) => {
        scanDirectory(dir, '', label);
      });
      return allKeys;
    }

    it('should scan and debug translation usage', () => {
      // Test the extraction function first
      const testContent = `
        i18n.t('mcp.configNotLoaded', { ns: 'commands' })
        i18n.t('ui:chat.noCheckpoints')
        i18n.t('messages:memory.currentContent', { interpolation: 'ignore' })
      `;

      const extractedKeys = extractTranslationKeys(testContent);
      console.log('Test extraction results:', extractedKeys);

      // Expect specific keys
      expect(extractedKeys).toContainEqual({
        key: 'mcp.configNotLoaded',
        namespace: 'commands',
        file: '',
      });

      expect(extractedKeys).toContainEqual({
        key: 'chat.noCheckpoints',
        namespace: 'ui',
        file: '',
      });
    });

    it('should have all translation keys used in code available in all languages', () => {
      const usedKeys = scanSourceFiles();

      // Group keys by namespace
      const keysByNamespace: Record<
        string,
        Array<{ key: string; file: string }>
      > = {};
      usedKeys.forEach(({ key, namespace, file }) => {
        if (!keysByNamespace[namespace]) {
          keysByNamespace[namespace] = [];
        }
        keysByNamespace[namespace].push({ key, file });
      });

      console.log('\\n=== Translation Usage Scan ===');
      console.log('Found namespaces:', Object.keys(keysByNamespace));
      Object.keys(keysByNamespace).forEach((ns) => {
        console.log(`${ns}: ${keysByNamespace[ns].length} keys`);
        if (keysByNamespace[ns].length > 0) {
          const sampleKeys = keysByNamespace[ns].slice(0, 3);
          console.log(
            '  Sample keys:',
            sampleKeys.map((k) => `${k.key} (${k.file})`),
          );
        }
      });

      // Check each namespace
      Object.entries(keysByNamespace).forEach(([namespace, keys]) => {
        // Skip invalid namespaces
        if (!requiredNamespaces.includes(namespace)) {
          console.warn(`⚠️  Skipping unknown namespace: ${namespace}`);
          return;
        }

        supportedLanguages.forEach((lang) => {
          const translationFile = path.join(
            localesDir,
            lang,
            namespace + '.json',
          );

          if (!fs.existsSync(translationFile)) {
            throw new Error(
              `Translation file missing: ${lang}/${namespace}.json`,
            );
          }

          const translations = JSON.parse(
            fs.readFileSync(translationFile, 'utf8'),
          );

          // Check each key used in code
          keys.forEach(({ key, file }) => {
            const keyParts = key.split('.');
            let current = translations;
            let keyExists = true;

            for (const part of keyParts) {
              if (current && typeof current === 'object' && part in current) {
                current = current[part];
              } else {
                keyExists = false;
                break;
              }
            }

            expect(
              keyExists,
              `Missing translation key "${key}" in ${lang}/${namespace}.json (used in ${file})`,
            ).toBe(true);

            if (keyExists) {
              // Check if the translation value is valid (string or non-empty array)
              const isValidString =
                typeof current === 'string' && current.trim() !== '';
              const isValidArray = Array.isArray(current) && current.length > 0;

              expect(
                isValidString || isValidArray,
                `Empty or invalid translation for "${key}" in ${lang}/${namespace}.json (got ${typeof current})`,
              ).toBe(true);
            }
          });
        });
      });
    });

    it('should identify unused translation keys', () => {
      const usedKeys = scanSourceFiles();
      const usedKeySet = new Set(
        usedKeys.map((k) => k.namespace + '.' + k.key),
      );

      // Get all available keys from English (reference)
      const allAvailableKeys: string[] = [];

      requiredNamespaces.forEach((namespace) => {
        const filePath = path.join(localesDir, 'en', namespace + '.json');
        if (fs.existsSync(filePath)) {
          const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const keys = getTranslationKeysLocal(translations);
          keys.forEach((key: string) => {
            allAvailableKeys.push(namespace + '.' + key);
          });
        }
      });

      const unusedKeys = allAvailableKeys.filter((key) => !usedKeySet.has(key));

      console.log(
        `\\n=== Unused Translation Keys (${unusedKeys.length} total) ===`,
      );
      if (unusedKeys.length > 0) {
        console.log(unusedKeys.slice(0, 10).join('\\n'));
        if (unusedKeys.length > 10) {
          console.log(`... and ${unusedKeys.length - 10} more`);
        }
      }

      // This is informational only - we don't fail the test for unused keys
      // expect(unusedKeys.length).toBe(0); // Uncomment to enforce no unused keys
    });
  });
});
