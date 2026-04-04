/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ApprovalMode } from '@google/gemini-cli-core';
import {
  mapExitPlanModeAnswers,
  PLAN_APPROVAL_AUTO_OPTION,
  PLAN_APPROVAL_MANUAL_OPTION,
} from './hostInput.js';

describe('mapExitPlanModeAnswers', () => {
  it('should return approved: true and AUTO_EDIT for auto option', () => {
    const result = mapExitPlanModeAnswers({ '0': PLAN_APPROVAL_AUTO_OPTION });
    expect(result).toEqual({
      approved: true,
      approvalMode: ApprovalMode.AUTO_EDIT,
    });
  });

  it('should return approved: true and DEFAULT for manual option', () => {
    const result = mapExitPlanModeAnswers({ '0': PLAN_APPROVAL_MANUAL_OPTION });
    expect(result).toEqual({
      approved: true,
      approvalMode: ApprovalMode.DEFAULT,
    });
  });

  it('should return approved: false and feedback for other strings', () => {
    const result = mapExitPlanModeAnswers({ '0': 'Some feedback' });
    expect(result).toEqual({
      approved: false,
      feedback: 'Some feedback',
    });
  });

  it('should return approved: false for whitespace-only feedback', () => {
    const result = mapExitPlanModeAnswers({ '0': '   ' });
    expect(result).toEqual({
      approved: false,
    });
  });

  it('should return approved: false for empty string', () => {
    const result = mapExitPlanModeAnswers({ '0': '' });
    expect(result).toEqual({
      approved: false,
    });
  });

  it('should return approved: false for undefined', () => {
    const result = mapExitPlanModeAnswers({});
    expect(result).toEqual({
      approved: false,
    });
  });
});
