#!/usr/bin/env tsx

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Find hardcoded English strings in Gemini CLI that need internationalization
 *
 * Usage:
 * npx tsx packages/cli/src/i18n/find-hardcoded-strings.ts
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

interface HardcodedString {
  file: string;
  line: number;
  content: string;
  context: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  translations?: {
    zh: string;
    es: string;
    fr: string;
  };
}

class StringFinder {
  private results: HardcodedString[] = [];
  private readonly UI_PATHS = [
    // UI components - highest priority
    'packages/cli/src/ui/**/*.{ts,tsx}',

    // Command system - direct user interaction
    'packages/cli/src/commands/**/*.{ts,tsx}',

    // Configuration and settings system
    'packages/cli/src/config/**/*.{ts,tsx}',

    // Utility functions and helper modules
    'packages/cli/src/utils/**/*.{ts,tsx}',

    // Service layer - may contain error messages
    'packages/cli/src/services/**/*.{ts,tsx}',

    // Integration related
    'packages/cli/src/zed-integration/**/*.{ts,tsx}',

    // Root directory core files
    'packages/cli/src/*.{ts,tsx}',

    // Core package user-facing messages
    'packages/core/src/**/*.{ts,tsx}',
  ];

  // Patterns to exclude
  private readonly EXCLUDE_PATTERNS = [
    /\.test\./, // Test files
    /\.d\.ts$/, // Type definition files
    /node_modules/, // Dependencies
    /\/\*\*.*\*\//, // Comment blocks
    /\/\/.*$/, // Single line comments
    // JSDoc example code detection - more precise rules
    /console\.(log|error|warn|debug)/, // Console output
    /throw new Error/, // Error throwing (usually developer errors)
    /logger\.(debug|error|warn|info)/, // Log messages
    /debugReportError/, // Debug error reporting
    /diag\.(error|warn)/, // Diagnostic messages
  ];

  // Technical terms and identifiers - should not be internationalized
  private readonly TECHNICAL_EXCLUDE_PATTERNS = [
    // Tool names and APIs
    /read_many_files|write_file|web_search|web_fetch/,
    // Environment variables and config keys
    /NO_COLOR|GEMINI_API_KEY|OTLP_ENDPOINT|DEBUG/,
    // File names and extensions
    /\.gitignore|\.geminiignore|\.md|\.ts|\.tsx|\.json/,
    // Protocols and standards
    /OAuth|JWT|CSRF|HTTP|HTTPS|JSON|API|MCP|OTLP/,
    // Package names and library names
    /node-pty|child_process|clearcut/,
    // Technical concepts
    /UUID|URI|URL|UID|GID|metadata|enum|const/,
    // File paths and system related
    /\/home\/|\/var\/|localhost|127\.0\.0\.1/,
  ];

  // Developer-specific messages - should not be internationalized
  private readonly DEVELOPER_EXCLUDE_PATTERNS = [
    // Internal error messages (not for end users)
    /Error in generateJson|Failed to parse JSON|API returned an empty response/,
    /Logger not initialized|Config was already initialized/,
    /Tool execution succeeded|Tool call cancelled by user/,
    /User did not allow tool call|User cancelled tool execution/,
    /Critical error reading log file|Request contains an invalid argument/,
    // LLM and API related technical errors
    /Error during LLM call|Error initializing.*chat session/,
    /Dynamic client registration|OAuth.*configuration/,
    /authorization code|Turn\.run-|corrected.*escaping/,
    /shell process.*process tree/,
    // Technical error descriptions
    /Failed to close transport|State mismatch/,
    /Invalid OTLP endpoint|ClearcutLogger/,
    /Operation not permitted/,
    // Development debug information
    /Flush already in progress|marking pending flush/,
    /MaxSizedBox children must/,
    // Internal tools and command patterns
    /UserProfile\|updateProfile\|editUser/,
    /tool_call:|GrepTool\.Name/,
    // Technical system prompts and API descriptions
    /reasoning on if.*conversation.*looping/,
    /Brief explanation justifying/,
    /Who should speak next.*based.*only/,
    /Model Continues.*explicitly states/,
    // Examples and template text
    /Wrote.*bytes to.*\.txt|Read.*files/,
    /foo\.txt|example\.com/,
    // System internal identifiers and error detection
    /installation ID|ephemeral ID|Quota exceeded.*metric/,
    /GrepLogic.*Falling back|Flash model/,
    /RequestError.*Authentication required/,
    /Command was cancelled by user before/,
    /Tool discovery command.*empty.*whitespace/,
    // Internal method and class name references
    /This is the.*_value_.*returned/,
    /Renders:.*numRenders/,
    /command\+shift\+p|Gemini CLI:.*Diff.*IDE/,
    // LLM model internal dialogues and instructions (not for end users)
    /First, reason in your scratchpad/,
    /Got it. Thanks for the additional context/,
    // Configuration and Schema errors (developer errors)
    /PromptConfig.*must have|PromptConfig.*cannot have/,
    /Scopes must be provided.*oauth config/,
    /Value of params must be an object/,
    // System paths and examples
    /Library\/Application Support|my cat.*name is|My favorite color/,
    /pineapple on pizza|cmd\.exe.*command/,
    // Internal state and Speaker detection
    /last message was.*function response/,
    /filler model message.*no content/,
    /Original context.*stringified/,
    /shell tool.*globally disabled/,
    /Command substitution.*not allowed.*security/,
  ];

