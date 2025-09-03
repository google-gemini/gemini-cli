#!/usr/bin/env tsx

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Find unused translation keys in Gemini CLI project
 *
 * This script analyzes all translation files and checks if their keys
 * are actually used in the codebase. Helps identify orphaned translations.
 *
 * Usage:
 * npx tsx packages/cli/src/i18n/find-unused-translations.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

// Auto-locate project root directory
function findProjectRoot(): string {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));
  while (currentDir !== '/') {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      // Look for the workspace root package.json
      if (packageJson.workspaces) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error('Could not find project root directory');
}

// Change to project root directory
const PROJECT_ROOT = findProjectRoot();
process.chdir(PROJECT_ROOT);

interface TranslationKey {
  namespace: string;
  key: string;
  fullKey: string; // e.g., "errors:auth.timeout"
  value: string;
  filePath: string;
  isUsed: boolean;
}

interface UnusedTranslationReport {
  totalKeys: number;
  usedKeys: number;
  unusedKeys: number;
  unusedByNamespace: Map<string, TranslationKey[]>;
  potentialOrphans: TranslationKey[];
}

class UnusedTranslationFinder {
  private translationKeys: TranslationKey[] = [];
  private codebaseContent: string = '';

  async findUnusedTranslations(): Promise<UnusedTranslationReport> {
    console.log('🔍 Analyzing translation usage...');

    // Step 1: Load all translation keys from English files (base language)
    await this.loadTranslationKeys();
    console.log(`📚 Found ${this.translationKeys.length} translation keys`);

    // Step 2: Load all codebase content
    await this.loadCodebaseContent();
    console.log('📁 Loaded codebase content for analysis');

    // Step 3: Check usage for each key
    this.checkKeyUsage();

    // Step 4: Generate report
    return this.generateReport();
  }

  private async loadTranslationKeys(): Promise<void> {
    const localesDir = path.join('packages/cli/src/i18n/locales/en');
    const translationFiles = fs
      .readdirSync(localesDir)
      .filter((file) => file.endsWith('.json'));

    for (const file of translationFiles) {
      const namespace = file.replace('.json', '');
      const filePath = path.join(localesDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      this.extractKeysFromObject(content, namespace, filePath, '');
    }
  }

  private extractKeysFromObject(
    obj: Record<string, unknown>,
    namespace: string,
    filePath: string,
    prefix: string = '',
  ): void {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (
        typeof obj[key] === 'object' &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        // Recursively process nested objects
        this.extractKeysFromObject(obj[key] as Record<string, unknown>, namespace, filePath, fullKey);
      } else {
        // This is a leaf node (actual translation)
        this.translationKeys.push({
          namespace,
          key: fullKey,
          fullKey: `${namespace}:${fullKey}`, // Format used in t() calls
          value: String(obj[key]),
          filePath,
          isUsed: false,
        });
      }
    }
  }

