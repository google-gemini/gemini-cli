/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { MissionPanel } from './MissionPanel.js';
import { createMissionBrief } from '../services/MissionParser.js';

describe('MissionPanel', () => {
  it('should render mission brief fields', async () => {
    const brief = createMissionBrief('Test Goal');
    const { lastFrame } = await renderWithProviders(
      <MissionPanel brief={brief} />,
    );

    const output = lastFrame();
    expect(output).toContain('Goal:');
    expect(output).toContain('Test Goal');
    expect(output).toContain('Lane:');
    expect(output).toContain('Unknown');
    expect(output).toContain('Risks:');
    expect(output).toContain('Pending risk scan');
  });
});
