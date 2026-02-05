/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type SkillReference = { type: 'dir'; path: string };

/**
 * Reference a directory containing skills.
 *
 * @param path Path to the skill directory
 */
export function skillDir(path: string): SkillReference {
  return { type: 'dir', path };
}
