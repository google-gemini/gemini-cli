/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A reference to a skill directory that can be loaded by the agent.
 *
 * Skills extend the agent's capabilities by providing additional prompts,
 * tools, and behaviors defined in a directory structure.
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
