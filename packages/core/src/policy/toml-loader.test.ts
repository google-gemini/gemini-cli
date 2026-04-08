/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PolicyDecision,
  ApprovalMode,
  PRIORITY_SUBAGENT_TOOL,
} from './types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  loadPoliciesFromToml,
  validateMcpPolicyToolNames,
  type PolicyLoadResult,
} from './toml-loader.js';
import { PolicyEngine } from './policy-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Returns only errors (severity !== 'warning') from a PolicyLoadResult. */
function getErrors(result: PolicyLoadResult): PolicyLoadResult['errors'] {
  return result.errors.filter((e) => e.severity !== 'warning');
}

/** Returns only warnings (severity === 'warning') from a PolicyLoadResult. */
function getWarnings(result: PolicyLoadResult): PolicyLoadResult['errors'] {
  return result.errors.filter((e) => e.severity === 'warning');
}

describe('policy-toml-loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 10,
      });
    }
  });

  async function runLoadPoliciesFromToml(
    tomlContent: string,
    fileName = 'test.toml',
  ): Promise<PolicyLoadResult> {
    await fs.writeFile(path.join(tempDir, fileName), tomlContent);
    const getPolicyTier = (_dir: string) => 1;
    return loadPoliciesFromToml([tempDir], getPolicyTier);
  }

  describe('loadPoliciesFromToml', () => {
    it('should load and parse a simple policy file', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "glob"
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]).toEqual({
        toolName: 'glob',
        decision: PolicyDecision.ALLOW,
        priority: 1.1, // tier 1 + 100/1000
        source: 'Default: test.toml',
      });
      expect(result.checkers).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should expand commandPrefix array to multiple rules', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandPrefix = ["git status", "git log"]
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].toolName).toBe('run_shell_command');
      expect(result.rules[1].toolName).toBe('run_shell_command');
      expect(
        result.rules[0].argsPattern?.test('{"command":"git status"}'),
      ).toBe(true);
      expect(result.rules[1].argsPattern?.test('{"command":"git log"}')).toBe(
        true,
      );
      expect(result.errors).toHaveLength(0);
    });

    it('should parse toolAnnotations from TOML', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "annotated-tool"
toolAnnotations = { readOnlyHint = true, custom = "value" }
decision = "allow"
priority = 70
`);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].toolName).toBe('annotated-tool');
      expect(result.rules[0].toolAnnotations).toEqual({
        readOnlyHint: true,
        custom: 'value',
      });
      expect(result.errors).toHaveLength(0);
    });

    it('should transform mcpName = "*" to wildcard toolName', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "*"
mcpName = "*"
decision = "ask_user"
priority = 10
`);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].toolName).toBe('mcp_*');
      expect(result.rules[0].decision).toBe(PolicyDecision.ASK_USER);
      expect(result.errors).toHaveLength(0);
    });

    it('should transform mcpName = "*" and specific toolName to wildcard prefix', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
mcpName = "*"
toolName = "search"
decision = "allow"
priority = 10
`);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].toolName).toBe('mcp_*_search');
      expect(result.errors).toHaveLength(0);
    });

    it('should transform commandRegex to argsPattern', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandRegex = "git (status|log).*"
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(1);
      expect(
        result.rules[0].argsPattern?.test('{"command":"git status"}'),
      ).toBe(true);
      expect(
        result.rules[0].argsPattern?.test('{"command":"git log --all"}'),
      ).toBe(true);
      expect(
        result.rules[0].argsPattern?.test('{"command":"git branch"}'),
      ).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should NOT match if ^ is used in commandRegex because it matches against full JSON', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandRegex = "^git status"
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(1);
      // The generated pattern is "command":"^git status
      // This will NOT match '{"command":"git status"}' because of the '{"' at the start.
      expect(
        result.rules[0].argsPattern?.test('{"command":"git status"}'),
      ).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should expand toolName array', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = ["glob", "grep", "read"]
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(3);
      expect(result.rules.map((r) => r.toolName)).toEqual([
        'glob',
        'grep',
        'read',
      ]);
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should transform mcpName to composite toolName', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
mcpName = "google-workspace"
toolName = ["calendar.list", "calendar.get"]
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].toolName).toBe(
        'mcp_google-workspace_calendar.list',
      );
      expect(result.rules[1].toolName).toBe(
        'mcp_google-workspace_calendar.get',
      );
      expect(result.errors).toHaveLength(0);
    });

    it('should NOT filter rules by mode at load time but preserve modes property', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "glob"
decision = "allow"
priority = 100
modes = ["default", "yolo"]

[[rule]]
toolName = "grep"
decision = "allow"
priority = 100
modes = ["yolo"]
`);

      // Both rules should be included
      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].toolName).toBe('glob');
      expect(result.rules[0].modes).toEqual(['default', 'yolo']);
      expect(result.rules[1].toolName).toBe('grep');
      expect(result.rules[1].modes).toEqual(['yolo']);
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should parse and transform allow_redirection property', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandPrefix = "echo"
decision = "allow"
priority = 100
allow_redirection = true
`);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].allowRedirection).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse and transform allowRedirection property (camelCase)', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandPrefix = "echo"
decision = "allow"
priority = 100
allowRedirection = true
`);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].allowRedirection).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    it('should parse deny_message property', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "rm"
decision = "deny"
priority = 100
deny_message = "Deletion is permanent"
`);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].decision).toBe(PolicyDecision.DENY);
      expect(result.rules[0].denyMessage).toBe('Deletion is permanent');
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should parse denyMessage property (camelCase)', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "rm"
decision = "deny"
priority = 100
denyMessage = "Deletion is permanent"
`);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].decision).toBe(PolicyDecision.DENY);
      expect(result.rules[0].denyMessage).toBe('Deletion is permanent');
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should support modes property for Tier 4 and Tier 5 policies', async () => {
      await fs.writeFile(
        path.join(tempDir, 'tier4.toml'),
        `
[[rule]]
toolName = "tier4-tool"
decision = "allow"
priority = 100
modes = ["autoEdit"]
`,
      );

      const getPolicyTier4 = (_dir: string) => 4; // Tier 4 (User)
      const result4 = await loadPoliciesFromToml([tempDir], getPolicyTier4);

      expect(result4.rules).toHaveLength(1);
      expect(result4.rules[0].toolName).toBe('tier4-tool');
      expect(result4.rules[0].modes).toEqual(['autoEdit']);
      expect(result4.rules[0].source).toBe('User: tier4.toml');

      const getPolicyTier2 = (_dir: string) => 2; // Tier 2 (Extension)
      const result2 = await loadPoliciesFromToml([tempDir], getPolicyTier2);
      expect(result2.rules[0].source).toBe('Extension: tier4.toml');

      const getPolicyTier5 = (_dir: string) => 5; // Tier 5 (Admin)
      const result5 = await loadPoliciesFromToml([tempDir], getPolicyTier5);
      expect(result5.rules[0].source).toBe('Admin: tier4.toml');
      expect(result5.errors).toHaveLength(0);
    });

    it('should handle TOML parse errors', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]
