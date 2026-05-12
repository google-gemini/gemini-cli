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
  setCockpitDetailsExpanded,
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
    expect(frame).toContain('GC COCKPIT');
    expect(frame).toContain('● Mission');
    expect(frame).not.toContain('Goal:');
    unmount();
  });

  it('should render active missions compact by default', async () => {
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
    expect(frame).toContain('Mission:');
    expect(frame).toContain(mission);
    expect(frame).toContain('Risk:');
    expect(frame).not.toContain('MISSION COUNCIL v1');
    expect(frame).not.toContain('Goal:');
    expect(frame).toContain('✔ Mission');
    expect(frame).toContain('● Edit');
    unmount();
  });

  it('should render full mission council details when expanded', async () => {
    const mission = 'fix search without touching auth';
    const { lastFrame, unmount, waitUntilReady } = await render(
      <StaticCockpitPanel />,
    );

    await act(async () => {
      activateCockpitMission(mission);
      setCockpitDetailsExpanded(true);
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

  it('should show Pollux in the compact header without expanding details', async () => {
    const { lastFrame, unmount, waitUntilReady } = await render(
      <StaticCockpitPanel polluxMessage="Standing by." />,
    );

    await act(async () => {
      activateCockpitMission('trim the cockpit');
    });

    await waitUntilReady();
    const frame = lastFrame();
    expect(frame).toContain('Pollux: Standing by.');
    expect(frame).not.toContain('MISSION COUNCIL v1');
    unmount();
  });
});
