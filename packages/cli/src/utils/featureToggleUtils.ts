/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SettingScope,
  isLoadableSettingScope,
  type LoadableSettingScope,
  type LoadedSettings,
  type SettingsFile,
} from '../config/settings.js';

export interface ModifiedScope {
  scope: SettingScope;
  path: string;
}

export type FeatureActionStatus = 'success' | 'no-op' | 'error';

/**
 * Metadata representing the result of a feature settings operation.
 */
export interface FeatureActionResult {
  status: FeatureActionStatus;
  featureName: string;
  action: 'enable' | 'disable';
  /** Scopes where the feature's state was actually changed. */
  modifiedScopes: ModifiedScope[];
  /** Scopes where the feature was already in the desired state. */
  alreadyInStateScopes: ModifiedScope[];
  /** Error message if status is 'error'. */
  error?: string;
}

/**
 * Strategy interface for checking and updating a feature's enabled/disabled
 * state within a settings scope.
 */
export interface FeatureToggleConfig {
  /** Returns true if the feature is currently in the disabled state for this scope. */
  isDisabledInScope(scopeSettings: SettingsFile, featureName: string): boolean;
  /** Applies the enable action for the feature in the given scope. */
  applyEnable(
    settings: LoadedSettings,
    scope: LoadableSettingScope,
    featureName: string,
  ): void;
  /** Applies the disable action for the feature in the given scope. */
  applyDisable(
    settings: LoadedSettings,
    scope: LoadableSettingScope,
    featureName: string,
  ): void;
}

const WRITABLE_SCOPES = [SettingScope.Workspace, SettingScope.User];

/**
 * Enables a feature by applying the enable action across all writable scopes
 * where the feature is currently disabled.
 */
export function enableFeature(
  settings: LoadedSettings,
  featureName: string,
  config: FeatureToggleConfig,
): FeatureActionResult {
  const foundInDisabledScopes: ModifiedScope[] = [];
  const alreadyEnabledScopes: ModifiedScope[] = [];

  for (const scope of WRITABLE_SCOPES) {
    if (isLoadableSettingScope(scope)) {
      const scopeFile = settings.forScope(scope);
      if (config.isDisabledInScope(scopeFile, featureName)) {
        foundInDisabledScopes.push({ scope, path: scopeFile.path });
      } else {
        alreadyEnabledScopes.push({ scope, path: scopeFile.path });
      }
    }
  }

  if (foundInDisabledScopes.length === 0) {
    return {
      status: 'no-op',
      featureName,
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: alreadyEnabledScopes,
    };
  }

  const modifiedScopes: ModifiedScope[] = [];
  for (const { scope, path } of foundInDisabledScopes) {
    if (isLoadableSettingScope(scope)) {
      config.applyEnable(settings, scope, featureName);
      modifiedScopes.push({ scope, path });
    }
  }

  return {
    status: 'success',
    featureName,
    action: 'enable',
    modifiedScopes,
    alreadyInStateScopes: alreadyEnabledScopes,
  };
}

/**
 * Disables a feature by applying the disable action in the specified scope.
 */
export function disableFeature(
  settings: LoadedSettings,
  featureName: string,
  scope: SettingScope,
  config: FeatureToggleConfig,
): FeatureActionResult {
  if (!isLoadableSettingScope(scope)) {
    return {
      status: 'error',
      featureName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
      error: `Invalid settings scope: ${scope}`,
    };
  }

  const scopeFile = settings.forScope(scope);

  if (config.isDisabledInScope(scopeFile, featureName)) {
    return {
      status: 'no-op',
      featureName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [{ scope, path: scopeFile.path }],
    };
  }

  // Check if it's already disabled in the other writable scope
  const otherScope =
    scope === SettingScope.Workspace
      ? SettingScope.User
      : SettingScope.Workspace;
  const alreadyDisabledInOther: ModifiedScope[] = [];

  if (isLoadableSettingScope(otherScope)) {
    const otherScopeFile = settings.forScope(otherScope);
    if (config.isDisabledInScope(otherScopeFile, featureName)) {
      alreadyDisabledInOther.push({
        scope: otherScope,
        path: otherScopeFile.path,
      });
    }
  }

  config.applyDisable(settings, scope, featureName);

  return {
    status: 'success',
    featureName,
    action: 'disable',
    modifiedScopes: [{ scope, path: scopeFile.path }],
    alreadyInStateScopes: alreadyDisabledInOther,
  };
}

/**
 * Creates a FeatureToggleConfig for features that use a disabled-list pattern
 * (e.g., `skills.disabled` or `hooksConfig.disabled`).
 *
 * @param settingsKey The dot-separated path to the disabled array (e.g., 'skills.disabled').
 * @param getDisabledList A function that extracts the disabled array from scope settings.
 */
export function createListBasedToggleConfig(
  settingsKey: string,
  getDisabledList: (settings: SettingsFile) => string[] | undefined,
): FeatureToggleConfig {
  return {
    isDisabledInScope(scopeFile, featureName) {
      return getDisabledList(scopeFile)?.includes(featureName) ?? false;
    },
    applyEnable(settings, scope, featureName) {
      const currentDisabled = getDisabledList(settings.forScope(scope)) ?? [];
      const newDisabled = currentDisabled.filter(
        (name) => name !== featureName,
      );
      settings.setValue(scope, settingsKey, newDisabled);
    },
    applyDisable(settings, scope, featureName) {
      const currentDisabled = getDisabledList(settings.forScope(scope)) ?? [];
      const newDisabled = [...currentDisabled, featureName];
      settings.setValue(scope, settingsKey, newDisabled);
    },
  };
}