  // High priority patterns - text users see directly
  private readonly HIGH_PRIORITY_PATTERNS = [
    // Text attributes in UI components
    {
      pattern: /(?:text|title|label|placeholder):\s*["']([A-Z][^"']{3,})["']/g,
      category: 'UI Components',
    },
    // Directly rendered text
    { pattern: /<Text[^>]*>([A-Z][^<]{5,})<\/Text>/g, category: 'Direct Text' },
    // Dialogs and prompts
    {
      pattern:
        /["']([A-Z][a-z]+.*?(?:dialog|Dialog|confirm|Confirm|prompt|Prompt)[^"']{0,50})["']/g,
      category: 'Dialogs',
    },
    // Error and success messages
    {
      pattern: /["']((?:Error|Success|Failed|Successfully)[^"']{5,})["']/g,
      category: 'Status Messages',
    },
  ];

  // Medium priority patterns - functional text
  private readonly MEDIUM_PRIORITY_PATTERNS = [
    // Command descriptions and help (exclude tool API descriptions)
    {
      pattern: /description:\s*["']([A-Z][^"']{10,})["']/g,
      category: 'Command Descriptions',
    },
    // Text in addItem calls
    {
      pattern: /addItem\([^)]*text:\s*["']([A-Z][^"']{5,})["']/g,
      category: 'Message Items',
    },
    // Status and notification messages
    {
      pattern:
        /["']((?:Loading|Connecting|Connected|Disconnected|Installing|Restarting)[^"']{3,})["']/g,
      category: 'Status Updates',
    },
    // Validation and configuration messages
    {
      pattern: /["']((?:Please|Already|Cannot|Unable|Invalid)[^"']{10,})["']/g,
      category: 'Validation Messages',
    },
  ];

  // Low priority patterns - debug and internal text
  private readonly LOW_PRIORITY_PATTERNS = [
    // Debug and log messages
    {
      pattern: /["']((?:DEBUG|INFO|WARN)[^"']{10,})["']/g,
      category: 'Debug Messages',
    },
    // Developer related text
    {
      pattern:
        /["']([A-Z][a-z]+.*(?:development|Development|test|Test)[^"']{0,30})["']/g,
      category: 'Development',
    },
    // Other long text strings
    { pattern: /["']([A-Z][a-z][^"']{20,})["']/g, category: 'Long Strings' },
  ];

  async findFiles(): Promise<string[]> {
    const allFiles: string[] = [];
    for (const pattern of this.UI_PATHS) {
      const files = await glob(pattern, {
        cwd: process.cwd(),
        ignore: ['**/*.test.*', '**/*.d.ts', '**/node_modules/**'],
      });
      allFiles.push(...files);
    }
    return [...new Set(allFiles)];
  }

