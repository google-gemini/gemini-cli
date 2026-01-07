/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SettingScope,
  isLoadableSettingScope,
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
 * Enables a skill by removing it from all writable disabled lists (User and Workspace).
 */
export function enableSkill(
  settings: LoadedSettings,
  skillName: string,
): SkillActionResult {
  const writableScopes = [SettingScope.Workspace, SettingScope.User];
  const foundInDisabledScopes: ModifiedScope[] = [];
  const alreadyEnabledScopes: ModifiedScope[] = [];

  for (const scope of writableScopes) {
    if (isLoadableSettingScope(scope)) {
      const scopePath = settings.forScope(scope).path;
      const scopeDisabled = settings.forScope(scope).settings.skills?.disabled;
      if (scopeDisabled?.includes(skillName)) {
        foundInDisabledScopes.push({ scope, path: scopePath });
      } else {
        alreadyEnabledScopes.push({ scope, path: scopePath });
      }
    }
  }

  if (foundInDisabledScopes.length === 0) {
    return {
      status: 'no-op',
      skillName,
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: alreadyEnabledScopes,
    };
  }

  const modifiedScopes: ModifiedScope[] = [];
  for (const { scope, path } of foundInDisabledScopes) {
    if (isLoadableSettingScope(scope)) {
      const currentScopeDisabled =
        settings.forScope(scope).settings.skills?.disabled ?? [];
      const newDisabled = currentScopeDisabled.filter(
        (name) => name !== skillName,
      );
      settings.setValue(scope, 'skills.disabled', newDisabled);
      modifiedScopes.push({ scope, path });
    }
  }

  return {
    status: 'success',
    skillName,
    action: 'enable',
    modifiedScopes,
    alreadyInStateScopes: alreadyEnabledScopes,
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

  // Check if it's already disabled in the other writable scope
  const otherScope =
    scope === SettingScope.Workspace
      ? SettingScope.User
      : SettingScope.Workspace;
  const alreadyDisabledInOther: ModifiedScope[] = [];

  if (isLoadableSettingScope(otherScope)) {
    const otherScopeDisabled =
      settings.forScope(otherScope).settings.skills?.disabled;
    if (otherScopeDisabled?.includes(skillName)) {
      alreadyDisabledInOther.push({
        scope: otherScope,
        path: settings.forScope(otherScope).path,
      });
    }
  }

  const newDisabled = [...currentScopeDisabled, skillName];
  settings.setValue(scope, 'skills.disabled', newDisabled);

  return {
    status: 'success',
    skillName,
    action: 'disable',
    modifiedScopes: [{ scope, path: scopePath }],
    alreadyInStateScopes: alreadyDisabledInOther,
  };
}
