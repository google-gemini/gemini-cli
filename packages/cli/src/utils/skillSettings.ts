/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isLoadableSettingScope,
  type SettingScope,
  type LoadedSettings,
} from '../config/settings.js';

export interface ModifiedScope {
  scope: SettingScope;
  path: string;
}

export type SkillActionStatus = 'success' | 'no-op' | 'error';

/**
 * Metadata representing the result of a skill settings operation.
 */
export interface SkillActionResult {
  status: SkillActionStatus;
  skillName: string;
  action: 'enable' | 'disable';
  /** Scopes where the skill's state was actually changed. */
  modifiedScopes: ModifiedScope[];
  /** Scopes where the skill was already in the desired state. */
  alreadyInStateScopes: ModifiedScope[];
  /** Error message if status is 'error'. */
  error?: string;
}

/**
 * Enables a skill by removing it from the specified disabled list.
 */
export function enableSkill(
  settings: LoadedSettings,
  skillName: string,
  scope: SettingScope,
): SkillActionResult {
  if (!isLoadableSettingScope(scope)) {
    return {
      status: 'error',
      skillName,
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
      error: `Invalid settings scope: ${scope}`,
    };
  }

  const scopePath = settings.forScope(scope).path;
  const currentScopeDisabled =
    settings.forScope(scope).settings.skills?.disabled ?? [];

  if (!currentScopeDisabled.includes(skillName)) {
    return {
      status: 'no-op',
      skillName,
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: [{ scope, path: scopePath }],
    };
  }

  const newDisabled = currentScopeDisabled.filter((name) => name !== skillName);
  settings.setValue(scope, 'skills.disabled', newDisabled);

  return {
    status: 'success',
    skillName,
    action: 'enable',
    modifiedScopes: [{ scope, path: scopePath }],
    alreadyInStateScopes: [],
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
  if (!isLoadableSettingScope(scope)) {
    return {
      status: 'error',
      skillName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
      error: `Invalid settings scope: ${scope}`,
    };
  }

  const scopePath = settings.forScope(scope).path;
  const currentScopeDisabled =
    settings.forScope(scope).settings.skills?.disabled ?? [];

  if (currentScopeDisabled.includes(skillName)) {
    return {
      status: 'no-op',
      skillName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [{ scope, path: scopePath }],
    };
  }

  const newDisabled = [...currentScopeDisabled, skillName];
  settings.setValue(scope, 'skills.disabled', newDisabled);

  return {
    status: 'success',
    skillName,
    action: 'disable',
    modifiedScopes: [{ scope, path: scopePath }],
    alreadyInStateScopes: [],
  };
}
