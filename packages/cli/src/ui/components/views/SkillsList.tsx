/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { type SkillDefinition } from '../../types.js';

interface SkillsListProps {
  skills: readonly SkillDefinition[];
  showDescriptions: boolean;
}

export const SkillsList: React.FC<SkillsListProps> = ({
  skills,
  showDescriptions,
}) => {
  const sortSkills = (a: SkillDefinition, b: SkillDefinition) => {
    if (a.isBuiltin === b.isBuiltin) {
      return a.name.localeCompare(b.name);
    }
    return a.isBuiltin ? 1 : -1;
  };

  const enabledSkills = skills.filter((s) => !s.disabled).sort(sortSkills);

  const disabledSkills = skills.filter((s) => s.disabled).sort(sortSkills);

  const renderSkill = (skill: SkillDefinition) => (
    <Box key={skill.name} flexDirection="row">
      <Text color={theme.text.primary}>{'  '}- </Text>
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text
            bold
            color={skill.disabled ? theme.text.secondary : theme.text.link}
          >
            {skill.name}
          </Text>
          {skill.isBuiltin && (
            <Text color={theme.text.secondary}>{' [Built-in]'}</Text>
          )}
        </Box>
        {showDescriptions && skill.description && (
          <Box marginLeft={2}>
            <Text
              color={skill.disabled ? theme.text.secondary : theme.text.primary}
            >
              {skill.description}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      {enabledSkills.length > 0 && (
        <Box flexDirection="column">
          <Text bold color={theme.text.primary}>
            Available Agent Skills:
          </Text>
          <Box height={1} />
          {enabledSkills.map(renderSkill)}
        </Box>
      )}

      {enabledSkills.length > 0 && disabledSkills.length > 0 && (
        <Box marginY={1}>
          <Text color={theme.text.secondary}>{'-'.repeat(20)}</Text>
        </Box>
      )}

      {disabledSkills.length > 0 && (
        <Box flexDirection="column">
          <Text bold color={theme.text.secondary}>
            Disabled Skills:
          </Text>
          <Box height={1} />
          {disabledSkills.map(renderSkill)}
        </Box>
      )}

      {skills.length === 0 && (
        <Text color={theme.text.primary}> No skills available</Text>
      )}
    </Box>
  );
};
