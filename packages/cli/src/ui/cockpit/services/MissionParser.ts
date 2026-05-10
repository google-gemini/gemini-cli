/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MissionBrief {
  goal: string;
  lane: string;
  likelyFiles: string[];
  protectedZones: string[];
  risks: string[];
  testPlan: string[];
  successCriteria: string[];
}

export function createMissionBrief(request: string): MissionBrief {
  const goal = request.trim();
  return {
    goal,
    lane: 'Unknown',
    likelyFiles: ['Pending inspect phase'],
    protectedZones: ['Pending project profile'],
    risks: ['Pending risk scan'],
    testPlan: ['Pending test planner'],
    successCriteria: ['Mission brief accepted'],
  };
}
