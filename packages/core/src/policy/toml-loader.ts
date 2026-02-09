/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type PolicyRule,
  PolicyDecision,
  ApprovalMode,
  type SafetyCheckerConfig,
  type SafetyCheckerRule,
  InProcessCheckerType,
} from './types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import toml from '@iarna/toml';
import { z, type ZodError } from 'zod';

/**
 * Schema for a single policy rule in the TOML file (before transformation).
 */
const PolicyRuleSchema = z.object({
  toolName: z.union([z.string(), z.array(z.string())]).optional(),
  mcpName: z.string().optional(),
  argsPattern: z.string().optional(),
  commandPrefix: z.union([z.string(), z.array(z.string())]).optional(),
  commandRegex: z.string().optional(),
  decision: z.nativeEnum(PolicyDecision),
  // Priority must be in range [0, 999] to prevent tier overflow.
  // With tier transformation (tier + priority/1000), this ensures:
  // - Tier 1 (default): range [1.000, 1.999]
  // - Tier 2 (user): range [2.000, 2.999]
  // - Tier 3 (admin): range [3.000, 3.999]
  priority: z
    .number({
      required_error: 'priority is required',
      invalid_type_error: 'priority must be a number',
    })
    .int({ message: 'priority must be an integer' })
    .min(0, { message: 'priority must be >= 0' })
    .max(999, {
      message:
        'priority must be <= 999 to prevent tier overflow. Priorities >= 1000 would jump to the next tier.',
    }),
  modes: z.array(z.nativeEnum(ApprovalMode)).optional(),
  allow_redirection: z.boolean().optional(),
  deny_message: z.string().optional(),
});

/**
 * Schema for a single safety checker rule in the TOML file.
 */
const SafetyCheckerRuleSchema = z.object({
  toolName: z.union([z.string(), z.array(z.string())]).optional(),
  mcpName: z.string().optional(),
  argsPattern: z.string().optional(),
  commandPrefix: z.union([z.string(), z.array(z.string())]).optional(),
  commandRegex: z.string().optional(),
  priority: z.number().int().default(0),
  modes: z.array(z.nativeEnum(ApprovalMode)).optional(),
  checker: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('in-process'),
      name: z.nativeEnum(InProcessCheckerType),
      required_context: z.array(z.string()).optional(),
      config: z.record(z.unknown()).optional(),
    }),
    z.object({
      type: z.literal('external'),
      name: z.string(),
      required_context: z.array(z.string()).optional(),
      config: z.record(z.unknown()).optional(),
    }),
  ]),
});

/**
 * Schema for the entire policy TOML file.
 */
const PolicyFileSchema = z.object({
  rule: z.array(PolicyRuleSchema).optional(),
  safety_checker: z.array(SafetyCheckerRuleSchema).optional(),
});

/**
 * Type for a raw policy rule from TOML (before transformation).
 */
type PolicyRuleToml = z.infer<typeof PolicyRuleSchema>;

/**
 * Type for a raw safety checker rule from TOML.
 */
type SafetyCheckerRuleToml = z.infer<typeof SafetyCheckerRuleSchema>;

/**
 * Types of errors that can occur while loading policy files.
 */
export type PolicyFileErrorType =
  | 'file_read'
  | 'toml_parse'
  | 'schema_validation'
  | 'rule_validation'
  | 'regex_compilation';

/**
 * Detailed error information for policy file loading failures.
 */
export interface PolicyFileError {
  filePath: string;
  fileName: string;
  tier: 'default' | 'user' | 'admin';
  ruleIndex?: number;
  errorType: PolicyFileErrorType;
  message: string;
  details?: string;
  suggestion?: string;
}

/**
 * Result of loading policies from TOML files.
 */
export interface PolicyLoadResult {
  rules: PolicyRule[];
  checkers: SafetyCheckerRule[];
  errors: PolicyFileError[];
}

/**
 * Converts a tier number to a human-readable tier name.
 */
function getTierName(tier: number): 'default' | 'user' | 'admin' {
  if (tier === 1) return 'default';
  if (tier === 2) return 'user';
  if (tier === 3) return 'admin';
  return 'default';
}

/**
 * Formats a Zod validation error into a readable error message.
 */
function formatSchemaError(error: ZodError, ruleIndex: number): string {
  const issues = error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return `  - Field "${path}": ${issue.message}`;
    })
    .join('\n');
  return `Invalid policy rule (rule #${ruleIndex + 1}):\n${issues}`;
}

/**
 * Validates shell command convenience syntax rules.
 * Returns an error message if invalid, or null if valid.
 */
