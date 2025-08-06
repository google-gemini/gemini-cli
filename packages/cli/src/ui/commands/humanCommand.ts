/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CommandKind, SlashCommand } from './types.js';
import { MessageType } from '../types.js';

/**
 * Records human guidance by appending it to rules.json.
 */
export const humanCommand: SlashCommand = {
  name: 'human',
  description: 'add human rule or direction',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const rule = args?.trim();
    if (!rule) {
      context.ui.addItem(
        { type: MessageType.ERROR, text: 'Usage: /human <guidance>' },
        Date.now(),
      );
      return;
    }
    const rulesFile = path.join(process.cwd(), 'rules.json');
    let rules: string[] = [];
    try {
      const data = await fs.readFile(rulesFile, 'utf8');
      rules = JSON.parse(data);
    } catch {
      // file may not exist
    }
    rules.push(rule);
    await fs.writeFile(rulesFile, JSON.stringify(rules, null, 2));
    context.ui.addItem(
      { type: MessageType.INFO, text: `Added rule: "${rule}"` },
      Date.now(),
    );
  },
};
