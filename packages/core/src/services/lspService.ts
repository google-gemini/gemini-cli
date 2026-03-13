/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnAsync } from '../utils/shell-utils.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
}

export class LspService {
  private readonly config: Config;
  private projectRoot: string;

  constructor(config: Config) {
    this.config = config;
    this.projectRoot = config.getProjectRoot ? config.getProjectRoot() : '.';
  }

  /**
   * Run diagnostics for a specific file.
   * Currently triggers a full project check but filters for the specific file.
   */
  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const lspSettings = this.config.getLspSettings
      ? this.config.getLspSettings()
      : {
          lintEnabled: false,
          typeCheckEnabled: false,
        };

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
        const typeCheckResults = await this.runCommand(
          lspSettings.typeCheckCommand,
          filePath,
        );
        diagnostics.push(...this.parseDiagnostics(typeCheckResults, filePath));
      } catch (error) {
        debugLogger.debug('LSP type checking failed:', error);
      }
    }

    return this.deduplicateDiagnostics(diagnostics);
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
    const [cmd, ...args] = command.split(' ');
    // Always append the file path to run checks specifically on the edited file,
    // which prevents timing out on large projects.
    args.push('--', filePath);

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
      const { stdout, stderr } = await spawnAsync(resolvedCmd, args, {
        cwd: this.projectRoot,
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
        !line.includes(':')
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

          if (absoluteMatchedPath === absoluteTargetPath) {
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
