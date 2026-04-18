/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CommandKind } from './types.js';
import { cyberReportCommand } from './cyberReportCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('cyberReportCommand', () => {
  it('should expose expected command metadata', () => {
    expect(cyberReportCommand.name).toBe('report');
    expect(cyberReportCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should return a submit_prompt action', async () => {
    const context = createMockCommandContext();
    const result = await cyberReportCommand.action!(
      context,
      'target=lab.local',
    );

    expect(result).toMatchObject({
      type: 'submit_prompt',
    });
    if (result?.type === 'submit_prompt') {
      expect(result.content).toContain('Executive Summary');
      expect(result.content).toContain('Context: target=lab.local');
    }
  });
});
