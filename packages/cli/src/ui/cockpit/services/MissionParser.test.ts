/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createMissionBrief } from './MissionParser.js';

describe('MissionParser', () => {
  it('should create a structured brief from a request', () => {
    const request = 'Refactor the tokenizer';
    const brief = createMissionBrief(request);

    expect(brief.goal).toBe(request);
    expect(brief.lane).toBe('Unknown');
    expect(brief.likelyFiles).toEqual(['Inspect phase will choose the files']);
    expect(brief.protectedZones).toEqual(['No protected zones identified yet']);
    expect(brief.risks).toEqual(['Risk scan has not found a blocker yet']);
    expect(brief.testPlan).toEqual(['Use the narrowest check that covers the edit']);
    expect(brief.successCriteria).toEqual(['Mission brief accepted']);
  });
});
