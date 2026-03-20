/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { parse } from 'shell-quote';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnAsync } from '../utils/shell-utils.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config, LspSettings } from '../config/config.js';
import type { Diagnostic } from './lspTypes.js';

export type { Diagnostic };

interface DiagnosticCacheEntry {
  diagnostics: Diagnostic[];
  timestamp: number;
  fileHash: string;
}

const CACHE_TTL_MS = 5000;
const CACHE_MAX_AGE_MS = 30000;

export class LspService {
  private readonly config: Config;
  private projectRoot: string;
  private cache: Map<string, DiagnosticCacheEntry> = new Map();
  private tsgoDetected: boolean | null = null;

  constructor(config: Config) {
    this.config = config;
    this.projectRoot = config.getProjectRoot ? config.getProjectRoot() : '.';
  }

  getConfig(): Config {
    return this.config;
  }

  private async computeFileHash(filePath: string): Promise<string> {
    try {
      const absolutePath = path.resolve(this.projectRoot, filePath);
      const stat = await fs.promises.stat(absolutePath);
      return `${absolutePath}:${stat.mtimeMs}:${stat.size}`;
    } catch {
      return `${filePath}:${Date.now()}`;
    }
  }

  private async getCachedDiagnostics(
    filePath: string,
  ): Promise<Diagnostic[] | null> {
    const absolutePath = path.resolve(this.projectRoot, filePath);
    const entry = this.cache.get(absolutePath);

    if (!entry) return null;

    const fileHash = await this.computeFileHash(filePath);

    if (fileHash !== entry.fileHash) {
      this.cache.delete(absolutePath);
      return null;
    }

    const age = Date.now() - entry.timestamp;

    if (age > CACHE_MAX_AGE_MS) {
      this.cache.delete(absolutePath);
      return null;
    }

    if (age < CACHE_TTL_MS) {
      return entry.diagnostics;
    }

    return null;
  }

  private async setCachedDiagnostics(
    filePath: string,
    diagnostics: Diagnostic[],
  ): Promise<void> {
    const absolutePath = path.resolve(this.projectRoot, filePath);
    const fileHash = await this.computeFileHash(filePath);

    this.cache.set(absolutePath, {
      diagnostics,
      timestamp: Date.now(),
      fileHash,
    });
  }

