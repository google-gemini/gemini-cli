/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createMissionCouncilResult } from './MissionCouncil.js';

describe('MissionCouncil', () => {
  it('should create a default result for a simple request', () => {
    const result = createMissionCouncilResult('do something');
    expect(result.riskOfficer.riskLevel).toBe('Safe');
    expect(result.riskOfficer.protectedZones).toContain(
      'Pending project profile',
    );
    expect(result.finalRoute.firstAction).toBe(
      'Inspect likely files before editing',
    );
  });

  it('should identify medium risk when "without touching auth" is present', () => {
    const result = createMissionCouncilResult('fix bug without touching auth');
    expect(result.riskOfficer.riskLevel).toBe('Medium');
    expect(result.riskOfficer.protectedZones).toContain('auth');
    expect(result.riskOfficer.reasons[0]).toContain('auth-related code');
  });

  it('should identify medium risk when "do not touch auth" is present', () => {
    const result = createMissionCouncilResult('refactor but do not touch auth');
    expect(result.riskOfficer.riskLevel).toBe('Medium');
    expect(result.riskOfficer.protectedZones).toContain('OAuth');
  });

  it('should add context needed for search requests', () => {
    const result = createMissionCouncilResult('search for usage of X');
    expect(result.scout.contextNeeded).toContain(
      'Identify which search system the user means',
    );
  });
});
