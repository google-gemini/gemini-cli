/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { PhaseStatusPanel } from './PhaseStatusPanel.js';

describe('PhaseStatusPanel', () => {
  it('should render all phases', async () => {
    const { lastFrame } = await renderWithProviders(
      <PhaseStatusPanel activePhase="Mission" />,
    );

    const output = lastFrame();
    expect(output).toContain('● Mission');
    expect(output).toContain('Risk Scan');
    expect(output).toContain('Next Action');
  });

  it('should show completed phases with checkmark', async () => {
    const { lastFrame } = await renderWithProviders(
      <PhaseStatusPanel activePhase="Plan" />,
    );

    const output = lastFrame();
    expect(output).toContain('✔ Mission');
    expect(output).toContain('✔ Risk Scan');
    expect(output).toContain('✔ Inspect');
    expect(output).toContain('● Plan');
  });
});
