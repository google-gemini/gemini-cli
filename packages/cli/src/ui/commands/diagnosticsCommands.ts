/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
  type CommandContext,
} from './types.js';
import type { Config } from '@google/gemini-cli-core';
import { LspService } from '@google/gemini-cli-core';

function createLintCommand(config: Config | null): SlashCommand {
  return {
    name: 'lint',
    altNames: ['/l'],
    description: 'Run linter on the project (or a specific file)',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    isSafeConcurrent: true,
    suggestionGroup: 'Diagnostics',
    action: async (
      context: CommandContext,
    ): Promise<SlashCommandActionReturn> => {
      if (!config) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Configuration not available',
        };
      }

      const args = context.invocation?.args?.trim() || '';
      const lspService = new LspService(config);

      const hasTsgo = await lspService.detectTsgo();
      const commands = lspService.getAutoDetectedCommands();

      let output = `**Lint Report**\n\n`;
      output += `Linter: ${commands.lintCommand}\n`;
      output += `tsgo available: ${hasTsgo ? 'Yes (fast!)' : 'No (using tsc)'}\n\n`;

      try {
        if (args) {
          // Run on specific file - invalidate cache first to get fresh results
          await lspService.invalidateCache(args);
          const diagnostics = await lspService.getDiagnostics(args);

          if (diagnostics.length === 0) {
            output += `✅ No lint errors found in ${args}`;
          } else {
            output += `Found ${diagnostics.length} issue(s) in ${args}:\n\n`;
            diagnostics.forEach((d) => {
              const icon =
                d.severity === 'error'
                  ? '❌'
                  : d.severity === 'warning'
                    ? '⚠️'
                    : 'ℹ️';
              output += `${icon} Line ${d.line}, Col ${d.column}: ${d.message}`;
              if (d.code) output += ` (${d.code})`;
              output += '\n';
            });
          }
        } else {
          // Run project-wide
          const results = await lspService.runDiagnosticsForProject({
            lint: true,
            types: false,
          });

          const allDiagnostics = [...results.lint];
          if (allDiagnostics.length === 0) {
            output += '✅ No lint errors found in project';
          } else {
            output += `Found ${allDiagnostics.length} lint issue(s):\n\n`;
            allDiagnostics.slice(0, 30).forEach((d) => {
              const icon =
                d.severity === 'error'
                  ? '❌'
                  : d.severity === 'warning'
                    ? '⚠️'
                    : 'ℹ️';
              const file = d.file.split('/').pop() || d.file;
              output += `${icon} ${file}:${d.line}:${d.column}: ${d.message}\n`;
            });
            if (allDiagnostics.length > 30) {
              output += `\n... and ${allDiagnostics.length - 30} more`;
            }
          }
        }
      } catch (error) {
        output += `Error running lint: ${error instanceof Error ? error.message : String(error)}`;
      }

      return {
        type: 'message',
        messageType: 'info',
        content: output,
      };
    },
  };
}

function createTypeCheckCommand(config: Config | null): SlashCommand {
  return {
    name: 'typecheck',
    altNames: ['/tc', '/t'],
    description:
      'Run TypeScript type checking on the project (or a specific file)',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    isSafeConcurrent: true,
    suggestionGroup: 'Diagnostics',
    action: async (
      context: CommandContext,
    ): Promise<SlashCommandActionReturn> => {
      if (!config) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Configuration not available',
        };
      }

      const args = context.invocation?.args?.trim() || '';
      const lspService = new LspService(config);

      const hasTsgo = await lspService.detectTsgo();
      const commands = lspService.getAutoDetectedCommands();

      let output = `**Type Check Report**\n\n`;
      output += `Type checker: ${hasTsgo ? 'tsgo (fast!)' : commands.typeCheckCommand}\n\n`;

      try {
        if (args) {
          // Run on specific file - invalidate cache first to get fresh results
          await lspService.invalidateCache(args);
          const diagnostics = await lspService.getDiagnostics(args);

          const typeDiagnostics = diagnostics.filter(
            (d) =>
              String(d.code ?? '').startsWith('TS') ||
              d.source?.toLowerCase().includes('typescript'),
          );

          if (typeDiagnostics.length === 0) {
            output += `✅ No type errors found in ${args}`;
          } else {
            output += `Found ${typeDiagnostics.length} type error(s) in ${args}:\n\n`;
            typeDiagnostics.forEach((d) => {
              const icon =
                d.severity === 'error'
                  ? '❌'
                  : d.severity === 'warning'
                    ? '⚠️'
                    : 'ℹ️';
              output += `${icon} Line ${d.line}, Col ${d.column}: ${d.message}`;
              if (d.code) output += ` (${d.code})`;
              output += '\n';
            });
          }
        } else {
          // Run project-wide
          const results = await lspService.runDiagnosticsForProject({
            lint: false,
            types: true,
          });

          const allDiagnostics = [...results.types];
          if (allDiagnostics.length === 0) {
            output += '✅ No type errors found in project';
          } else {
            output += `Found ${allDiagnostics.length} type error(s):\n\n`;
            allDiagnostics.slice(0, 30).forEach((d) => {
              const icon =
                d.severity === 'error'
                  ? '❌'
                  : d.severity === 'warning'
                    ? '⚠️'
                    : 'ℹ️';
              const file = d.file.split('/').pop() || d.file;
              output += `${icon} ${file}:${d.line}:${d.column}: ${d.message}`;
              if (d.code) output += ` (${d.code})`;
              output += '\n';
            });
            if (allDiagnostics.length > 30) {
              output += `\n... and ${allDiagnostics.length - 30} more`;
            }
          }
        }
      } catch (error) {
        output += `Error running type check: ${error instanceof Error ? error.message : String(error)}`;
      }

      return {
        type: 'message',
        messageType: 'info',
        content: output,
      };
    },
  };
}

export { createLintCommand, createTypeCheckCommand };
