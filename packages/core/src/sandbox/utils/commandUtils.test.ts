/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getCommandName } from './commandUtils.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';

describe('commandUtils.getCommandName', () => {
  it('extracts command name for unwrapped commands', async () => {
    const req: SandboxRequest = {
      command: 'git',
      args: ['status'],
      cwd: '/test',
      env: {},
    };
    expect(await getCommandName(req)).toBe('git');
  });

  it('extracts command name for POSIX wrapped commands ignoring trap', async () => {
    const wrappedCmd = [
      "_bgpids_file='/tmp/gemini-shell-123/bgpids.tmp'",
      '(',
      '  trap \'jobs -p > "$_bgpids_file"\' EXIT',
      './gradlew build',
      ')',
      '__code=$?',
      'exit $__code',
    ].join('\n');

    const req: SandboxRequest = {
      command: 'bash',
      args: ['-c', wrappedCmd],
      cwd: '/test',
      env: {},
    };
    expect(await getCommandName(req)).toBe('./gradlew');
  });

  it('extracts command name ignoring shopt, set, and trap', async () => {
    const wrappedCmd = [
      "_bgpids_file='/tmp/gemini-shell-123/bgpids.tmp'",
      '(',
      '  trap \'jobs -p > "$_bgpids_file"\' EXIT',
      '  set -e',
      '  shopt -u nullglob',
      'npm test',
      ')',
      '__code=$?',
      'exit $__code',
    ].join('\n');

    const req: SandboxRequest = {
      command: 'sh',
      args: ['-c', wrappedCmd],
      cwd: '/test',
      env: {},
    };
    expect(await getCommandName(req)).toBe('npm');
  });
});
