/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type SlashCommand,
  type CommandContext,
  type OpenCustomDialogActionReturn,
  CommandKind,
} from './types.js';
import { FooterConfigDialog } from '../components/FooterConfigDialog.js';

export const footerCommand: SlashCommand = {
  name: 'footer',
  altNames: ['statusline'],
  description: 'Configure which items appear in the footer (statusline)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context: CommandContext): OpenCustomDialogActionReturn => ({
    type: 'custom_dialog',
    component: <FooterConfigDialog onClose={context.ui.removeComponent} />,
  }),
};
