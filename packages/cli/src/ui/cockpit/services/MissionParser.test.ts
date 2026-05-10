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
    expect(brief.likelyFiles).toEqual(['Pending inspect phase']);
    expect(brief.protectedZones).toEqual(['Pending project profile']);
    expect(brief.risks).toEqual(['Pending risk scan']);
    expect(brief.testPlan).toEqual(['Pending test planner']);
    expect(brief.successCriteria).toEqual(['Mission brief accepted']);
  });
});