  async invalidateCache(filePath?: string): Promise<void> {
    if (filePath) {
      const absolutePath = path.resolve(this.projectRoot, filePath);
      this.cache.delete(absolutePath);
    } else {
      this.cache.clear();
    }
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  async detectTsgo(): Promise<boolean> {
    if (this.tsgoDetected !== null) {
      return this.tsgoDetected;
    }

    const possiblePaths = [
      path.join(this.projectRoot, 'node_modules', '.bin', 'tsgo'),
      path.join(this.projectRoot, 'node_modules', 'tsgo', 'bin', 'tsgo.js'),
    ];

    for (const tsgoPath of possiblePaths) {
      try {
        await fs.promises.access(tsgoPath, fs.constants.X_OK);
        this.tsgoDetected = true;
        debugLogger.debug('tsgo detected at:', tsgoPath);
        return true;
      } catch {
        // Continue checking other paths
      }
    }

    this.tsgoDetected = false;
    return false;
  }

  /**
   * Detect available linters/formatters in the project.
   */
  async detectProjectLinters(): Promise<{
    eslint: boolean;
    biome: boolean;
    ruff: boolean;
    oxlint: boolean;
    prettier: boolean;
  }> {
    const results = {
      eslint: false,
      biome: false,
      ruff: false,
      oxlint: false,
      prettier: false,
    };

    const configFiles: Record<keyof typeof results, string[]> = {
      eslint: [
        '.eslintrc.js',
        '.eslintrc.cjs',
        '.eslintrc.json',
        'eslint.config.js',
        'eslint.config.mjs',
      ],
      biome: ['biome.json'],
      ruff: ['ruff.toml', 'pyproject.toml'],
      oxlint: ['oxlintrc.json', '.oxlintrc'],
      prettier: ['.prettierrc', '.prettierrc.json', 'prettier.config.js'],
    };

    const linterKeys = [
      'eslint',
      'biome',
      'ruff',
      'oxlint',
      'prettier',
    ] as const;
    for (const linter of linterKeys) {
      const files = configFiles[linter];
      for (const file of files) {
        const filePath = path.join(this.projectRoot, file);
        try {
          await fs.promises.access(filePath, fs.constants.F_OK);
          results[linter] = true;
          debugLogger.debug(`Detected ${linter} config: ${file}`);
          break;
        } catch {
          // File doesn't exist, continue checking
        }
      }
    }

    return results;
  }

  /**
   * Get optimized commands based on detected linters.
   */
  async getOptimizedCommands(): Promise<{
    lintCommand: string;
    typeCheckCommand: string;
    formatterCommand?: string;
  }> {
    const linters = await this.detectProjectLinters();
    const config = this.config.getLspSettings
      ? this.config.getLspSettings()
      : null;

    // Use explicit config if provided
    if (config?.lintCommand && config?.typeCheckCommand) {
      return {
        lintCommand: config.lintCommand,
        typeCheckCommand: config.typeCheckCommand,
      };
    }

    // Auto-select best linter based on available tools
    let lintCommand = 'eslint';
    if (linters.biome) {
      lintCommand = 'biome check';
    } else if (linters.oxlint) {
      lintCommand = 'oxlint';
    } else if (linters.ruff) {
      lintCommand = 'ruff check';
    }

    // TypeScript detection
    const hasTsConfig = await this.hasFile('tsconfig.json');
    let typeCheckCommand =
      'tsc --project tsconfig.json --noEmit --skipLibCheck';

    if (hasTsConfig) {
      const isTsgo = await this.detectTsgo();
      if (isTsgo) {
        typeCheckCommand = 'tsgo --noEmit';
      }
    }

    // Formatter
    let formatterCommand: string | undefined;
    if (linters.biome) {
      formatterCommand = 'biome format --write';
    } else if (linters.prettier) {
      formatterCommand = 'prettier --write';
    } else if (linters.ruff) {
      formatterCommand = 'ruff format';
    }

    return { lintCommand, typeCheckCommand, formatterCommand };
  }

  private async hasFile(fileName: string): Promise<boolean> {
    try {
      await fs.promises.access(
        path.join(this.projectRoot, fileName),
        fs.constants.F_OK,
      );
      return true;
    } catch {
      return false;
    }
  }

  getAutoDetectedCommands(): { lintCommand: string; typeCheckCommand: string } {
    const defaults = {
      lintCommand: 'eslint',
      typeCheckCommand: 'tsc --project tsconfig.json --noEmit --skipLibCheck',
    };

    const config = this.config.getLspSettings
      ? this.config.getLspSettings()
      : null;

    if (config?.lintCommand && config?.typeCheckCommand) {
      return {
        lintCommand: config.lintCommand,
        typeCheckCommand: config.typeCheckCommand,
      };
    }

    return defaults;
  }

  async runDiagnosticsForProject(
    options: { lint?: boolean; types?: boolean } = { lint: true, types: true },
  ): Promise<{ lint: Diagnostic[]; types: Diagnostic[] }> {
    const lspSettings: LspSettings = this.config.getLspSettings
      ? this.config.getLspSettings()
      : {
          lintEnabled: true,
          lintCommand: 'eslint',
          typeCheckEnabled: true,
          typeCheckCommand:
            'tsc --project tsconfig.json --noEmit --skipLibCheck',
          maxDiagnostics: 10,
        };

    const results: { lint: Diagnostic[]; types: Diagnostic[] } = {
      lint: [],
      types: [],
    };

    if (options.lint && lspSettings.lintEnabled && lspSettings.lintCommand) {
      try {
        const output = await this.runCommand(lspSettings.lintCommand, '.');
        results.lint = this.parseDiagnostics(output, '.');
      } catch (error) {
        debugLogger.debug('Project lint failed:', error);
      }
    }

    if (
      options.types &&
      lspSettings.typeCheckEnabled &&
      lspSettings.typeCheckCommand
    ) {
      try {
        let typeCmd = lspSettings.typeCheckCommand;

        const isTsgo = await this.detectTsgo();
        if (isTsgo && typeCmd.startsWith('tsc')) {
          typeCmd = typeCmd.replace(/^tsc/, 'tsgo');
          debugLogger.debug('Using tsgo instead of tsc for project-wide check');
        }

        const output = await this.runCommand(typeCmd, '.');
        results.types = this.parseDiagnostics(output, '.');
      } catch (error) {
        debugLogger.debug('Project type check failed:', error);
      }
    }

    return results;
  }

  /**
   * Run diagnostics for a specific file.
   * Priority: Cache -> Mode-based strategy (LSP/IDE/CLI).
   */
  async getDiagnostics(
    filePath: string,
    options: { useCache?: boolean } = {},
  ): Promise<Diagnostic[]> {
    const shouldCache = options.useCache !== false;

    const lspSettings = this.config.getLspSettings
      ? this.config.getLspSettings()
      : {
          lintEnabled: true,
          lintCommand: 'eslint',
          typeCheckEnabled: true,
          typeCheckCommand:
            'tsc --project tsconfig.json --noEmit --skipLibCheck',
          maxDiagnostics: 10,
        };

    if (!lspSettings.lintEnabled && !lspSettings.typeCheckEnabled) {
      return [];
    }

    // Check cache first (unless disabled)
    if (shouldCache) {
      const cached = await this.getCachedDiagnostics(filePath);
      if (cached !== null) {
        debugLogger.debug('LSP diagnostics cache hit for:', filePath);
        return cached;
      }
    }

    const diagnostics: Diagnostic[] = [];

    // Pre-detect tsgo for faster diagnostics
    await this.detectTsgo();

    const cliDiagnostics = await this.getDiagnosticsFromCli(
      filePath,
      lspSettings,
    );
    diagnostics.push(...cliDiagnostics);

    // Final Filter: Ensure we only return types of diagnostics the user has enabled
    const filtered = diagnostics.filter((d) => {
      const isType =
        d.source?.toLowerCase().includes('typescript') ||
        d.source?.toLowerCase() === 'ts' ||
        d.code?.startsWith('TS') ||
        false;

      const isLint =
        d.source?.toLowerCase().includes('eslint') ||
        (!isType && (!d.code || !d.code.startsWith('TS')));

      if (isType && !lspSettings.typeCheckEnabled) return false;
      if (isLint && !lspSettings.lintEnabled) return false;
      return true;
    });

    const deduplicated = this.deduplicateDiagnostics(filtered);

    // Cache the result (unless disabled)
    if (shouldCache) {
      await this.setCachedDiagnostics(filePath, deduplicated);
    }

    // Cap diagnostics to avoid context window flooding
    const max = lspSettings.maxDiagnostics ?? 10;
    if (deduplicated.length > max) {
      return deduplicated.slice(0, max);
    }

    return deduplicated;
  }

  /**
   * Runs local CLI commands (eslint, tsc) to get diagnostics.
   */
  private async getDiagnosticsFromCli(
    filePath: string,
    lspSettings: LspSettings,
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    // Run linting if configured and enabled
    if (lspSettings.lintEnabled && lspSettings.lintCommand) {
      try {
        const lintResults = await this.runCommand(
          lspSettings.lintCommand,
          filePath,
        );
        diagnostics.push(...this.parseDiagnostics(lintResults, filePath));
      } catch (error) {
        debugLogger.debug('LSP linting failed:', error);
      }
    }

    // Run type checking if configured and enabled
    if (lspSettings.typeCheckEnabled && lspSettings.typeCheckCommand) {
      try {
        let typeCmd = lspSettings.typeCheckCommand;

        // Use tsgo instead of tsc if available (much faster)
        if (this.tsgoDetected && typeCmd.startsWith('tsc')) {
          typeCmd = typeCmd.replace(/^tsc/, 'tsgo');
          debugLogger.debug('Using tsgo for faster type checking');
        }

        // Special handling for tsc: remove --project if targeting a single file
        if (typeCmd.includes('tsc') && filePath !== '.') {
          typeCmd = typeCmd.replace(/--project\s+\S+/, '');
          typeCmd = typeCmd.replace(/-p\s+\S+/, '');
        }

        const typeCheckResults = await this.runCommand(typeCmd, filePath);
        diagnostics.push(...this.parseDiagnostics(typeCheckResults, filePath));
      } catch (error) {
        debugLogger.debug('LSP type checking failed:', error);
      }
    }

    return diagnostics;
  }

  private deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    const seen = new Set<string>();
    return diagnostics.filter((d) => {
      const key = `${d.file}:${d.line}:${d.column}:${d.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async runCommand(command: string, filePath: string): Promise<string> {
    const parsed = parse(command);
    const parts = parsed.filter((p): p is string => typeof p === 'string');

    const cmd = parts[0] || '';
    let filteredArgs = parts.slice(1);

    if (command.includes('{file}')) {
      filteredArgs = filteredArgs.map((arg) =>
        arg.replace(/{file}/g, filePath),
      );
    } else {
      // Backward compatibility: append if no placeholder is present
      filteredArgs.push(filePath);
    }

    // Try to resolve the binary locally first to avoid npx overhead
    let resolvedCmd = cmd;
    if (cmd && !path.isAbsolute(cmd)) {
      const localBin = path.join(this.projectRoot, 'node_modules', '.bin', cmd);
      try {
        await fs.promises.access(localBin, fs.constants.X_OK);
        resolvedCmd = localBin;
      } catch {
        // Fall back to PATH resolution
      }
    }

    try {
      const { stdout, stderr } = await spawnAsync(resolvedCmd, filteredArgs, {
        cwd: this.projectRoot,
        sandboxManager: this.config.sandboxManager,
      });
      return stdout + stderr;
    } catch (error: unknown) {
      // spawnAsync throws on non-zero exit code, which is common for lint/tsc errors
      if (error instanceof Error) {
        return error.message;
      }
      return String(error);
    }
  }

  private parseDiagnostics(
    output: string,
    targetFilePath: string,
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = output.split('\n');
    let currentFile = '';

    const absoluteTargetPath = path.resolve(this.projectRoot, targetFilePath);

    // Common formats (ESLint, TSC)
    const patterns = [
      // TSC format: file.ts(10,5): error TS1234: message
      {
        regex:
          /^(.*?)\((\d+),(\d+)\): (err|error|warn|warning|info) (.*?): (.*)$/,
        fileIdx: 1,
        lineIdx: 2,
        colIdx: 3,
        severityIdx: 4,
        codeIdx: 5,
        messageIdx: 6,
      },
      // ESLint format or similar: file.ts:10:5: error message
      {
        regex: /^(.*?):(\d+):(\d+): (err|error|warn|warning|info) (.*)$/,
        fileIdx: 1,
        lineIdx: 2,
        colIdx: 3,
        severityIdx: 4,
        messageIdx: 5,
      },
      // Modern TSC format: file.ts:10:5 - error TS1234: message
      {
        regex:
          /^(.*?):(\d+):(\d+)\s+-\s+(err|error|warn|warning|info)\s+(.*?):\s+(.*)$/,
        fileIdx: 1,
        lineIdx: 2,
        colIdx: 3,
        severityIdx: 4,
        codeIdx: 5,
        messageIdx: 6,
      },
      // Generic format: file.ts: line 10, col 5, Error - message
      {
        regex:
          /^(.*?): line (\d+), col (\d+), (err|error|warn|warning|info) - (.*)$/i,
        fileIdx: 1,
        lineIdx: 2,
        colIdx: 3,
        severityIdx: 4,
        messageIdx: 5,
      },
      // ESLint stylish format:   10:5  error  message
      {
        regex: /^\s+(\d+):(\d+)\s+(err|error|warn|warning|info)\s+(.*)$/,
        lineIdx: 1,
        colIdx: 2,
        severityIdx: 3,
        messageIdx: 4,
      },
    ];

    for (const line of lines) {
      // Check if line looks like a filename (absolute or relative, not starting with space)
      if (
        line &&
        !line.startsWith(' ') &&
        (line.includes('/') || line.includes('\\')) &&
        !line.includes('(') &&
        (!line.includes(':') || /^[a-zA-Z]:[\\/]/.test(line))
      ) {
        currentFile = line.trim();
        continue;
      }

      for (const p of patterns) {
        const match = line.match(p.regex);
        if (match) {
          const file = p.fileIdx ? match[p.fileIdx] : currentFile;
          const lineNum = match[p.lineIdx];
          const col = match[p.colIdx];
          const severity = match[p.severityIdx];
          const code = p.codeIdx ? match[p.codeIdx] : undefined;
          const message = match[p.messageIdx];

          const absoluteMatchedPath = file
            ? path.resolve(this.projectRoot, file)
            : absoluteTargetPath;

          const isMatch =
            absoluteMatchedPath === absoluteTargetPath ||
            (targetFilePath === '.' &&
              absoluteMatchedPath.startsWith(this.projectRoot));

          if (isMatch) {
            diagnostics.push({
              file: absoluteMatchedPath,
              line: parseInt(lineNum, 10),
              column: parseInt(col, 10),
              severity: this.normalizeSeverity(severity),
              code,
              message: message.trim(),
            });
          }
          break;
        }
      }
    }

    return diagnostics;
  }

  private normalizeSeverity(sev: string): 'error' | 'warning' | 'info' {
    const s = sev.toLowerCase();
    if (s.includes('err')) return 'error';
    if (s.includes('warn')) return 'warning';
    return 'info';
  }
}
