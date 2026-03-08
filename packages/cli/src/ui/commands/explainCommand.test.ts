/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { explainCommand } from './explainCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

describe('explainCommand', () => {
  it('strips --visualize from query and forces visual instructions', async () => {
    const context = createMockCommandContext({
      services: {
        config: {
          getVisualize: () => false,
        },
      },
    });

    const result = await explainCommand.action!(
      context,
      '--visualize "How does React reconciliation work?"',
    );

    expect(result?.type).toBe('submit_prompt');
    if (result?.type === 'submit_prompt') {
      const firstPart = Array.isArray(result.content)
        ? result.content[0]
        : undefined;
      const text =
        firstPart &&
        typeof firstPart === 'object' &&
        'text' in firstPart &&
        typeof firstPart.text === 'string'
          ? firstPart.text
          : '';
      expect(text).toContain('You MUST provide a visual representation');
      expect(text).not.toContain('--visualize');
      expect(text).toContain('How does React reconciliation work?');
    }
  });

  it('shows usage when args are missing', async () => {
    const context = createMockCommandContext();

    const result = await explainCommand.action!(context, '');

    expect(result).toBeUndefined();
    expect(context.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.ERROR,
        text: 'Usage: /explain <query> or /explain @file',
      },
    );
  });
});
