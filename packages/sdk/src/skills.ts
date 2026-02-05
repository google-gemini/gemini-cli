/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type SkillReference =
  | { type: 'dir'; path: string }
  | { type: 'root'; path: string };

/**
 * Reference a directory containing a single skill.
 * The directory must contain a SKILL.md file.
 *
 * @param path Path to the skill directory
 */
export function skillDir(path: string): SkillReference {
  return { type: 'dir', path };
}

/**
 * Reference a root directory containing multiple skills.
 * The directory should contain subdirectories, each with a SKILL.md file.
 *
 * @param path Path to the skills root directory
 */
export function skillRoot(path: string): SkillReference {
  return { type: 'root', path };
}
