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

  it('should allow save_memory to read the user config GEMINI.md', async () => {
    const toolCall = {
      name: 'read_file',
      args: { file_path: '~/.config/gemini-cli/GEMINI.md' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should allow save_memory to write the user config GEMINI.md', async () => {
    const toolCall = {
      name: 'write_file',
      args: { file_path: '~/.config/gemini-cli/GEMINI.md', content: 'test' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should allow save_memory to replace the user config GEMINI.md', async () => {
    const toolCall = {
      name: 'replace',
      args: {
        file_path: '~/.config/gemini-cli/GEMINI.md',
        old_string: 'old',
        new_string: 'new',
      },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should deny save_memory reading non-GEMINI files in the user config dir', async () => {
    const toolCall = {
      name: 'read_file',
      args: { file_path: '~/.config/gemini-cli/settings.json' },
    };
    const result = await engine.check(
      toolCall,
      undefined,
      undefined,
      'save_memory',
    );
    expect(result.decision).toBe(PolicyDecision.DENY);
    expect(result.rule?.denyMessage).toContain(
      'Memory Manager may only access GEMINI.md files.',
    );
  });

  it('should deny save_memory reading non-GEMINI files outside the user config dir', async () => {
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
    expect(result.decision).toBe(PolicyDecision.DENY);
    expect(result.rule?.denyMessage).toContain(
      'Memory Manager may only access GEMINI.md files.',
    );
  });

  it('should deny save_memory when the path is not a GEMINI.md file', async () => {
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
    expect(result.decision).toBe(PolicyDecision.DENY);
  });

  it('should fall through to global allow rule for other agents accessing the user config folder', async () => {
    const toolCall = {
      name: 'read_file',
      args: { file_path: '~/.config/gemini-cli/GEMINI.md' },
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
