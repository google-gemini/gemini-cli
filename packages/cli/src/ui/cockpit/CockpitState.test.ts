/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  activateCockpitMission,
  getCockpitDetailsExpanded,
  getCockpitVisible,
  getCurrentMissionBrief,
  getCurrentPhase,
  setCurrentPhase,
  setCockpitDetailsExpanded,
  setCockpitVisible,
  toggleCockpit,
  toggleCockpitDetails,
} from './CockpitState.js';

describe('CockpitState', () => {
  beforeEach(() => {
    setCockpitVisible(false);
  });

  it('should be hidden by default', () => {
    expect(getCockpitVisible()).toBe(false);
  });

  it('should toggle visibility', () => {
    expect(toggleCockpit()).toBe(true);
    expect(getCockpitVisible()).toBe(true);
    expect(toggleCockpit()).toBe(false);
    expect(getCockpitVisible()).toBe(false);
  });

  it('should update current phase', () => {
    activateCockpitMission('Test');
    expect(getCurrentPhase()).toBe('Mission');
    setCurrentPhase('Plan');
    expect(getCurrentPhase()).toBe('Plan');
  });

  it('should store mission brief when activated', () => {
    activateCockpitMission('Structured test');
    const brief = getCurrentMissionBrief();
    expect(brief).not.toBeNull();
    expect(brief?.goal).toBe('Structured test');
  });

  it('should activate missions in compact mode by default', () => {
    setCockpitDetailsExpanded(true);
    activateCockpitMission('Keep this compact');

    expect(getCockpitVisible()).toBe(true);
    expect(getCockpitDetailsExpanded()).toBe(false);
  });

  it('should toggle cockpit details for F10 handlers', () => {
    activateCockpitMission('Toggle details');

    expect(toggleCockpitDetails()).toBe(true);
    expect(getCockpitDetailsExpanded()).toBe(true);
    expect(toggleCockpitDetails()).toBe(false);
    expect(getCockpitDetailsExpanded()).toBe(false);
  });
});