function validateShellCommandSyntax(
  rule: PolicyRuleToml | SafetyCheckerRuleToml,
  index: number,
  itemType: 'Rule' | 'Safety Checker' = 'Rule',
): string | null {
  const hasCommandPrefix = rule.commandPrefix !== undefined;
  const hasCommandRegex = rule.commandRegex !== undefined;
  const hasArgsPattern = rule.argsPattern !== undefined;

  if (hasCommandPrefix || hasCommandRegex) {
    // Must have exactly toolName = "run_shell_command"
    if (rule.toolName !== 'run_shell_command' || Array.isArray(rule.toolName)) {
      return (
        `${itemType} #${index + 1}: commandPrefix and commandRegex can only be used with toolName = "run_shell_command"\n` +
        `  Found: toolName = ${JSON.stringify(rule.toolName)}\n` +
        `  Fix: Set toolName = "run_shell_command" (not an array)`
      );
    }

    // Can't combine with argsPattern
    if (hasArgsPattern) {
      return (
        `${itemType} #${index + 1}: cannot use both commandPrefix/commandRegex and argsPattern\n` +
        `  These fields are mutually exclusive\n` +
        `  Fix: Use either commandPrefix/commandRegex OR argsPattern, not both`
      );
    }

    // Can't use both commandPrefix and commandRegex
    if (hasCommandPrefix && hasCommandRegex) {
      return (
        `${itemType} #${index + 1}: cannot use both commandPrefix and commandRegex\n` +
        `  These fields are mutually exclusive\n` +
        `  Fix: Use either commandPrefix OR commandRegex, not both`
      );
    }
  }

  return null;
}

/**
 * Escapes characters with special meaning in regular expressions.
 * @param str The string to escape.
 * @returns The escaped string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * Transforms a priority number based on the policy tier.
 * Formula: tier + priority/1000
 *
 * @param priority The priority value from the TOML file
 * @param tier The tier (1=default, 2=user, 3=admin)
 * @returns The transformed priority
 */
function transformPriority(priority: number, tier: number): number {
  return tier + priority / 1000;
}

/**
 * Generic function to process policy items (rules or checkers).
 * Handles validation, filtering, expansion, and regex compilation.
 */
function processPolicyItems<
  TInput extends PolicyRuleToml | SafetyCheckerRuleToml,
  TOutput extends PolicyRule | SafetyCheckerRule,
>(
  items: TInput[],
  approvalMode: ApprovalMode,
  context: {
    filePath: string;
    fileName: string;
    tier: number;
    tierName: 'default' | 'user' | 'admin';
  },
  errors: PolicyFileError[],
  itemType: 'Rule' | 'Safety Checker',
  createOutput: (
    item: TInput,
    toolName: string | undefined,
    commandPrefix: string | undefined,
    argsPattern: RegExp | undefined,
    commandPattern: RegExp | undefined,
    modes: ApprovalMode[] | undefined,
    source: string,
  ) => TOutput,
): TOutput[] {
  const invalidIndices = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const validationError = validateShellCommandSyntax(item, i, itemType);
    if (validationError) {
      invalidIndices.add(i);
      errors.push({
        filePath: context.filePath,
        fileName: context.fileName,
        tier: context.tierName,
        ruleIndex: i,
        errorType: 'rule_validation',
        message:
          itemType === 'Safety Checker'
            ? 'Invalid shell command syntax in safety checker'
            : 'Invalid shell command syntax',
        details: validationError,
      });
    }
  }

  return items
    .filter((item, index) => {
      if (invalidIndices.has(index)) {
        return false;
      }
      return true;
    })
    .flatMap((item) => {
      let commandPattern: RegExp | undefined;
      if (item.commandRegex) {
        try {
          commandPattern = new RegExp(item.commandRegex);
        } catch (e) {
          const error = e as Error;
          errors.push({
            filePath: context.filePath,
            fileName: context.fileName,
            tier: context.tierName,
            errorType: 'regex_compilation',
            message:
              itemType === 'Safety Checker'
                ? 'Invalid command regex pattern in safety checker'
                : 'Invalid command regex pattern',
            details: `Pattern: ${item.commandRegex}\nError: ${error.message}`,
            suggestion:
              'Check regex syntax for errors like unmatched brackets or invalid escape sequences',
          });
          return null;
        }
      }

      const commandPrefixes: string[] = [];
      if (item.commandPrefix) {
        const prefixes = Array.isArray(item.commandPrefix)
          ? item.commandPrefix
          : [item.commandPrefix];
        commandPrefixes.push(...prefixes);
      }

      const expansionList: Array<{ prefix?: string; patternString?: string }> =
        commandPrefixes.length > 0
          ? commandPrefixes.map((prefix) => ({ prefix }))
          : [{ patternString: item.argsPattern }];

      return expansionList.flatMap(({ prefix, patternString }) => {
        let argsPattern: RegExp | undefined;
        if (patternString) {
          try {
            argsPattern = new RegExp(patternString);
          } catch (e) {
            const error = e as Error;
            errors.push({
              filePath: context.filePath,
              fileName: context.fileName,
              tier: context.tierName,
              errorType: 'regex_compilation',
              message:
                itemType === 'Safety Checker'
                  ? 'Invalid regex pattern in safety checker'
                  : 'Invalid regex pattern',
              details: `Pattern: ${patternString}\nError: ${error.message}`,
              suggestion:
                'Check regex syntax for errors like unmatched brackets or invalid escape sequences',
            });
            return null;
          }
        }

        const toolNames: Array<string | undefined> = item.toolName
          ? Array.isArray(item.toolName)
            ? item.toolName
            : [item.toolName]
          : [undefined];

        const source = `${context.tierName.charAt(0).toUpperCase() + context.tierName.slice(1)}: ${context.fileName}`;

        return toolNames.map((toolName) => {
          let effectiveToolName: string | undefined;
          if (item.mcpName && toolName) {
            effectiveToolName = `${item.mcpName}__${toolName}`;
          } else if (item.mcpName) {
            effectiveToolName = `${item.mcpName}__*`;
          } else {
            effectiveToolName = toolName;
          }

          return createOutput(
            item,
            effectiveToolName,
            prefix,
            argsPattern,
            commandPattern,
            item.modes,
            source,
          );
        });
      });
    })
    .filter((result): result is TOutput => result !== null);
}

