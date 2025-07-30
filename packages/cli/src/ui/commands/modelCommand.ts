/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, MessageActionReturn, SlashCommand } from './types.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'change the model. Usage: /model <model-name>',
  kind: CommandKind.BUILT_IN,
  action: (context, args): MessageActionReturn | void => {
    const model = args.trim();
    
    if (!model) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /model <model-name>',
      };
    }

    context.services.config?.setModel(model);
    
    return {
      type: 'message',
      messageType: 'info',
      content: `Model changed to ${model}`,
    };
  },
};