  shouldExcludeFile(filePath: string): boolean {
    // Exclude i18n directory itself
    if (filePath.includes('/i18n/')) {
      return true;
    }

    // Exclude settingsSchema.ts - language option names should remain in native language
    if (filePath.endsWith('/settingsSchema.ts')) {
      return true;
    }

    return this.EXCLUDE_PATTERNS.some((pattern) =>
      typeof pattern === 'string'
        ? filePath.includes(pattern)
        : pattern.test(filePath),
    );
  }

  shouldExcludeLine(line: string): boolean {
    // Basic exclusion patterns
    if (
      this.EXCLUDE_PATTERNS.some((pattern) =>
        typeof pattern === 'string'
          ? line.includes(pattern)
          : pattern.test(line),
      )
    ) {
      return true;
    }

    // Technical terms exclusion
    if (this.TECHNICAL_EXCLUDE_PATTERNS.some((pattern) => pattern.test(line))) {
      return true;
    }

    // Developer messages exclusion
    if (this.DEVELOPER_EXCLUDE_PATTERNS.some((pattern) => pattern.test(line))) {
      return true;
    }

    return false;
  }

  // Check if this is a tool API description or JSDoc example (should not be translated)
  isToolApiDescription(
    filePath: string,
    extractedText: string,
    context: string,
  ): boolean {
    // JSDoc example code detection - check if in comment block with JSX tags
    if (context.match(/^\s*\*.*<[A-Z][a-zA-Z]*[^>]*>/)) {
      return true;
    }

    // Exclude monitoring metric descriptions (description field in telemetry/metrics.ts)
    if (
      filePath.includes('/telemetry/metrics.ts') &&
      context.includes('description:')
    ) {
      return true;
    }

    // Exclude AI tool API descriptions in subagent.ts
    if (
      filePath.includes('/core/subagent.ts') &&
      context.includes('description:')
    ) {
      return true;
    }

    // Descriptions in tool files are usually API documentation, not for end users
    if (
      filePath.includes('/tools/') &&
      extractedText.match(
        /^(The|Optional|Whether|Performs|List|Reads|Writes|Counts)/,
      )
    ) {
      return true;
    }

    // Descriptions containing technical terms
    if (
      extractedText.match(
        /\b(API|JSON|regex|glob|pattern|endpoint|parameter|argument|metadata|telemetry)\b/i,
      )
    ) {
      return true;
    }

    return false;
  }