/**
 * Loads and parses policies from TOML files in the specified directories.
 *
 * This function:
 * 1. Scans directories for .toml files
 * 2. Parses and validates each file
 * 3. Transforms rules (commandPrefix, arrays, mcpName, priorities)
 * 4. Collects detailed error information for any failures
 *
 * @param policyDirs Array of directory paths to scan for policy files
 * @param getPolicyTier Function to determine tier (1-3) for a directory
 * @param approvalMode The approval mode to use for filtering rules
 * @returns Object containing successfully parsed rules and any errors encountered
 */
export async function loadPoliciesFromToml(
  policyDirs: string[],
  getPolicyTier: (dir: string) => number,
  approvalMode: ApprovalMode,
): Promise<PolicyLoadResult> {
  const rules: PolicyRule[] = [];
  const checkers: SafetyCheckerRule[] = [];
  const errors: PolicyFileError[] = [];

  for (const dir of policyDirs) {
    const tier = getPolicyTier(dir);
    const tierName = getTierName(tier);

    // Scan directory for all .toml files
    let filesToLoad: string[];
    try {
      const dirEntries = await fs.readdir(dir, { withFileTypes: true });
      filesToLoad = dirEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.toml'))
        .map((entry) => entry.name);
    } catch (e) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, skip it (not an error)
        continue;
      }
      errors.push({
        filePath: dir,
        fileName: path.basename(dir),
        tier: tierName,
        errorType: 'file_read',
        message: `Failed to read policy directory`,
        details: error.message,
      });
      continue;
    }

    for (const file of filesToLoad) {
      const filePath = path.join(dir, file);

      try {
        // Read file
        const fileContent = await fs.readFile(filePath, 'utf-8');

        // Parse TOML
        let parsed: unknown;
        try {
          parsed = toml.parse(fileContent);
        } catch (e) {
          const error = e as Error;
          errors.push({
            filePath,
            fileName: file,
            tier: tierName,
            errorType: 'toml_parse',
            message: 'TOML parsing failed',
            details: error.message,
            suggestion:
              'Check for syntax errors like missing quotes, brackets, or commas',
          });
          continue;
        }

        // Validate schema
        const validationResult = PolicyFileSchema.safeParse(parsed);
        if (!validationResult.success) {
          errors.push({
            filePath,
            fileName: file,
            tier: tierName,
            errorType: 'schema_validation',
            message: 'Schema validation failed',
            details: formatSchemaError(validationResult.error, 0),
            suggestion:
              'Ensure all required fields (decision, priority) are present with correct types',
          });
          continue;
        }

        const context = { filePath, fileName: file, tier, tierName };

        const parsedRules = processPolicyItems(
          validationResult.data.rule ?? [],
          approvalMode,
          context,
          errors,
          'Rule',
          (
            item,
            toolName,
            commandPrefix,
            argsPattern,
            commandPattern,
            modes,
            source,
          ): PolicyRule => ({
            toolName,
            decision: item.decision,
            priority: transformPriority(item.priority, tier),
            commandPrefix,
            argsPattern,
            commandPattern,
            modes,
            allowRedirection: item.allow_redirection,
            denyMessage: item.deny_message,
            source,
          }),
        );
        rules.push(...parsedRules);

        const parsedCheckers = processPolicyItems(
          validationResult.data.safety_checker ?? [],
          approvalMode,
          context,
          errors,
          'Safety Checker',
          (
            item,
            toolName,
            commandPrefix,
            argsPattern,
            commandPattern,
            modes,
          ): SafetyCheckerRule => ({
            toolName,
            priority: item.priority,
            checker: item.checker as SafetyCheckerConfig,
            commandPrefix,
            argsPattern,
            commandPattern,
            modes,
          }),
        );
        checkers.push(...parsedCheckers);
      } catch (e) {
        const error = e as NodeJS.ErrnoException;
        if (error.code !== 'ENOENT') {
          errors.push({
            filePath,
            fileName: file,
            tier: tierName,
            errorType: 'file_read',
            message: 'Failed to read policy file',
            details: error.message,
          });
        }
      }
    }
  }

  return { rules, checkers, errors };
}
