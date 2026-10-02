/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';

const out = (line: string): void => {
  process.stdout.write(line + '\n');
};
const err = (line: string): void => {
  process.stderr.write(line + '\n');
};

/**
 * `gemini von-install` — set up the Von System One decision backend used by
 * `/superfast`.
 *
 * The fork itself never bundles the model: the Decision Gate talks to a local
 * HTTP endpoint, and this command provisions that endpoint's server
 * out-of-band. Von is chosen because it is Apache-2.0, small (~1.5 GB), and
 * runs on CPU, CUDA, ROCm, Apple Metal, or Intel iGPU — so the option is
 * accessible on essentially any machine, including laptops with no discrete
 * GPU.
 */
export const vonInstallCommand: CommandModule = {
  command: 'von-install',
  describe:
    'Install the Von System One decision backend for /superfast (Apache-2.0, runs on CPU or GPU)',
  builder: (yargs) =>
    yargs
      .option('check', {
        type: 'boolean',
        default: false,
        describe: 'Only report whether the backend is already installed',
      })
      .strict(),
  handler: async (argv) => {
    const { spawnSync } = await import('node:child_process');

    // Detect a Python package manager. `uv` is preferred (fast, isolated);
    // `pip` is the universal fallback. We never assume a specific interpreter
    // path — we probe what is on PATH so this works on any machine and OS.
    const has = (cmd: string, versionArgs: string[]): boolean => {
      try {
        const r = spawnSync(cmd, versionArgs, { stdio: 'ignore' });
        return !r.error && r.status === 0;
      } catch {
        return false;
      }
    };

    const alreadyInstalled = has('von', ['--version']);
    if (alreadyInstalled) {
      out('Von is already installed.');
      out('Start the decision server with:  von serve --port 8000');
      out('Then enable the gate in Gemini CLI with:  /superfast on');
      return;
    }

    if (argv['check']) {
      out('Von is not installed.');
      out(
        'Run `gemini von-install` (without --check) to install it, or install manually:',
      );
      out('  uv tool install von-sdk   # or:  pip install von-sdk');
      process.exitCode = 1;
      return;
    }

    const useUv = has('uv', ['--version']);
    const installCmd = useUv ? 'uv' : 'pip';
    const installArgs = useUv
      ? ['tool', 'install', 'von-sdk']
      : ['install', 'von-sdk'];

    if (!useUv && !has('pip', ['--version'])) {
      err(
        'Neither `uv` nor `pip` was found on PATH. Install a Python 3.12+ ' +
          'package manager, then re-run `gemini von-install`.',
      );
      process.exitCode = 1;
      return;
    }

    out(
      `Installing the Von backend with: ${installCmd} ${installArgs.join(' ')}`,
    );
    const result = spawnSync(installCmd, installArgs, { stdio: 'inherit' });
    if (result.status !== 0) {
      err(
        'Von installation failed. You can install it manually with ' +
          '`uv tool install von-sdk` or `pip install von-sdk`.',
      );
      process.exitCode = result.status ?? 1;
      return;
    }

    out('Von installed.');
    out('Next steps:');
    out('  1. Start the decision server:  von serve --port 8000');
    out('  2. In Gemini CLI:              /superfast on');
    out(
      '  (The gate fails open, so Gemini CLI keeps working even if the ' +
        'server is not running.)',
    );
  },
};
