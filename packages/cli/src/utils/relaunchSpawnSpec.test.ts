/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildRelaunchSpawnSpec } from './relaunchSpawnSpec.js';

describe('buildRelaunchSpawnSpec', () => {
  it('preserves node-style relaunch arguments for source installs', () => {
    const { args, env } = buildRelaunchSpawnSpec({
      additionalNodeArgs: ['--max-old-space-size=4096'],
      additionalScriptArgs: ['--model', 'gemini-2.5-pro'],
      argv: ['/usr/bin/node', '/app/cli.js', 'command', '--verbose'],
      env: { PATH: '/usr/bin' },
      execArgv: ['--inspect=9229'],
    });

    expect(args).toEqual([
      '--inspect=9229',
      '--max-old-space-size=4096',
      '/app/cli.js',
      '--model',
      'gemini-2.5-pro',
      'command',
      '--verbose',
    ]);
    expect(env).toMatchObject({
      GEMINI_CLI_NO_RELAUNCH: 'true',
      PATH: '/usr/bin',
    });
    expect(env['NODE_OPTIONS']).toBeUndefined();
  });

  it('moves node flags into NODE_OPTIONS for standalone binaries', () => {
    const { args, env } = buildRelaunchSpawnSpec({
      additionalNodeArgs: ['--max-old-space-size=4096'],
      additionalScriptArgs: ['--model', 'gemini-2.5-pro'],
      argv: ['/tmp/gemini', '/tmp/gemini', '--verbose'],
      env: {
        IS_BINARY: 'true',
        NODE_OPTIONS: '--trace-warnings',
        PATH: '/usr/bin',
      },
      execArgv: ['--inspect=9229'],
    });

    expect(args).toEqual(['--model', 'gemini-2.5-pro', '--verbose']);
    expect(env).toMatchObject({
      GEMINI_CLI_NO_RELAUNCH: 'true',
      IS_BINARY: 'true',
      NODE_OPTIONS: '--trace-warnings --max-old-space-size=4096',
      PATH: '/usr/bin',
    });
  });
});
