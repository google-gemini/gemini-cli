/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { resolve } from 'node:path';
import React from 'react';
import { render } from 'ink';
import RepoVisualizer from '../ui/RepoVisualizer.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { runExitCleanup } from '../utils/cleanup.js';
import { ExitCodes } from '@google/gemini-cli-core';

interface VisualizeArgs {
  path?: string;
  isCommand?: boolean;
}

export const visualizeCommand: CommandModule<object, VisualizeArgs> = {
  command: 'visualize [path]',
  aliases: ['viz', 'tree'],
  describe: 'Open an interactive repository structure visualizer',

  builder: (yargs: Argv) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true; // prevents interactive UI from launching
      })
      .positional('path', {
        type: 'string',
        description:
          'Path to the repository root (defaults to current directory)',
      })
      .version(false),

  async handler(argv) {
    const targetPath = argv.path ? resolve(argv.path) : process.cwd();

    const { waitUntilExit } = render(
      React.createElement(RepoVisualizer, { repoPath: targetPath }),
    );

    await waitUntilExit();
    await runExitCleanup();
    process.exit(ExitCodes.SUCCESS);
  },
};
