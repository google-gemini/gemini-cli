/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestRig,
} from './test-helper.js';

describe('shell-parity', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should use run_shell_command for replace when sandboxing is enabled', async () => {
    await rig.setup('should use run_shell_command for replace when sandboxing is enabled', {
      settings: {
        security: { toolSandboxing: true },
      },
    });
    rig.createFile('test.ts', 'const foo = "bar";');

    // We expect the model to use run_shell_command because edit/replace/write_file are filtered out.
    const result = await rig.run({
      args: `Replace "bar" with "baz" in test.ts`,
    });

    // Verify forbidden tools were NOT used
    const forbiddenTools = ['grep_search', 'replace', 'write_file', 'edit', 'read_file'];
    const toolLogs = rig.readToolLogs();
    const usedForbidden = toolLogs.filter((t) =>
      forbiddenTools.includes(t.toolRequest.name),
    );
    expect(usedForbidden).toHaveLength(0);

    // Verify run_shell_command was used
    const shellCall = await rig.waitForToolCall('run_shell_command');
    expect(shellCall).toBeTruthy();

    // Verify the command looks like a replace operation
    const command = shellCall!.args.command as string;
    // It should contain some form of replacement (sed, perl, or powershell -replace)
    expect(command).toMatch(/sed|replace|Set-Content|perl/i);

    // Verify file content changed
    const content = rig.readFile('test.ts');
    expect(content).toContain('baz');
    expect(content).not.toContain('"bar"');
  });

  it('should use run_shell_command for search when sandboxing is enabled', async () => {
    await rig.setup('should use run_shell_command for search when sandboxing is enabled', {
      settings: {
        security: { toolSandboxing: true },
      },
    });
    rig.createFile('search-me.txt', 'target-string');

    await rig.run({
      args: `Search for "target-string" in search-me.txt`,
    });

    // Verify grep_search was NOT used
    const toolLogs = rig.readToolLogs();
    const usedGrep = toolLogs.filter((t) => t.toolRequest.name === 'grep_search');
    expect(usedGrep).toHaveLength(0);

    // Verify run_shell_command was used
    const shellCall = await rig.waitForToolCall('run_shell_command');
    expect(shellCall).toBeTruthy();

    const command = shellCall!.args.command as string;
    expect(command).toMatch(/grep|rg|ripgrep|Select-String|findstr/i);
  });

  it('should use run_shell_command for read when sandboxing is enabled', async () => {
    await rig.setup('should use run_shell_command for read when sandboxing is enabled', {
      settings: {
        security: { toolSandboxing: true },
      },
    });
    rig.createFile('read-me.txt', 'hello world');

    const result = await rig.run({
      args: `Read the file read-me.txt and tell me what it says`,
    });

    // Verify read_file was NOT used
    const toolLogs = rig.readToolLogs();
    const usedRead = toolLogs.filter((t) => t.toolRequest.name === 'read_file');
    expect(usedRead).toHaveLength(0);

    // Verify run_shell_command was used
    const shellCall = await rig.waitForToolCall('run_shell_command');
    expect(shellCall).toBeTruthy();

    const command = shellCall!.args.command as string;
    expect(command).toMatch(/cat|head|tail|less|more|Get-Content|type/i);

    expect(result).toContain('hello world');
  });
});