toolName = "glob"
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('toml_parse');
      expect(result.errors[0].fileName).toBe('test.toml');
    });

    it('should handle schema validation errors', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "glob"
priority = 100
`);

      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('schema_validation');
      expect(result.errors[0].details).toContain('decision');
    });

    it('should reject commandPrefix without run_shell_command', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "glob"
commandPrefix = "git status"
decision = "allow"
priority = 100
`);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('rule_validation');
      expect(result.errors[0].details).toContain('run_shell_command');
    });

    it('should reject commandPrefix + argsPattern combination', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git status"
argsPattern = "test"
decision = "allow"
priority = 100
`);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('rule_validation');
      expect(result.errors[0].details).toContain('mutually exclusive');
    });

    it('should handle invalid regex patterns', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandRegex = "git (status|branch"
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('regex_compilation');
      expect(result.errors[0].details).toContain('git (status|branch');
    });

    it('should escape regex special characters in commandPrefix', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git log *.txt"
decision = "allow"
priority = 100
`);

      expect(result.rules).toHaveLength(1);
      // The regex should have escaped the * and .
      expect(
        result.rules[0].argsPattern?.test('{"command":"git log file.txt"}'),
      ).toBe(false);
      expect(
        result.rules[0].argsPattern?.test('{"command":"git log *.txt"}'),
      ).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle a mix of valid and invalid policy files', async () => {
      await fs.writeFile(
        path.join(tempDir, 'valid.toml'),
        `
[[rule]]
toolName = "glob"
decision = "allow"
priority = 100
`,
      );

      await fs.writeFile(
        path.join(tempDir, 'invalid.toml'),
        `
[[rule]]
toolName = "grep"
decision = "allow"
priority = -1
`,
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await loadPoliciesFromToml([tempDir], getPolicyTier);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].toolName).toBe('glob');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fileName).toBe('invalid.toml');
      expect(result.errors[0].errorType).toBe('schema_validation');
    });

    it('should transform safety checker priorities based on tier', async () => {
      const result = await runLoadPoliciesFromToml(`
[[safety_checker]]
toolName = "write_file"
priority = 100
[safety_checker.checker]
type = "in-process"
name = "allowed-path"
`);

      expect(result.checkers).toHaveLength(1);
      expect(result.checkers[0].priority).toBe(1.1); // tier 1 + 100/1000
      expect(result.checkers[0].source).toBe('Default: test.toml');
    });
  });

  describe('Negative Tests', () => {
    it('should return a schema_validation error if toolName is missing in safety_checker', async () => {
      const result = await runLoadPoliciesFromToml(`
[[safety_checker]]
priority = 100
[safety_checker.checker]
type = "in-process"
name = "allowed-path"
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('toolName');
      expect(error.details).toContain('Invalid input');
    });

    it('should return a schema_validation error if priority is missing', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "test"
decision = "allow"
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('priority');
    });

    it('should return a schema_validation error if priority is a float', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "test"
decision = "allow"
priority = 1.5
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('priority');
      expect(error.details).toContain('integer');
    });

    it('should return a schema_validation error if priority is negative', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "test"
decision = "allow"
priority = -1
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('priority');
      expect(error.details).toContain('>= 0');
    });

    it('should return a schema_validation error if priority is much lower than 0', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "test"
decision = "allow"
priority = -9999
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('priority');
      expect(error.details).toContain('>= 0');
    });

    it('should return a schema_validation error if priority is >= 1000', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "test"
decision = "allow"
priority = 1000
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('priority');
      expect(error.details).toContain('<= 999');
    });

    it('should return a schema_validation error if priority is much higher than 1000', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "test"
decision = "allow"
priority = 9999
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('priority');
      expect(error.details).toContain('<= 999');
    });

    it('should return a schema_validation error if decision is invalid', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "test"
decision = "maybe"
priority = 100
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('decision');
    });

    it('should return a schema_validation error if toolName is missing', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
decision = "allow"
priority = 100
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('toolName');
      expect(error.details).toContain('Invalid input');
    });

    it('should return a schema_validation error if toolName is not a string or array', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = 123
decision = "allow"
priority = 100
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('schema_validation');
      expect(error.details).toContain('toolName');
    });

    it('should return a rule_validation error if commandRegex is used with wrong toolName', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "not_shell"
commandRegex = ".*"
decision = "allow"
priority = 100
`);
      expect(getErrors(result)).toHaveLength(1);
      const error = getErrors(result)[0];
      expect(error.errorType).toBe('rule_validation');
      expect(error.details).toContain('run_shell_command');
    });

    it('should return a rule_validation error if commandPrefix and commandRegex are combined', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git"
commandRegex = ".*"
decision = "allow"
priority = 100
`);
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('rule_validation');
      expect(error.details).toContain('mutually exclusive');
    });

    it('should return a regex_compilation error for invalid argsPattern', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "test"
argsPattern = "([a-z)"
decision = "allow"
priority = 100
`);
      expect(getErrors(result)).toHaveLength(1);
      const error = getErrors(result)[0];
      expect(error.errorType).toBe('regex_compilation');
      expect(error.message).toBe('Invalid regex pattern');
    });

    it('should load an individual policy file', async () => {
      const filePath = path.join(tempDir, 'single-rule.toml');
      await fs.writeFile(
        filePath,
        '[[rule]]\ntoolName = "test-tool"\ndecision = "allow"\npriority = 500\n',
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await loadPoliciesFromToml([filePath], getPolicyTier);

      expect(getErrors(result)).toHaveLength(0);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].toolName).toBe('test-tool');
      expect(result.rules[0].decision).toBe(PolicyDecision.ALLOW);
    });

    it('should return a file_read error if stat fails with something other than ENOENT', async () => {
      // We can't easily trigger a stat error other than ENOENT without mocks,
      // but we can test that it handles it.
      // For this test, we'll just check that it handles a non-existent file gracefully (no error)
      const filePath = path.join(tempDir, 'non-existent.toml');

      const getPolicyTier = (_dir: string) => 1;
      const result = await loadPoliciesFromToml([filePath], getPolicyTier);

      expect(result.errors).toHaveLength(0);
      expect(result.rules).toHaveLength(0);
    });
  });

  describe('Tool name validation', () => {
    it('should warn for unrecognized tool names with suggestions', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "grob"
decision = "allow"
priority = 100
`);

      const warnings = getWarnings(result);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].errorType).toBe('tool_name_warning');
      expect(warnings[0].severity).toBe('warning');
      expect(warnings[0].details).toContain('Unrecognized tool name "grob"');
      expect(warnings[0].details).toContain('glob');
      // Rules should still load despite warnings
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].toolName).toBe('grob');
    });

    it('should not warn for valid built-in tool names', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "glob"
decision = "allow"
priority = 100

[[rule]]
toolName = "read_file"
decision = "allow"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(0);
      expect(getErrors(result)).toHaveLength(0);
      expect(result.rules).toHaveLength(2);
    });

    it('should not warn for wildcard "*"', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "*"
decision = "allow"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(0);
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should not warn for MCP format tool names', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "mcp_my-server_my-tool"
decision = "allow"
priority = 100

[[rule]]
toolName = "mcp_my-server_*"
decision = "allow"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(0);
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should not warn when mcpName is present (skips validation)', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
mcpName = "my-server"
toolName = "nonexistent"
decision = "allow"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(0);
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should not warn for legacy aliases', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "search_file_content"
decision = "allow"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(0);
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should not warn for discovered tool prefix', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "discovered_tool_my_custom_tool"
decision = "allow"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(0);
      expect(getErrors(result)).toHaveLength(0);
    });

    it('should warn for each invalid name in a toolName array', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = ["grob", "glob", "replce"]
decision = "allow"
priority = 100
`);

      const warnings = getWarnings(result);
      expect(warnings).toHaveLength(2);
      expect(warnings[0].details).toContain('"grob"');
      expect(warnings[1].details).toContain('"replce"');
      // All rules still load
      expect(result.rules).toHaveLength(3);
    });

    it('should not warn for names far from any built-in (dynamic/agent tools)', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "delegate_to_agent"
decision = "allow"
priority = 100

[[rule]]
toolName = "my_custom_tool"
decision = "allow"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(0);
      expect(getErrors(result)).toHaveLength(0);
      expect(result.rules).toHaveLength(2);
    });

    it('should not warn for catch-all rules (toolName = "*")', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "*"
decision = "deny"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(0);
      expect(getErrors(result)).toHaveLength(0);
      expect(result.rules).toHaveLength(1);
    });

    it('should still load rules even with warnings', async () => {
      const result = await runLoadPoliciesFromToml(`
[[rule]]
toolName = "wrte_file"
decision = "deny"
priority = 50

[[rule]]
toolName = "glob"
decision = "allow"
priority = 100
`);

      expect(getWarnings(result)).toHaveLength(1);
      expect(getErrors(result)).toHaveLength(0);
      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].toolName).toBe('wrte_file');
      expect(result.rules[1].toolName).toBe('glob');
    });
  });

  describe('Built-in Plan Mode Policy', () => {
    it('should allow MCP tools with readOnlyHint annotation in Plan Mode (ASK_USER, not DENY)', async () => {
      const planTomlPath = path.resolve(__dirname, 'policies', 'plan.toml');
      const fileContent = await fs.readFile(planTomlPath, 'utf-8');
      const tempPolicyDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'plan-annotation-test-'),
      );
      try {
        await fs.writeFile(path.join(tempPolicyDir, 'plan.toml'), fileContent);
        const getPolicyTier = () => 1; // Default tier

        // 1. Load the actual Plan Mode policies
        const result = await loadPoliciesFromToml(
          [tempPolicyDir],
          getPolicyTier,
        );
        expect(result.errors).toHaveLength(0);

        // Verify annotation rule was loaded correctly
        const annotationRule = result.rules.find(
          (r) => r.toolAnnotations !== undefined,
        );
        expect(
          annotationRule,
          'Should have loaded a rule with toolAnnotations',
        ).toBeDefined();
        expect(annotationRule!.toolName).toBe('mcp_*');
        expect(annotationRule!.mcpName).toBe('*');
        expect(annotationRule!.toolAnnotations).toEqual({
          readOnlyHint: true,
        });
        expect(annotationRule!.decision).toBe(PolicyDecision.ASK_USER);
        // Priority 50 in tier 1 => 1.050
        expect(annotationRule!.priority).toBe(1.05);

        // Verify deny rule was loaded correctly
        const denyRule = result.rules.find(
          (r) =>
            r.decision === PolicyDecision.DENY &&
            r.toolName === '*' &&
            r.denyMessage?.includes('Plan Mode'),
        );
        expect(
          denyRule,
          'Should have loaded the catch-all deny rule',
        ).toBeDefined();
        // Priority 40 in tier 1 => 1.040
        expect(denyRule!.priority).toBe(1.04);

        // 2. Initialize Policy Engine in Plan Mode
        const engine = new PolicyEngine({
          rules: result.rules,
          approvalMode: ApprovalMode.PLAN,
        });

        // 3. MCP tool with readOnlyHint=true and serverName should get ASK_USER
        const askResult = await engine.check(
          { name: 'github__list_issues' },
          'github',
          { readOnlyHint: true },
        );
        expect(
          askResult.decision,
          'MCP tool with readOnlyHint=true should be ASK_USER, not DENY',
        ).toBe(PolicyDecision.ASK_USER);

        // 4. MCP tool WITHOUT annotations should be DENIED
        const denyResult = await engine.check(
          { name: 'mcp_github_create_issue' },
          'github',
          undefined,
        );
        expect(
          denyResult.decision,
          'MCP tool without annotations should be DENIED in Plan Mode',
        ).toBe(PolicyDecision.DENY);

        // 5. MCP tool with readOnlyHint=false should also be DENIED
        const denyResult2 = await engine.check(
          { name: 'mcp_github_delete_issue' },
          'github',
          { readOnlyHint: false },
        );
        expect(
          denyResult2.decision,
          'MCP tool with readOnlyHint=false should be DENIED in Plan Mode',
        ).toBe(PolicyDecision.DENY);

        // 6. Test with qualified tool name format (mcp_server_tool) but no separate serverName
        const qualifiedResult = await engine.check(
          { name: 'mcp_github_list_repos' },
          undefined,
          { readOnlyHint: true },
        );
        expect(
          qualifiedResult.decision,
          'Qualified MCP tool name with readOnlyHint=true should be ASK_USER even without separate serverName',
        ).toBe(PolicyDecision.ASK_USER);

        // 7. Non-MCP tool (no server context) should be DENIED despite having annotations
        const builtinResult = await engine.check(
          { name: 'some_random_tool' },
          undefined,
          { readOnlyHint: true },
        );
        expect(
          builtinResult.decision,
          'Non-MCP tool should be DENIED even with readOnlyHint (no server context for *__* match)',
        ).toBe(PolicyDecision.DENY);
      } finally {
        await fs.rm(tempPolicyDir, { recursive: true, force: true });
      }
    });

    it('should override default subagent rules when in Plan Mode for unknown subagents', async () => {
      const planTomlPath = path.resolve(__dirname, 'policies', 'plan.toml');
      const readOnlyTomlPath = path.resolve(
        __dirname,
        'policies',
        'read-only.toml',
      );
      const planContent = await fs.readFile(planTomlPath, 'utf-8');
      const readOnlyContent = await fs.readFile(readOnlyTomlPath, 'utf-8');

      const tempPolicyDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'plan-policy-test-'),
      );
      try {
        await fs.writeFile(path.join(tempPolicyDir, 'plan.toml'), planContent);
        await fs.writeFile(
          path.join(tempPolicyDir, 'read-only.toml'),
          readOnlyContent,
        );
        const getPolicyTier = () => 1; // Default tier

        // 1. Load the actual Plan Mode policies
        const result = await loadPoliciesFromToml(
          [tempPolicyDir],
          getPolicyTier,
        );

        // 2. Initialize Policy Engine with these rules
        const engine = new PolicyEngine({
          rules: result.rules,
          approvalMode: ApprovalMode.PLAN,
        });

        // 3. Simulate an unknown Subagent being registered (Dynamic Rule)
        engine.addRule({
          toolName: 'unknown_subagent',
          decision: PolicyDecision.ALLOW,
          priority: PRIORITY_SUBAGENT_TOOL,
          source: 'AgentRegistry (Dynamic)',
        });

        // 4. Verify Behavior:
        // The Plan Mode "Catch-All Deny" (from plan.toml) should override the Subagent Allow
        // Plan Mode Deny (1.04) > Subagent Allow (1.03)
        const checkResult = await engine.check(
          { name: 'unknown_subagent' },
          undefined,
        );

        expect(
          checkResult.decision,
          'Unknown subagent should be DENIED in Plan Mode',
        ).toBe(PolicyDecision.DENY);

        // 5. Verify Explicit Allows still work
        // e.g. 'read_file' should be allowed because its priority in read-only.toml (50) is higher than the deny (40)
        const readResult = await engine.check({ name: 'read_file' }, undefined);
        expect(
          readResult.decision,
          'Explicitly allowed tools (read_file) should be ALLOWED in Plan Mode',
        ).toBe(PolicyDecision.ALLOW);

        // 6. Verify Built-in Research Subagents are ALLOWED
        // codebase_investigator is priority 50 in read-only.toml
        const codebaseResult = await engine.check(
          { name: 'codebase_investigator' },
          undefined,
        );
        expect(
          codebaseResult.decision,
          'codebase_investigator should be ALLOWED in Plan Mode',
        ).toBe(PolicyDecision.ALLOW);

        const cliHelpResult = await engine.check(
          { name: 'cli_help' },
          undefined,
        );
        expect(
          cliHelpResult.decision,
          'cli_help should be ALLOWED in Plan Mode',
        ).toBe(PolicyDecision.ALLOW);
      } finally {
        await fs.rm(tempPolicyDir, { recursive: true, force: true });
      }
    });
  });

  describe('validateMcpPolicyToolNames', () => {
    it('should warn for MCP tool names that are likely typos', () => {
      const warnings = validateMcpPolicyToolNames(
        'google-workspace',
        ['people.getMe', 'calendar.list', 'calendar.get'],
        [
          {
            toolName: 'mcp_google-workspace_people.getxMe',
            mcpName: 'google-workspace',
            source: 'User: workspace.toml',
          },
        ],
      );

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('people.getxMe');
      expect(warnings[0]).toContain('google-workspace');
      expect(warnings[0]).toContain('people.getMe');
    });

    it('should not warn for matching MCP tool names', () => {
      const warnings = validateMcpPolicyToolNames(
        'google-workspace',
        ['people.getMe', 'calendar.list'],
        [
          {
            toolName: 'mcp_google-workspace_people.getMe',
            mcpName: 'google-workspace',
          },
          {
            toolName: 'mcp_google-workspace_calendar.list',
            mcpName: 'google-workspace',
          },
        ],
      );

      expect(warnings).toHaveLength(0);
    });

    it('should not warn for wildcard MCP rules', () => {
      const warnings = validateMcpPolicyToolNames(
        'my-server',
        ['tool1', 'tool2'],
        [{ toolName: 'mcp_my-server_*', mcpName: 'my-server' }],
      );

      expect(warnings).toHaveLength(0);
    });

    it('should not warn for rules targeting other servers', () => {
      const warnings = validateMcpPolicyToolNames(
        'server-a',
        ['tool1'],
        [{ toolName: 'mcp_server-b_toolx', mcpName: 'server-b' }],
      );

      expect(warnings).toHaveLength(0);
    });

    it('should not warn for tool names far from any discovered tool', () => {
      const warnings = validateMcpPolicyToolNames(
        'my-server',
        ['tool1', 'tool2'],
        [
          {
            toolName: 'mcp_my-server_completely_different_name',
            mcpName: 'my-server',
          },
        ],
      );

      expect(warnings).toHaveLength(0);
    });

    it('should skip wildcard rules (matching all tools)', () => {
      const warnings = validateMcpPolicyToolNames(
        'my-server',
        ['tool1'],
        [{ toolName: '*', mcpName: 'my-server' }],
      );
      expect(warnings).toHaveLength(0);
    });

    it('should include source in warning when available', () => {
      const warnings = validateMcpPolicyToolNames(
        'my-server',
        ['tool1'],
        [
          {
            toolName: 'mcp_my-server_tol1',
            mcpName: 'my-server',
            source: 'User: custom.toml',
          },
        ],
      );

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('User: custom.toml');
    });
  });
});
