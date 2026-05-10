/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { render } from '../../../test-utils/render.js';
import { StaticCockpitPanel } from './StaticCockpitPanel.js';
import {
  activateCockpitMission,
  setCockpitVisible,
  setCurrentPhase,
} from '../CockpitState.js';

describe('StaticCockpitPanel', () => {
  beforeEach(() => {
    setCockpitVisible(false);
  });

  it('should render default state with current phase', async () => {
    const { lastFrame, unmount } = await render(<StaticCockpitPanel />);
    const frame = lastFrame();
    expect(frame).toContain('MISSION COCKPIT');
    expect(frame).toContain('● Mission');
    expect(frame).not.toContain('Goal:');
    unmount();
  });

  it('should render active mission brief, council result, and updated phase', async () => {
    const mission = 'fix search without touching auth';
    const { lastFrame, unmount, waitUntilReady } = await render(
      <StaticCockpitPanel />,
    );

    await act(async () => {
      activateCockpitMission(mission);
      setCurrentPhase('Edit');
    });

    await waitUntilReady();
    const frame = lastFrame();
    expect(frame).toContain('Goal:');
    expect(frame).toContain(mission);
    expect(frame).toContain('MISSION COUNCIL v1');
    expect(frame).toContain('[Medium]');
    expect(frame).toContain('✔ Mission');
    expect(frame).toContain('● Edit');
    unmount();
  });
});
