/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { createElement } from 'react';
import { DinoGame } from '../components/DinoGame.js';

export const dinoCommand: SlashCommand = {
  name: 'dino',
  description: 'Play the terminal dinosaur game',
  hidden: true,
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => ({
      type: 'custom_dialog',
      component: createElement(DinoGame, {
        onExit: () => context.ui.removeComponent(),
      }),
    }),
};
