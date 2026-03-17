/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SkillDefinition } from './skillLoader.js';

// Handles matching user prompts against skill matcher patterns.

export class SkillMatcher {
  static findMatches(skills: SkillDefinition[], prompt: string): string[] {
    const matches: string[] = [];

    for (const skill of skills) {
      if (skill.disabled || !skill.compiledMatcher) {
        continue;
      }

      if (skill.compiledMatcher.test(prompt)) {
        matches.push(skill.name);
      }
    }

    return matches;
  }
}
