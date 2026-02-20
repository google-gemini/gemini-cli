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
import { buildArgsPatterns, isSafeRegExp } from './utils.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import toml from '@iarna/toml';
import { z, type ZodError } from 'zod';
import { isNodeError } from '../utils/errors.js';

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
  tier: 'default' | 'user' | 'workspace' | 'admin';
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

export interface PolicyFile {
  path: string;
  content: string;
}

/**
 * Reads policy files from a directory or a single file.
 *
 * @param policyPath Path to a directory or a .toml file.
 * @returns Array of PolicyFile objects.
 */
export async function readPolicyFiles(
  policyPath: string,
): Promise<PolicyFile[]> {
  let filesToLoad: string[] = [];
  let baseDir = '';

  try {
    const stats = await fs.stat(policyPath);
    if (stats.isDirectory()) {
      baseDir = policyPath;
      const dirEntries = await fs.readdir(policyPath, { withFileTypes: true });
      filesToLoad = dirEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.toml'))
        .map((entry) => entry.name);
    } else if (stats.isFile() && policyPath.endsWith('.toml')) {
      baseDir = path.dirname(policyPath);
      filesToLoad = [path.basename(policyPath)];
    }
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }

  const results: PolicyFile[] = [];
  for (const file of filesToLoad) {
    const filePath = path.join(baseDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    results.push({ path: filePath, content });
  }
  return results;
}

/**
 * Converts a tier number to a human-readable tier name.
 */
function getTierName(tier: number): 'default' | 'user' | 'workspace' | 'admin' {
  if (tier === 1) return 'default';
  if (tier === 2) return 'workspace';
  if (tier === 3) return 'user';
  if (tier === 4) return 'admin';
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
 * Loads and parses policies from TOML files in the specified paths (directories or individual files).
 *
 * This function:
 * 1. Scans paths for .toml files (if directory) or processes individual files
 * 2. Parses and validates each file
 * 3. Transforms rules (commandPrefix, arrays, mcpName, priorities)
 * 4. Collects detailed error information for any failures
 *
 * @param policyPaths Array of paths (directories or files) to scan for policy files
 * @param getPolicyTier Function to determine tier (1-4) for a path
 * @returns Object containing successfully parsed rules and any errors encountered
 */
export async function loadPoliciesFromToml(
  policyPaths: string[],
  getPolicyTier: (path: string) => number,
): Promise<PolicyLoadResult> {
  const rules: PolicyRule[] = [];
  const checkers: SafetyCheckerRule[] = [];
  const errors: PolicyFileError[] = [];

  for (const p of policyPaths) {
    const tier = getPolicyTier(p);
    const tierName = getTierName(tier);

    let policyFiles: PolicyFile[] = [];

    try {
      policyFiles = await readPolicyFiles(p);
    } catch (e) {
      errors.push({
        filePath: p,
        fileName: path.basename(p),
        tier: tierName,
        errorType: 'file_read',
        message: `Failed to read policy path`,
        details: isNodeError(e) ? e.message : String(e),
      });
      continue;
    }

    for (const { path: filePath, content: fileContent } of policyFiles) {
      const file = path.basename(filePath);

      try {
        // Parse TOML
        let parsed: unknown;
        try {
          parsed = toml.parse(fileContent);
        } catch (e) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
        const tomlRules = validationResult.data.rule ?? [];

        for (let i = 0; i < tomlRules.length; i++) {
          const rule = tomlRules[i];
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
        const parsedRules: PolicyRule[] = (validationResult.data.rule ?? [])
          .flatMap((rule) => {
            const argsPatterns = buildArgsPatterns(
              rule.argsPattern,
              rule.commandPrefix,
              rule.commandRegex,
            );

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
                  modes: rule.modes,
                  allowRedirection: rule.allow_redirection,
                  source: `${tierName.charAt(0).toUpperCase() + tierName.slice(1)}: ${file}`,
                  denyMessage: rule.deny_message,
                };

                // Compile regex pattern
                if (argsPattern) {
                  try {
                    new RegExp(argsPattern);
                  } catch (e) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
                    return null;
                  }

                  if (!isSafeRegExp(argsPattern)) {
                    errors.push({
                      filePath,
                      fileName: file,
                      tier: tierName,
                      errorType: 'regex_compilation',
                      message: 'Unsafe regex pattern (potential ReDoS)',
                      details: `Pattern: ${argsPattern}`,
                      suggestion:
                        'Avoid nested quantifiers or extremely long patterns',
                    });
                    return null;
                  }

                  policyRule.argsPattern = new RegExp(argsPattern);
                }

                return policyRule;
              });
            });
          })
          .filter((rule): rule is PolicyRule => rule !== null);

        rules.push(...parsedRules);

        // Transform checkers
        const parsedCheckers: SafetyCheckerRule[] = (
          validationResult.data.safety_checker ?? []
        )
          .flatMap((checker) => {
            const argsPatterns = buildArgsPatterns(
              checker.argsPattern,
              checker.commandPrefix,
              checker.commandRegex,
            );

            return argsPatterns.flatMap((argsPattern) => {
              const toolNames: Array<string | undefined> = checker.toolName
                ? Array.isArray(checker.toolName)
                  ? checker.toolName
                  : [checker.toolName]
                : [undefined];

              return toolNames.map((toolName) => {
                let effectiveToolName: string | undefined;
                if (checker.mcpName && toolName) {
                  effectiveToolName = `${checker.mcpName}__${toolName}`;
                } else if (checker.mcpName) {
                  effectiveToolName = `${checker.mcpName}__*`;
                } else {
                  effectiveToolName = toolName;
                }

                const safetyCheckerRule: SafetyCheckerRule = {
                  toolName: effectiveToolName,
                  priority: transformPriority(checker.priority, tier),
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                  checker: checker.checker as SafetyCheckerConfig,
                  modes: checker.modes,
                  source: `${tierName.charAt(0).toUpperCase() + tierName.slice(1)}: ${file}`,
                };

                if (argsPattern) {
                  try {
                    new RegExp(argsPattern);
                  } catch (e) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                    const error = e as Error;
                    errors.push({
                      filePath,
                      fileName: file,
                      tier: tierName,
                      errorType: 'regex_compilation',
                      message: 'Invalid regex pattern in safety checker',
                      details: `Pattern: ${argsPattern}\nError: ${error.message}`,
                    });
                    return null;
                  }

                  if (!isSafeRegExp(argsPattern)) {
                    errors.push({
                      filePath,
                      fileName: file,
                      tier: tierName,
                      errorType: 'regex_compilation',
                      message:
                        'Unsafe regex pattern in safety checker (potential ReDoS)',
                      details: `Pattern: ${argsPattern}`,
                    });
                    return null;
                  }

                  safetyCheckerRule.argsPattern = new RegExp(argsPattern);
                }

                return safetyCheckerRule;
              });
            });
          })
          .filter((checker): checker is SafetyCheckerRule => checker !== null);

        checkers.push(...parsedCheckers);
      } catch (e) {
        // Catch-all for unexpected errors
        if (!isNodeError(e) || e.code !== 'ENOENT') {
          errors.push({
            filePath,
            fileName: file,
            tier: tierName,
            errorType: 'file_read',
            message: 'Failed to read policy file',
            details: isNodeError(e) ? e.message : String(e),
          });
        }
      }
    }
  }

  return { rules, checkers, errors };
}
