/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolicyDecision } from './types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadPoliciesFromToml } from './toml-loader.js';
import type { PolicyLoadResult } from './toml-loader.js';

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
      expect(result.errors).toHaveLength(0);
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
      expect(result.rules[0].toolName).toBe('google-workspace__calendar.list');
      expect(result.rules[1].toolName).toBe('google-workspace__calendar.get');
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
      expect(result.errors).toHaveLength(0);
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

    it('should support modes property for Tier 2 and Tier 3 policies', async () => {
      await fs.writeFile(
        path.join(tempDir, 'tier2.toml'),
        `
[[rule]]
toolName = "tier2-tool"
decision = "allow"
priority = 100
modes = ["autoEdit"]
`,
      );

      const getPolicyTier = (_dir: string) => 2; // Tier 2
      const result = await loadPoliciesFromToml([tempDir], getPolicyTier);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].toolName).toBe('tier2-tool');
      expect(result.rules[0].modes).toEqual(['autoEdit']);
      expect(result.rules[0].source).toBe('User: tier2.toml');
      expect(result.errors).toHaveLength(0);
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
  });

  describe('Negative Tests', () => {
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
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
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
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('regex_compilation');
      expect(error.message).toBe('Invalid regex pattern');
    });

    it('should return a file_read error if readdir fails', async () => {
      // Create a file and pass it as a directory to trigger ENOTDIR
      const filePath = path.join(tempDir, 'not-a-dir');
      await fs.writeFile(filePath, 'content');

      const getPolicyTier = (_dir: string) => 1;
      const result = await loadPoliciesFromToml([filePath], getPolicyTier);

      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.errorType).toBe('file_read');
      expect(error.message).toContain('Failed to read policy directory');
    });
  });
});
