/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from '../shared/RadioButtonSelect.js';
import { ProjectType } from './types.js';

interface ProjectTypeSelectorProps {
  onSelect: (projectType: ProjectType) => void;
}

const projectTypeOptions: Array<RadioSelectItem<ProjectType>> = [
  {
    label: 'Web Application',
    sublabel: 'Read allowed, writes/shell need approval, web access allowed',
    value: ProjectType.WEB_APP,
    key: 'web_app',
  },
  {
    label: 'CLI Tool',
    sublabel: 'Read allowed, writes/shell need approval, no web fetch/MCP',
    value: ProjectType.CLI_TOOL,
    key: 'cli_tool',
  },
  {
    label: 'API Server',
    sublabel: 'Read allowed, writes/shell need approval, web access allowed',
    value: ProjectType.API_SERVER,
    key: 'api_server',
  },
  {
    label: 'Data Science',
    sublabel: 'Permissive: all file/shell/web allowed, no MCP',
    value: ProjectType.DATA_SCIENCE,
    key: 'data_science',
  },
  {
    label: 'Custom',
    sublabel: 'Start with conservative defaults, customize in next step',
    value: ProjectType.CUSTOM,
    key: 'custom',
  },
];

export const ProjectTypeSelector: React.FC<ProjectTypeSelectorProps> = ({
  onSelect,
}) => (
  <Box flexDirection="column">
    <Box marginBottom={1}>
      <Text color={theme.text.primary}>
        Select your project type to apply recommended security defaults:
      </Text>
    </Box>
    <RadioButtonSelect
      items={projectTypeOptions}
      onSelect={onSelect}
      isFocused={true}
      showNumbers={true}
    />
  </Box>
);
