/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SettingScope, LoadedSettings } from '../config/settings.js';

import {
  type FeatureActionResult,
  type FeatureToggleStrategy,
  enableFeature,
  disableFeature,
} from './featureToggleUtils.js';

export type { ModifiedScope } from './featureToggleUtils.js';

export type SkillActionStatus = 'success' | 'no-op' | 'error';

/**
 * Metadata representing the result of a skill settings operation.
 */
export interface SkillActionResult
  extends Omit<FeatureActionResult, 'featureName'> {
  skillName: string;
}

const skillStrategy: FeatureToggleStrategy = {
  needsEnabling: (settings, scope, skillName) => {
    const scopeDisabled = settings.forScope(scope).settings.skills?.disabled;
    return !!scopeDisabled?.includes(skillName);
  },
  enable: (settings, scope, skillName) => {
    const currentScopeDisabled =
      settings.forScope(scope).settings.skills?.disabled ?? [];
    const newDisabled = currentScopeDisabled.filter(
      (name) => name !== skillName,
    );
    settings.setValue(scope, 'skills.disabled', newDisabled);
  },
  isExplicitlyDisabled: (settings, scope, skillName) => {
    const currentScopeDisabled =
      settings.forScope(scope).settings.skills?.disabled ?? [];
    return currentScopeDisabled.includes(skillName);
  },
  disable: (settings, scope, skillName) => {
    const currentScopeDisabled =
      settings.forScope(scope).settings.skills?.disabled ?? [];
    // The generic utility checks isExplicitlyDisabled before calling this,
    // but just to be safe and idempotent, we check or we assume the utility did its job.
    // The utility does check isExplicitlyDisabled first.
    // So we can blindly add it, but since we are modifying an array, pushing is fine.
    // However, if we assume purely that we must disable it:
    const newDisabled = [...currentScopeDisabled, skillName];
    settings.setValue(scope, 'skills.disabled', newDisabled);
  },
};

/**
 * Enables a skill by removing it from all writable disabled lists (User and Workspace).
 */
export function enableSkill(
  settings: LoadedSettings,
  skillName: string,
): SkillActionResult {
  const { featureName, ...rest } = enableFeature(
    settings,
    skillName,
    skillStrategy,
  );
  return {
    ...rest,
    skillName: featureName,
  };
}

/**
 * Disables a skill by adding it to the disabled list in the specified scope.
 */
export function disableSkill(
  settings: LoadedSettings,
  skillName: string,
  scope: SettingScope,
): SkillActionResult {
  const { featureName, ...rest } = disableFeature(
    settings,
    skillName,
    scope,
    skillStrategy,
  );
  return {
    ...rest,
    skillName: featureName,
  };
}
