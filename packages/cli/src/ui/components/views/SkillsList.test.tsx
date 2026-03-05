/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { SkillsList } from './SkillsList.js';
import { type SkillDefinition } from '@google/gemini-cli-core';

describe('SkillsList Component', () => {
  const mockSkills: SkillDefinition[] = [
    {
      name: 'skill1',
      description: 'description 1',
      disabled: false,
      location: 'loc1',
      body: 'body1',
    },
    {
      name: 'skill2',
      description: 'description 2',
      disabled: true,
      location: 'loc2',
      body: 'body2',
    },
    {
      name: 'skill3',
      description: 'description 3',
      disabled: false,
      location: 'loc3',
      body: 'body3',
    },
  ];

  it('should render enabled and disabled skills separately', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <SkillsList skills={mockSkills} showDescriptions={true} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain('Available Agent Skills:');
    expect(output).toContain('skill1');
    expect(output).toContain('description 1');
    expect(output).toContain('skill3');
    expect(output).toContain('description 3');

    expect(output).toContain('Disabled Skills:');
    expect(output).toContain('skill2');
    expect(output).toContain('description 2');

    unmount();
  });

  it('should not render descriptions when showDescriptions is false', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <SkillsList skills={mockSkills} showDescriptions={false} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain('skill1');
    expect(output).not.toContain('description 1');
    expect(output).toContain('skill2');
    expect(output).not.toContain('description 2');
    expect(output).toContain('skill3');
    expect(output).not.toContain('description 3');

    unmount();
  });

  it('should render "No skills available" when skills list is empty', async () => {
    const { lastFrame, unmount, waitUntilReady } = render(
      <SkillsList skills={[]} showDescriptions={true} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain('No skills available');

    unmount();
  });

  it('should only render Available Agent Skills section when all skills are enabled', async () => {
    const enabledOnly = mockSkills.filter((s) => !s.disabled);
    const { lastFrame, unmount, waitUntilReady } = render(
      <SkillsList skills={enabledOnly} showDescriptions={true} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain('Available Agent Skills:');
    expect(output).not.toContain('Disabled Skills:');

    unmount();
  });

  it('should only render Disabled Skills section when all skills are disabled', async () => {
    const disabledOnly = mockSkills.filter((s) => s.disabled);
    const { lastFrame, unmount, waitUntilReady } = render(
      <SkillsList skills={disabledOnly} showDescriptions={true} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).not.toContain('Available Agent Skills:');
    expect(output).toContain('Disabled Skills:');

    unmount();
  });

  it('should render [Built-in] tag for built-in skills', async () => {
    const builtinSkill: SkillDefinition = {
      name: 'builtin-skill',
      description: 'A built-in skill',
      disabled: false,
      location: 'loc',
      body: 'body',
      isBuiltin: true,
    };

    const { lastFrame, unmount, waitUntilReady } = render(
      <SkillsList skills={[builtinSkill]} showDescriptions={true} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain('builtin-skill');
    expect(output).toContain('Built-in');

    unmount();
  });
});