  private async loadCodebaseContent(): Promise<void> {
    // Patterns to search for source code
    const codePatterns = [
      'packages/cli/src/**/*.{ts,tsx}',
      'packages/core/src/**/*.{ts,tsx}',
      '!**/*.test.{ts,tsx}', // Exclude test files
      '!**/*.d.ts', // Exclude type definitions
      '!**/node_modules/**', // Exclude dependencies
      '!**/dist/**', // Exclude build outputs
    ];

    const files = await glob(codePatterns);
    console.log(`📄 Analyzing ${files.length} source files`);

    let allContent = '';
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        allContent += '\n' + content;
      } catch (error) {
        console.warn(`⚠️  Could not read file: ${file}`);
      }
    }

    this.codebaseContent = allContent;
  }

  private checkNamespaceUsage(key: string, namespace: string): boolean {
    // Check for explicit namespace parameter patterns
    const explicitNsPatterns = [
      // t('key', { ns: 'namespace' })
      `t('${key}', { ns: '${namespace}' })`,
      `t("${key}", { ns: "${namespace}" })`,
      // t('key', { ns: 'namespace', ... })
      `t('${key}', { ns: '${namespace}',`,
      `t("${key}", { ns: "${namespace}",`,
    ];

    // Check for useTranslation('namespace') pattern + t('key') or renamed t functions
    const useTranslationPattern = `useTranslation('${namespace}')`;
    const useTranslationPattern2 = `useTranslation("${namespace}")`;
    const hasUseTranslation =
      this.codebaseContent.includes(useTranslationPattern) ||
      this.codebaseContent.includes(useTranslationPattern2);

    if (hasUseTranslation) {
      // Extract possible renamed translation functions from useTranslation destructuring
      const renamedFunctionNames =
        this.extractRenamedTranslationFunctions(namespace);

      // Standard t() patterns
      const simpleKeyPatterns = [
        `t('${key}')`,
        `t("${key}")`,
        `t('${key}',`,
        `t("${key}",`,
        // Template literals
        `t(\`${key}\`)`,
        `t(\`${key}\`,`,
      ];

      // Add patterns for renamed functions (e.g., tDiaglogs, tCommands, etc.)
      for (const funcName of renamedFunctionNames) {
        simpleKeyPatterns.push(
          `${funcName}('${key}')`,
          `${funcName}("${key}")`,
          `${funcName}('${key}',`,
          `${funcName}("${key}",`,
          `${funcName}(\`${key}\`)`,
          `${funcName}(\`${key}\`,`,
        );
      }

      const hasSimpleKeyUsage = simpleKeyPatterns.some((pattern) =>
        this.codebaseContent.includes(pattern),
      );

      if (hasSimpleKeyUsage) return true;
    }

    // Check explicit namespace patterns
    const hasExplicitNs = explicitNsPatterns.some((pattern) =>
      this.codebaseContent.includes(pattern),
    );

    if (hasExplicitNs) return true;

    // Broader pattern matching with namespace verification
    const broadKeyPatterns = [`t('${key}', {`, `t("${key}", {`];

    const hasKeyPattern = broadKeyPatterns.some((pattern) =>
      this.codebaseContent.includes(pattern),
    );
    const hasNamespacePattern =
      this.codebaseContent.includes(`ns: '${namespace}'`) ||
      this.codebaseContent.includes(`ns: "${namespace}"`);

    return hasKeyPattern && hasNamespacePattern;
  }

  /**
   * Extract renamed translation function names from useTranslation destructuring
   * e.g., const { t: tDiaglogs } = useTranslation('dialogs') => returns ['tDiaglogs']
   */
  private extractRenamedTranslationFunctions(namespace: string): string[] {
    const renamedFunctions: string[] = [];

    // Regex to match useTranslation destructuring with renaming
    // Matches: const { t: renamedName } = useTranslation('namespace')
    const destructuringPatterns = [
      new RegExp(
        `const\\s*{\\s*t:\\s*(\\w+)\\s*}\\s*=\\s*useTranslation\\s*\\(\\s*['"\`]${namespace}['"\`]\\s*\\)`,
        'g',
      ),
      new RegExp(
        `let\\s*{\\s*t:\\s*(\\w+)\\s*}\\s*=\\s*useTranslation\\s*\\(\\s*['"\`]${namespace}['"\`]\\s*\\)`,
        'g',
      ),
      new RegExp(
        `var\\s*{\\s*t:\\s*(\\w+)\\s*}\\s*=\\s*useTranslation\\s*\\(\\s*['"\`]${namespace}['"\`]\\s*\\)`,
        'g',
      ),
    ];

    for (const pattern of destructuringPatterns) {
      let match;
      while ((match = pattern.exec(this.codebaseContent)) !== null) {
        const renamedFunctionName = match[1];
        if (renamedFunctionName && renamedFunctionName !== 't') {
          renamedFunctions.push(renamedFunctionName);
        }
      }
    }

    return renamedFunctions;
  }

  private checkKeyUsage(): void {
    for (const translationKey of this.translationKeys) {
      // Check multiple possible usage patterns:

      // 1. Direct t() usage: t('namespace:key')
      const directPattern1 = `t('${translationKey.fullKey}')`;
      const directPattern2 = `t("${translationKey.fullKey}")`;

      // 2. Template literal usage: t(`namespace:key`)
      const templatePattern = `t(\`${translationKey.fullKey}\`)`;

      // 3. Variable usage: t(someVariable) where someVariable = 'namespace:key'
      const quotedKeyPattern1 = `'${translationKey.fullKey}'`;
      const quotedKeyPattern2 = `"${translationKey.fullKey}"`;

      // 4. Split usage: t('namespace', 'key') (some i18n libraries use this)
      const splitPattern1 = `t('${translationKey.namespace}', '${translationKey.key}')`;
      const splitPattern2 = `t("${translationKey.namespace}", "${translationKey.key}")`;

      // 5. Namespace parameter usage: t('key', { ns: 'namespace' })
      // Check for exact match first
      const nsPattern1 = `t('${translationKey.key}', { ns: '${translationKey.namespace}' })`;
      const nsPattern2 = `t("${translationKey.key}", { ns: "${translationKey.namespace}" })`;

      // More flexible pattern matching using regex for multiline scenarios
      const nsPattern3 = this.checkNamespaceUsage(
        translationKey.key,
        translationKey.namespace,
      );

      // 6. Dynamic key usage with specific patterns (more precise than namespace-only)
      const dynamicKeyPatterns = [
        // Template literals with interpolation: t(`${namespace}:${dynamicKey}`)
        `t(\`${translationKey.namespace}:\${`,
        // Template literals: t(`namespace:${someVar}`)
        `\`${translationKey.namespace}:\${`,
        // String concatenation: t(namespace + ':' + key)
        `'${translationKey.namespace}:' +`,
        `"${translationKey.namespace}:" +`,
      ];

      // Basic exact patterns (high precision)
      const exactPatterns = [
        directPattern1,
        directPattern2,
        templatePattern,
        quotedKeyPattern1,
        quotedKeyPattern2,
        splitPattern1,
        splitPattern2,
        nsPattern1,
        nsPattern2,
      ];

      // Check exact patterns first
      const hasExactMatch = exactPatterns.some((pattern) =>
        this.codebaseContent.includes(pattern),
      );

      // Check flexible namespace usage
      const hasNamespaceMatch = nsPattern3;

      // Check dynamic usage patterns (only if not already found)
      const hasDynamicMatch =
        !hasExactMatch &&
        !hasNamespaceMatch &&
        dynamicKeyPatterns.some((pattern) =>
          this.codebaseContent.includes(pattern),
        );

      translationKey.isUsed =
        hasExactMatch || hasNamespaceMatch || hasDynamicMatch;
    }
  }

  private generateReport(): UnusedTranslationReport {
    const usedKeys = this.translationKeys.filter((k) => k.isUsed);
    const unusedKeys = this.translationKeys.filter((k) => !k.isUsed);

    // Group unused keys by namespace
    const unusedByNamespace = new Map<string, TranslationKey[]>();
    unusedKeys.forEach((key) => {
      const namespace = key.namespace;
      if (!unusedByNamespace.has(namespace)) {
        unusedByNamespace.set(namespace, []);
      }
      unusedByNamespace.get(namespace)!.push(key);
    });

    // Find potential orphans (keys that might be legitimate but seem unused)
    const potentialOrphans = unusedKeys.filter((key) => 
      // Keys that might be used dynamically or in templates
       key.value.length > 10 && !key.key.includes('test')
    );

    return {
      totalKeys: this.translationKeys.length,
      usedKeys: usedKeys.length,
      unusedKeys: unusedKeys.length,
      unusedByNamespace,
      potentialOrphans,
    };
  }

  generateDetailedReport(report: UnusedTranslationReport): string {
    let output = '';

    // Header
    output += '# Unused Translation Keys Report\n\n';
    output += `**Generated**: ${new Date().toISOString()}\n\n`;

    // Summary
    output += '## Summary\n\n';
    output += `- **Total translation keys**: ${report.totalKeys}\n`;
    output += `- **Used keys**: ${report.usedKeys} (${((report.usedKeys / report.totalKeys) * 100).toFixed(1)}%)\n`;
    output += `- **Unused keys**: ${report.unusedKeys} (${((report.unusedKeys / report.totalKeys) * 100).toFixed(1)}%)\n\n`;

    if (report.unusedKeys === 0) {
      output +=
        '🎉 **Excellent!** All translation keys are being used in the codebase.\n\n';
      return output;
    }

    // Unused keys by namespace
    output += '## Unused Keys by Namespace\n\n';
    for (const [namespace, keys] of report.unusedByNamespace.entries()) {
      output += `### ${namespace} (${keys.length} unused)\n\n`;

      keys.forEach((key) => {
        output += `- **${key.key}**: \`"${key.value}"\`\n`;
        output += `  - Full key: \`${key.fullKey}\`\n`;
        output += `  - File: \`${key.filePath}\`\n\n`;
      });
    }

    // Potential orphans (might need manual review)
    if (report.potentialOrphans.length > 0) {
      output += '## Potential Orphans (Manual Review Recommended)\n\n';
      output += 'These keys appear unused but might be used dynamically:\n\n';

      report.potentialOrphans.forEach((key) => {
        output += `- **${key.fullKey}**: \`"${key.value}"\`\n`;
      });
      output += '\n';
    }

    // Recommendations
    output += '## Recommendations\n\n';
    if (report.unusedKeys > 0) {
      output +=
        '1. **Review unused keys**: Check if they are truly unnecessary\n';
      output +=
        '2. **Check for dynamic usage**: Some keys might be used in dynamic contexts\n';
      output +=
        '3. **Clean up safely**: Remove confirmed unused keys to reduce bundle size\n';
      output +=
        '4. **Update translations**: Remove corresponding keys from all language files\n\n';
    }

    output += '## Notes\n\n';
    output += '- This analysis now uses improved precision matching\n';
    output +=
      '- Removed overly broad namespace-only patterns that caused false positives\n';
    output += '- Dynamic key usage detection is more targeted and specific\n';
    output +=
      '- Keys used only in comments or strings are considered "unused"\n';
    output += '- Always verify before deleting translation keys\n';

    return output;
  }
}

