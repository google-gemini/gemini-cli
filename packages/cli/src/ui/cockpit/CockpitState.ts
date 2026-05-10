/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import {
  createMissionCouncilResult,
  type MissionCouncilResult,
} from './services/MissionCouncil.js';
import {
  createMissionBrief,
  type MissionBrief,
} from './services/MissionParser.js';

export const PHASES = [
  'Mission',
  'Risk Scan',
  'Inspect',
  'Plan',
  'Edit',
  'Test',
  'Review',
  'Next Action',
] as const;

export type Phase = (typeof PHASES)[number];

let cockpitVisible = false;
let currentMission: string | null = null;
let currentMissionBrief: MissionBrief | null = null;
let currentMissionCouncil: MissionCouncilResult | null = null;
let currentPhase: Phase = 'Mission';
const listeners = new Set<() => void>();

function notifyCockpitListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getCockpitVisible(): boolean {
  return cockpitVisible;
}

export function getCurrentMission(): string | null {
  return currentMission;
}

export function getCurrentMissionBrief(): MissionBrief | null {
  return currentMissionBrief;
}

export function getCurrentMissionCouncil(): MissionCouncilResult | null {
  return currentMissionCouncil;
}

export function getCurrentPhase(): string {
  return currentPhase;
}

export function setCurrentPhase(phase: Phase): void {
  if (currentPhase === phase) {
    return;
  }

  currentPhase = phase;
  notifyCockpitListeners();
}

export function setCockpitVisible(visible: boolean): void {
  if (cockpitVisible === visible) {
    return;
  }

  cockpitVisible = visible;
  notifyCockpitListeners();
}

export function activateCockpitMission(request: string): void {
  currentMission = request;
  currentMissionBrief = createMissionBrief(request);
  currentMissionCouncil = createMissionCouncilResult(request);
  currentPhase = 'Mission';
  cockpitVisible = true;
  notifyCockpitListeners();
}

export function toggleCockpit(): boolean {
  setCockpitVisible(!cockpitVisible);
  return cockpitVisible;
}

export interface CockpitState {
  visible: boolean;
  mission: string | null;
  missionBrief: MissionBrief | null;
  missionCouncil: MissionCouncilResult | null;
  phase: Phase;
}

export function useCockpitState(): CockpitState {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => {
      setVersion((version) => version + 1);
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    visible: cockpitVisible,
    mission: currentMission,
    missionBrief: currentMissionBrief,
    missionCouncil: currentMissionCouncil,
    phase: currentPhase,
  };
}

export function useCockpitVisible(): boolean {
  return useCockpitState().visible;
}
