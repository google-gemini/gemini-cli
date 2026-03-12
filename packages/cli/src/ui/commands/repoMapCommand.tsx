/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import { buildRepoTree } from '@google/gemini-cli-core';
import { InteractiveRepoMap } from '../components/InteractiveRepoMap.js';

export const repoMapCommand: SlashCommand = {
  name: 'repo-map',
  description: 'Visualizes the repository tree structure.',
  kind: CommandKind.BUILT_IN,
  suggestionGroup: 'Project',
  action: async (context: CommandContext) => {
    const projectRoot = context.services.config?.getProjectRoot();
    if (!projectRoot) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Error: Outside of a project workspace. Cannot build repository tree.',
      });
      return;
    }

    context.ui.setPendingItem({
      type: MessageType.INFO,
      text: 'Generating repository map...',
    });

    try {
      const tree = await buildRepoTree({ projectRoot });

      context.ui.setPendingItem(null);

      return {
        type: 'custom_dialog',
        component: (
          <InteractiveRepoMap
            tree={tree}
            onClose={() => context.ui.removeComponent()}
          />
        ),
      };
    } catch (e: unknown) {
      context.ui.setPendingItem(null);
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Error generating repository map: ${e instanceof Error ? e.message : String(e)}`,
      });
      return;
    }
  },
};