async function main() {
  try {
    const finder = new UnusedTranslationFinder();
    const report = await finder.findUnusedTranslations();

    console.log('\n📊 Analysis Results:');
    console.log(`   📚 Total keys: ${report.totalKeys}`);
    console.log(
      `   ✅ Used keys: ${report.usedKeys} (${((report.usedKeys / report.totalKeys) * 100).toFixed(1)}%)`,
    );
    console.log(
      `   ❌ Unused keys: ${report.unusedKeys} (${((report.unusedKeys / report.totalKeys) * 100).toFixed(1)}%)`,
    );

    if (report.unusedKeys > 0) {
      console.log('\n📋 Unused keys by namespace:');
      for (const [namespace, keys] of report.unusedByNamespace.entries()) {
        console.log(`   ${namespace}: ${keys.length} unused`);
      }
    }

    // Generate detailed report
    const detailedReport = finder.generateDetailedReport(report);
    const outputFile = 'unused-translations-report.md';
    fs.writeFileSync(outputFile, detailedReport, 'utf-8');

    console.log(`\n📋 Detailed report generated: ${outputFile}`);

    if (report.unusedKeys === 0) {
      console.log('\n🎉 All translation keys are being used! Clean codebase.');
    } else {
      console.log(
        `\n💡 Consider reviewing and cleaning up ${report.unusedKeys} unused translation keys.`,
      );
    }
  } catch (error) {
    console.error('❌ Error analyzing translations:', error);
    process.exit(1);
  }
}

main().catch(console.error);
