/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ProfileDefinition } from '../profiles/profileLoader.js';

export function listProfiles(config: Config): ProfileDefinition[] {
  const profiles = config.getProfileManager().getAllProfiles();
  return profiles;
}

export async function switchProfile(
  config: Config,
  name: string,
): Promise<void> {
  await config.applyProfile(name);
}

export function getActiveProfile(
  config: Config,
): ProfileDefinition | undefined {
  return config.getProfileManager().getActiveProfile();
}
