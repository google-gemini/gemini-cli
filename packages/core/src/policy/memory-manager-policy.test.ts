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

  it('should NOT allow save_memory to read other files', async () => {
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
    // It should fallback to default (ASK_USER) or be denied if specifically matched
    // In our case, it doesn't match the argsPattern, so it falls through.
    // Default in our engine setup is ASK_USER.
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should NOT allow other agents to access ~/.gemini/ automatically', async () => {
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
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });
});
