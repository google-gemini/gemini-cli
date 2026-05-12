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
    likelyFiles: ['Inspect phase will choose the files'],
    protectedZones: ['No protected zones identified yet'],
    risks: ['Risk scan has not found a blocker yet'],
    testPlan: ['Use the narrowest check that covers the edit'],
    successCriteria: ['Mission brief accepted'],
  };
}
