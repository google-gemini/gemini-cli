/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { mapCommand } from './mapCommand.js';
import { CommandKind } from './types.js';

describe('mapCommand', () => {
  it('should be defined correctly', () => {
    expect(mapCommand).toBeDefined();
    expect(mapCommand.name).toBe('map');
    expect(mapCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(mapCommand.autoExecute).toBe(true);
  });

  it('should return submit_prompt action with correct settings', async () => {
    const actionReturn = await mapCommand.action!(
      {} as Parameters<NonNullable<typeof mapCommand.action>>[0],
      '',
    );

    expect(actionReturn).toEqual({
      type: 'submit_prompt',
      content: [
        {
          text: expect.stringContaining('Please analyze the project structure'),
        },
      ],
      systemPromptExtension: expect.stringContaining(
        'Architecture Cartographer',
      ),
      tools: ['map_project_structure'],
    });
  });
});
