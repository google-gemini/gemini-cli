/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SkillMatcher } from './skillMatcher.js';
import { type SkillDefinition } from './skillLoader.js';

describe('SkillMatcher', () => {
  const mockSkills: SkillDefinition[] = [
    {
      name: 'skill-creator',
      description: 'Creates skills',
      matcher: 'create (a )?skill',
      compiledMatcher: /create (a )?skill/i,
      location: 'loc1',
      body: 'body1',
    },
    {
      name: 'git-expert',
      description: 'Expert in git',
      matcher: 'git',
      compiledMatcher: /git/i,
      location: 'loc2',
      body: 'body2',
    },
    {
      name: 'no-matcher',
      description: 'No matcher',
      location: 'loc3',
      body: 'body3',
    },
    {
      name: 'disabled-skill',
      description: 'Disabled',
      matcher: 'disabled',
      compiledMatcher: /disabled/i,
      disabled: true,
      location: 'loc4',
      body: 'body4',
    },
  ];

  it('should find matching skills based on regex', () => {
    const prompt = 'I want to create a skill for my project';
    const matches = SkillMatcher.findMatches(mockSkills, prompt);
    expect(matches).toContain('skill-creator');
    expect(matches).not.toContain('git-expert');
  });

  it('should be case-insensitive (via compiled regex)', () => {
    const prompt = 'GIT STATUS';
    const matches = SkillMatcher.findMatches(mockSkills, prompt);
    expect(matches).toContain('git-expert');
  });

  it('should return multiple matches if applicable', () => {
    const prompt = 'create a skill for git';
    const matches = SkillMatcher.findMatches(mockSkills, prompt);
    expect(matches).toContain('skill-creator');
    expect(matches).toContain('git-expert');
  });

  it('should ignore skills without matchers', () => {
    const prompt = 'no matcher';
    const matches = SkillMatcher.findMatches(mockSkills, prompt);
    expect(matches).not.toContain('no-matcher');
  });

  it('should ignore disabled skills', () => {
    const prompt = 'disabled';
    const matches = SkillMatcher.findMatches(mockSkills, prompt);
    expect(matches).not.toContain('disabled-skill');
  });
});