  extractStrings(content: string, filePath: string): void {
    const lines = content.split('\n');

    // Check each line
    lines.forEach((line, index) => {
      if (this.shouldExcludeLine(line)) return;

      // High priority patterns
      this.HIGH_PRIORITY_PATTERNS.forEach(({ pattern, category }) => {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(line)) !== null) {
          const extractedText = match[1];
          if (
            extractedText &&
            extractedText.length > 3 &&
            !this.isToolApiDescription(filePath, extractedText, line)
          ) {
            this.results.push({
              file: filePath,
              line: index + 1,
              content: extractedText,
              context: line.trim(),
              priority: 'high',
              category,
            });
          }
        }
      });

      // Medium priority patterns
      this.MEDIUM_PRIORITY_PATTERNS.forEach(({ pattern, category }) => {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(line)) !== null) {
          const extractedText = match[1];
          if (
            extractedText &&
            extractedText.length > 5 &&
            !this.isToolApiDescription(filePath, extractedText, line) &&
            !this.isPartOfMultilineTranslatedCall(lines, index) &&
            !this.isPartOfLegacyBackupCode(lines, index) &&
            !this.isInTryCatchFallback(lines, index) &&
            !this.isInKnownFallbackFile(filePath)
          ) {
            this.results.push({
              file: filePath,
              line: index + 1,
              content: extractedText,
              context: line.trim(),
              priority: 'medium',
              category,
            });
          }
        }
      });

      // Low priority patterns
      this.LOW_PRIORITY_PATTERNS.forEach(({ pattern, category }) => {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(line)) !== null) {
          const extractedText = match[1];
          if (
            extractedText &&
            extractedText.length > 15 &&
            !this.isToolApiDescription(filePath, extractedText, line) &&
            !this.isPartOfMultilineTranslatedCall(lines, index) &&
            !this.isPartOfLegacyBackupCode(lines, index) &&
            !this.isInTryCatchFallback(lines, index) &&
            !this.isInKnownFallbackFile(filePath)
          ) {
            this.results.push({
              file: filePath,
              line: index + 1,
              content: extractedText,
              context: line.trim(),
              priority: 'low',
              category,
            });
          }
        }
      });
    });
  }

  private isPartOfMultilineTranslatedCall(
    lines: string[],
    currentIndex: number,
  ): boolean {
    // Look back a few lines to see if there's a getTranslatedErrorMessage call start
    const lookBackLines = Math.min(5, currentIndex);
    for (let i = 0; i <= lookBackLines; i++) {
      const lineIndex = currentIndex - i;
      if (lineIndex < 0) break;

      const line = lines[lineIndex];
      if (line.includes('getTranslatedErrorMessage')) {
        // Found getTranslatedErrorMessage call, check if current line is within its parameters
        // Simple check: there should be matching parentheses from function call line to current line
        const fromCallLine = lines
          .slice(lineIndex, currentIndex + 1)
          .join('\n');
        const openParenCount = (fromCallLine.match(/\(/g) || []).length;
        const closeParenCount = (fromCallLine.match(/\)/g) || []).length;

        // If parentheses are not closed, current line is still inside function call
        if (openParenCount > closeParenCount) {
          return true;
        }
      }
    }
    return false;
  }

  private isInTryCatchFallback(lines: string[], currentIndex: number): boolean {
    // Check if this is in a catch block as fallback
    const lookBackLines = Math.min(20, currentIndex);

    for (let i = 0; i <= lookBackLines; i++) {
      const lineIndex = currentIndex - i;
      if (lineIndex < 0) break;

      const line = lines[lineIndex].toLowerCase().trim();

      // Check if in catch block
      if (
        line.includes('} catch') ||
        line.includes('catch {') ||
        line.includes('catch (')
      ) {
        // Check if the few lines after catch block contain fallback-related comments
        for (let j = 1; j <= 10; j++) {
          const nextLineIndex = lineIndex + j;
          if (nextLineIndex >= lines.length) break;

          const nextLine = lines[nextLineIndex].toLowerCase();
          if (
            nextLine.includes('fallback') ||
            nextLine.includes('legacy') ||
            nextLine.includes('if i18n fails')
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private isInKnownFallbackFile(filePath: string): boolean {
    // Check if in known fallback files
    return (
      filePath.includes('usePhraseCycler.ts') && filePath.includes('ui/hooks')
    );
  }

  private isPartOfLegacyBackupCode(
    lines: string[],
    currentIndex: number,
  ): boolean {
    // Check if this is part of legacy/backup code block
    const lookBackLines = Math.min(200, currentIndex); // Increase search range to cover entire large arrays

    for (let i = 0; i <= lookBackLines; i++) {
      const lineIndex = currentIndex - i;
      if (lineIndex < 0) break;

      const line = lines[lineIndex].toLowerCase();

      // Check for legacy-related comments or variable names
      if (
        line.includes('legacy') ||
        line.includes('backup') ||
        line.includes('fallback') ||
        line.includes('now replaced by i18n') ||
        line.includes('witty_loading_phrases') ||
        line.includes('fallback to legacy') ||
        line.includes('if i18n fails') ||
        line.includes('// legacy phrases') ||
        line.includes('legacy phrases - now replaced by i18n') ||
        line.includes('export const witty_loading_phrases') ||
        line.includes('const witty_loading_phrases') ||
        (line.includes('catch') && line.includes('return'))
      ) {
        // Confirm current line is within this legacy code block
        const codeBlock = lines.slice(lineIndex, currentIndex + 10).join('\n');
        const openBrackets = (codeBlock.match(/\[/g) || []).length;
        const closeBrackets = (codeBlock.match(/\]/g) || []).length;

        // If inside array definition
        if (openBrackets > closeBrackets) {
          return true;
        }
      }
    }
    return false;
  }

  async analyzeFile(filePath: string): Promise<void> {
    if (this.shouldExcludeFile(filePath)) return;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.extractStrings(content, filePath);
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
    }
  }

  removeDuplicates(): void {
    // Remove duplicates based on content and file
    const seen = new Set<string>();
    this.results = this.results.filter((item) => {
      const key = `${item.file}:${item.line}:${item.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  filterAlreadyInternationalized(): void {
    // Filter out already internationalized content (lines containing t( or i18n.t or translation functions)
    this.results = this.results.filter((item) => {
      const context = item.context.toLowerCase();
      return (
        !context.includes('t(') &&
        !context.includes('i18n.t') &&
        !context.includes('translation') &&
        !context.includes('gettranslatederrormessage')
      );
    });
  }

  generateReport(): string {
    const priorityOrder = ['high', 'medium', 'low'];
    const groupedResults = priorityOrder.reduce(
      (acc, priority) => {
        acc[priority] = this.results.filter(
          (item) => item.priority === priority,
        );
        return acc;
      },
      {} as Record<string, HardcodedString[]>,
    );

    let report = `# Gemini CLI Hardcoded Strings Report\n\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Total found: ${this.results.length} hardcoded strings\n\n`;

    priorityOrder.forEach((priority) => {
      const items = groupedResults[priority];
      if (items.length === 0) return;

      const priorityEmoji =
        priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';
      const priorityName =
        priority === 'high'
          ? 'High Priority'
          : priority === 'medium'
            ? 'Medium Priority'
            : 'Low Priority';

      report += `## ${priorityEmoji} ${priorityName} (${items.length} items)\n\n`;

      // Group by category
      const categories = [...new Set(items.map((item) => item.category))];
      categories.forEach((category) => {
        const categoryItems = items.filter(
          (item) => item.category === category,
        );
        if (categoryItems.length === 0) return;

        report += `### ${category} (${categoryItems.length} items)\n\n`;

        categoryItems.forEach((item) => {
          const relativeFile = item.file.replace(/^packages\/cli\/src\//, '');
          report += `**${relativeFile}:${item.line}**\n`;
          report += `- String: \`"${item.content}"\`\n`;
          report += `- Context: \`${item.context}\`\n\n`;
        });
      });
    });

    // Statistics summary
    report += `\n## 📊 Statistics Summary\n\n`;
    priorityOrder.forEach((priority) => {
      const count = groupedResults[priority].length;
      const priorityName =
        priority === 'high'
          ? 'High Priority'
          : priority === 'medium'
            ? 'Medium Priority'
            : 'Low Priority';
      report += `- ${priorityName}: ${count} items\n`;
    });

    const categories = [...new Set(this.results.map((item) => item.category))];
    report += `\nBy category:\n`;
    categories.forEach((category) => {
      const count = this.results.filter(
        (item) => item.category === category,
      ).length;
      report += `- ${category}: ${count} items\n`;
    });

    return report;
  }

  async run(): Promise<void> {
    console.log(
      '🔍 Searching for hardcoded strings that need internationalization...\n',
    );

    const files = await this.findFiles();
    console.log(`📁 Found ${files.length} files to analyze`);

    // Analyze all files
    for (const file of files) {
      await this.analyzeFile(file);
    }

    console.log(`📝 Initially found ${this.results.length} strings`);

    // Clean up results
    this.removeDuplicates();
    console.log(`🧹 After deduplication: ${this.results.length} strings`);

    this.filterAlreadyInternationalized();
    console.log(
      `✨ After filtering internationalized: ${this.results.length} strings pending`,
    );

    // Generate report
    const report = this.generateReport();

    // Output to file
    const outputFile = 'i18n-hardcoded-strings-report.md';
    fs.writeFileSync(outputFile, report, 'utf-8');

    console.log(`\n📋 Report generated: ${outputFile}`);
    console.log(
      `\n🎯 Found ${this.results.length} hardcoded strings needing internationalization`,
    );

    // Output priority statistics
    const highPriority = this.results.filter(
      (r) => r.priority === 'high',
    ).length;
    const mediumPriority = this.results.filter(
      (r) => r.priority === 'medium',
    ).length;
    const lowPriority = this.results.filter((r) => r.priority === 'low').length;

    console.log(`   🔴 High priority: ${highPriority} items`);
    console.log(`   🟡 Medium priority: ${mediumPriority} items`);
    console.log(`   🟢 Low priority: ${lowPriority} items`);
  }
}

// Execute script
const finder = new StringFinder();
finder.run().catch(console.error);

export { StringFinder, HardcodedString };
