/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SettingScope, type LoadedSettings } from '../config/settings.js';
import {
  type FeatureActionResult,
  enableFeature,
  disableFeature,
  createListBasedToggleConfig,
} from './featureToggleUtils.js';

export type { ModifiedScope } from './featureToggleUtils.js';

export type SkillActionResult = FeatureActionResult;

const skillToggleConfig = createListBasedToggleConfig(
  'skills.disabled',
  (scopeFile) => scopeFile.settings.skills?.disabled,
);

/**
 * Enables a skill by removing it from all writable disabled lists (User and Workspace).
 */
export function enableSkill(
  settings: LoadedSettings,
  skillName: string,
): SkillActionResult {
  return enableFeature(settings, skillName, skillToggleConfig);
}

/**
 * Disables a skill by adding it to the disabled list in the specified scope.
 */
export function disableSkill(
  settings: LoadedSettings,
  skillName: string,
  scope: SettingScope,
): SkillActionResult {
  return disableFeature(settings, skillName, scope, skillToggleConfig);
}
