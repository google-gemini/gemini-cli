/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { CouncilPanel } from './CouncilPanel.js';
import { createMissionCouncilResult } from '../services/MissionCouncil.js';

describe('CouncilPanel', () => {
  it('should render mission council result fields', async () => {
    const result = createMissionCouncilResult('fix bug without touching auth');
    const { lastFrame } = await renderWithProviders(
      <CouncilPanel result={result} />,
    );

    const output = lastFrame();
    expect(output).toContain('MISSION COUNCIL v1');
    expect(output).toContain('Scout:');
    expect(output).toContain('Architect:');
    expect(output).toContain('Risk Officer:');
    expect(output).toContain('[Medium]');
    expect(output).toContain('auth, OAuth, credentials, token storage');
    expect(output).toContain('Test Captain:');
    expect(output).toContain('Critic:');
    expect(output).toContain('Final Route:');
    expect(output).toContain('Inspect likely files before editing');
  });
});
