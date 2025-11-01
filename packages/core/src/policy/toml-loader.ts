/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type PolicyRule, PolicyDecision, type ApprovalMode } from './types.js';
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
  modes: z.array(z.string()).optional(),
});

/**
 * Schema for the entire policy TOML file.
 */
const PolicyFileSchema = z.object({
  rule: z.array(PolicyRuleSchema),
});

/**
 * Type for a raw policy rule from TOML (before transformation).
 */
type PolicyRuleToml = z.infer<typeof PolicyRuleSchema>;

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
  errors: PolicyFileError[];
}

/**
 * Escapes special regex characters in a string for use in a regex pattern.
 * This is used for commandPrefix to ensure literal string matching.
 *
 * @param str The string to escape
 * @returns The escaped string safe for use in a regex
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  rule: PolicyRuleToml,
  ruleIndex: number,
): string | null {
  const hasCommandPrefix = rule.commandPrefix !== undefined;
  const hasCommandRegex = rule.commandRegex !== undefined;
  const hasArgsPattern = rule.argsPattern !== undefined;

  if (hasCommandPrefix || hasCommandRegex) {
    // Must have exactly toolName = "run_shell_command"
    if (rule.toolName !== 'run_shell_command' || Array.isArray(rule.toolName)) {
      return (
        `Rule #${ruleIndex + 1}: commandPrefix and commandRegex can only be used with toolName = "run_shell_command"\n` +
        `  Found: toolName = ${JSON.stringify(rule.toolName)}\n` +
        `  Fix: Set toolName = "run_shell_command" (not an array)`
      );
    }

    // Can't combine with argsPattern
    if (hasArgsPattern) {
      return (
        `Rule #${ruleIndex + 1}: cannot use both commandPrefix/commandRegex and argsPattern\n` +
        `  These fields are mutually exclusive\n` +
        `  Fix: Use either commandPrefix/commandRegex OR argsPattern, not both`
      );
    }

    // Can't use both commandPrefix and commandRegex
    if (hasCommandPrefix && hasCommandRegex) {
      return (
        `Rule #${ruleIndex + 1}: cannot use both commandPrefix and commandRegex\n` +
        `  These fields are mutually exclusive\n` +
        `  Fix: Use either commandPrefix OR commandRegex, not both`
      );
    }
  }

  return null;
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
 * Loads and parses policies from TOML files in the specified directories.
 *
 * This function:
 * 1. Scans directories for .toml files
 * 2. Parses and validates each file
 * 3. Transforms rules (commandPrefix, arrays, mcpName, priorities)
 * 4. Filters rules by approval mode
 * 5. Collects detailed error information for any failures
 *
 * @param approvalMode The current approval mode (for filtering rules by mode)
 * @param policyDirs Array of directory paths to scan for policy files
 * @param getPolicyTier Function to determine tier (1-3) for a directory
 * @returns Object containing successfully parsed rules and any errors encountered
 */
export async function loadPoliciesFromToml(
  approvalMode: ApprovalMode,
  policyDirs: string[],
  getPolicyTier: (dir: string) => number,
): Promise<PolicyLoadResult> {
  const rules: PolicyRule[] = [];
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

        // Validate shell command convenience syntax
        for (let i = 0; i < validationResult.data.rule.length; i++) {
          const rule = validationResult.data.rule[i];
          const validationError = validateShellCommandSyntax(rule, i);
          if (validationError) {
            errors.push({
              filePath,
              fileName: file,
              tier: tierName,
              ruleIndex: i,
              errorType: 'rule_validation',
              message: 'Invalid shell command syntax',
              details: validationError,
            });
            // Continue to next rule, don't skip the entire file
          }
        }

        // Transform rules
        const parsedRules: PolicyRule[] = validationResult.data.rule
          .filter((rule) => {
            // Filter by mode
            if (!rule.modes || rule.modes.length === 0) {
              return true;
            }
            return rule.modes.includes(approvalMode);
          })
          .flatMap((rule) => {
            // Transform commandPrefix/commandRegex to argsPattern
            let effectiveArgsPattern = rule.argsPattern;
            const commandPrefixes: string[] = [];

            if (rule.commandPrefix) {
              const prefixes = Array.isArray(rule.commandPrefix)
                ? rule.commandPrefix
                : [rule.commandPrefix];
              commandPrefixes.push(...prefixes);
            } else if (rule.commandRegex) {
              effectiveArgsPattern = `"command":"${rule.commandRegex}`;
            }

            // Expand command prefixes to multiple patterns
            const argsPatterns: Array<string | undefined> =
              commandPrefixes.length > 0
                ? commandPrefixes.map(
                    (prefix) => `"command":"${escapeRegex(prefix)}`,
                  )
                : [effectiveArgsPattern];

            // For each argsPattern, expand toolName arrays
            return argsPatterns.flatMap((argsPattern) => {
              const toolNames: Array<string | undefined> = rule.toolName
                ? Array.isArray(rule.toolName)
                  ? rule.toolName
                  : [rule.toolName]
                : [undefined];

              // Create a policy rule for each tool name
              return toolNames.map((toolName) => {
                // Transform mcpName field to composite toolName format
                let effectiveToolName: string | undefined;
                if (rule.mcpName && toolName) {
                  effectiveToolName = `${rule.mcpName}__${toolName}`;
                } else if (rule.mcpName) {
                  effectiveToolName = `${rule.mcpName}__*`;
                } else {
                  effectiveToolName = toolName;
                }

                const policyRule: PolicyRule = {
                  toolName: effectiveToolName,
                  decision: rule.decision,
                  priority: transformPriority(rule.priority, tier),
                };

                // Compile regex pattern
                if (argsPattern) {
                  try {
                    policyRule.argsPattern = new RegExp(argsPattern);
                  } catch (e) {
                    const error = e as Error;
                    errors.push({
                      filePath,
                      fileName: file,
                      tier: tierName,
                      errorType: 'regex_compilation',
                      message: 'Invalid regex pattern',
                      details: `Pattern: ${argsPattern}\nError: ${error.message}`,
                      suggestion:
                        'Check regex syntax for errors like unmatched brackets or invalid escape sequences',
                    });
                    // Skip this rule if regex compilation fails
                    return null;
                  }
                }

                return policyRule;
              });
            });
          })
          .filter((rule): rule is PolicyRule => rule !== null);

        rules.push(...parsedRules);
      } catch (e) {
        const error = e as NodeJS.ErrnoException;
        // Catch-all for unexpected errors
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

  return { rules, errors };
}
