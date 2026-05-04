/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { loadPoliciesFromToml } from './toml-loader.js';
import { PolicyDecision, ApprovalMode } from './types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Memory Manager Policy', () => {
  let engine: PolicyEngine;

  beforeEach(async () => {
    const policiesDir = path.join(__dirname, 'policies');
    const result = await loadPoliciesFromToml([policiesDir], () => 1);
    engine = new PolicyEngine({
      rules: result.rules,
      approvalMode: ApprovalMode.DEFAULT,
    });
  });

  it('should allow save_memory to read ~/.gemini/GEMINI.md', async () => {
    const toolCall = {
      name: 'read_file',
      args: { file_path: '~/.gemini/GEMINI.md' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should allow save_memory to write ~/.gemini/GEMINI.md', async () => {
    const toolCall = {
      name: 'write_file',
      args: { file_path: '~/.gemini/GEMINI.md', content: 'test' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should allow save_memory to list ~/.gemini/', async () => {
    const toolCall = {
      name: 'list_directory',
      args: { dir_path: '~/.gemini/' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should fall through to global allow rule for save_memory reading non-.gemini files', async () => {
    const toolCall = {
      name: 'read_file',
      args: { file_path: '/etc/passwd' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    // The memory-manager policy only matches .gemini/ paths.
    // Other paths fall through to the global read_file allow rule (priority 50).
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should not match paths where .gemini is a substring (e.g. not.gemini)', async () => {
    const toolCall = {
      name: 'read_file',
      args: { file_path: '/tmp/not.gemini/evil' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    // The tighter argsPattern requires .gemini/ to be preceded by start-of-string
    // or a path separator, so "not.gemini/" should NOT match the memory-manager rule.
    // It falls through to the global read_file allow rule instead.
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should fall through to global allow rule for other agents accessing ~/.gemini/', async () => {
    const toolCall = {
      name: 'read_file',
      args: { file_path: '~/.gemini/GEMINI.md' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'other_agent',
    );
    // The memory-manager policy rule (priority 100) only applies to 'save_memory'.
    // Other agents fall through to the global read_file allow rule (priority 50).
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });
});
