/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { debuggerCommand } from './debuggerCommand.js';

describe('debuggerCommand', () => {
  it('should have correct name and kind', () => {
    expect(debuggerCommand.name).toBe('debugger');
    expect(debuggerCommand.kind).toBe('built-in');
  });

  it('should have a non-empty description', () => {
    expect(debuggerCommand.description).toBeTruthy();
    expect(debuggerCommand.description.length).toBeGreaterThan(10);
  });

  it('should have exactly 4 subcommands', () => {
    expect(debuggerCommand.subCommands).toBeDefined();
    expect(debuggerCommand.subCommands).toHaveLength(4);

    const names = debuggerCommand.subCommands!.map((s) => s.name);
    expect(names).toContain('launch');
    expect(names).toContain('attach');
    expect(names).toContain('status');
    expect(names).toContain('disconnect');
  });

  it('should have descriptions on all subcommands', () => {
    for (const sub of debuggerCommand.subCommands!) {
      expect(sub.description).toBeTruthy();
      expect(sub.description.length).toBeGreaterThan(5);
    }
  });

  // Cast helper — all actions return Promise<SlashCommandActionReturn>
  const ctx = {} as Parameters<NonNullable<typeof debuggerCommand.action>>[0];
  type AnyResult = Record<string, unknown>;

  // -----------------------------------------------------------------------
  // Main command
  // -----------------------------------------------------------------------

  describe('main action', () => {
    it('returns info help text when no args', async () => {
      const result = (await debuggerCommand.action!(ctx, '')) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('/debugger launch');
      expect(result.content).toContain('/debugger attach');
      expect(result.content).toContain('/debugger status');
      expect(result.content).toContain('/debugger disconnect');
    });

    // Edge: whitespace-only args should be treated as empty
    it('returns help text for whitespace-only args', async () => {
      const result = (await debuggerCommand.action!(ctx, '   ')) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
    });

    // Edge: undefined args (can happen if action is called without second param)
    it('returns help text when args is undefined', async () => {
      const result = (await debuggerCommand.action!(
        ctx,
        undefined as unknown as string,
      )) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
    });

    it('returns info for unrecognized subcommand text', async () => {
      const result = (await debuggerCommand.action!(
        ctx,
        'my app crashes on login',
      )) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.content).toContain('my app crashes on login');
    });
  });

  // -----------------------------------------------------------------------
  // /debugger launch
  // -----------------------------------------------------------------------

  describe('launch subcommand', () => {
    const launchCmd = () =>
      debuggerCommand.subCommands!.find((s) => s.name === 'launch')!;

    it('returns error when program is missing', async () => {
      const result = (await launchCmd().action!(ctx, '')) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('Missing program path');
    });

    // Edge: whitespace-only = no program
    it('returns error for whitespace-only program', async () => {
      const result = (await launchCmd().action!(ctx, '    \t  ')) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
    });

    // Edge: undefined args
    it('returns error for undefined args', async () => {
      const result = (await launchCmd().action!(
        ctx,
        undefined as unknown as string,
      )) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
    });

    it('returns submit_prompt with program path', async () => {
      const result = (await launchCmd().action!(
        ctx,
        './src/index.js',
      )) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('./src/index.js');
      expect(result.content).toContain('debug_launch');
    });

    // Edge: path with spaces (should be preserved)
    it('preserves paths with spaces', async () => {
      const result = (await launchCmd().action!(
        ctx,
        '/my project/src/app.js',
      )) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('/my project/src/app.js');
    });

    // Edge: relative vs absolute paths
    it('works with absolute paths', async () => {
      const result = (await launchCmd().action!(
        ctx,
        '/usr/local/bin/node',
      )) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('/usr/local/bin/node');
    });
  });

  // -----------------------------------------------------------------------
  // /debugger attach
  // -----------------------------------------------------------------------

  describe('attach subcommand', () => {
    const attachCmd = () =>
      debuggerCommand.subCommands!.find((s) => s.name === 'attach')!;

    it('returns error when port is missing', async () => {
      const result = (await attachCmd().action!(ctx, '')) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('Missing port');
    });

    // Edge: whitespace-only = no port
    it('returns error for whitespace-only args', async () => {
      const result = (await attachCmd().action!(ctx, '   ')) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
    });

    // Edge: undefined args
    it('returns error for undefined args', async () => {
      const result = (await attachCmd().action!(
        ctx,
        undefined as unknown as string,
      )) as AnyResult;
      expect(result.type).toBe('message');
      expect(result.messageType).toBe('error');
    });

    it('returns submit_prompt with default host', async () => {
      const result = (await attachCmd().action!(ctx, '9229')) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('9229');
      expect(result.content).toContain('127.0.0.1');
    });

    it('accepts custom host', async () => {
      const result = (await attachCmd().action!(
        ctx,
        '9229 192.168.1.100',
      )) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('9229');
      expect(result.content).toContain('192.168.1.100');
    });

    // Edge: extra arguments after host are ignored gracefully
    it('ignores extra args beyond port and host', async () => {
      const result = (await attachCmd().action!(
        ctx,
        '9229 localhost extra-junk',
      )) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('localhost');
    });

    // Edge: non-numeric port (still passes — validation happens in tool)
    it('passes non-numeric port to the LLM (tool validates)', async () => {
      const result = (await attachCmd().action!(ctx, 'abc')) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('abc');
    });
  });

  // -----------------------------------------------------------------------
  // /debugger status
  // -----------------------------------------------------------------------

  describe('status subcommand', () => {
    it('returns submit_prompt for status check', async () => {
      const statusCmd = debuggerCommand.subCommands!.find(
        (s) => s.name === 'status',
      )!;
      const result = (await statusCmd.action!(ctx, '')) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('debug session status');
    });
  });

  // -----------------------------------------------------------------------
  // /debugger disconnect
  // -----------------------------------------------------------------------

  describe('disconnect subcommand', () => {
    it('returns submit_prompt to disconnect', async () => {
      const disconnectCmd = debuggerCommand.subCommands!.find(
        (s) => s.name === 'disconnect',
      )!;
      const result = (await disconnectCmd.action!(ctx, '')) as AnyResult;
      expect(result.type).toBe('submit_prompt');
      expect(result.content).toContain('debug_disconnect');
    });
  });
});
