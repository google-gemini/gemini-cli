/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from '../shared/RadioButtonSelect.js';
import type { ToolPermissions, PolicyDecisionValue } from './types.js';

interface PermissionsEditorProps {
  initialPermissions: ToolPermissions;
  onConfirm: (permissions: ToolPermissions) => void;
}

interface PermissionCategory {
  key: keyof ToolPermissions;
  label: string;
  description: string;
}

const CATEGORIES: PermissionCategory[] = [
  {
    key: 'fileRead',
    label: 'File Read',
    description: 'glob, grep, list_directory, read_file',
  },
  {
    key: 'fileWrite',
    label: 'File Write',
    description: 'write_file, replace',
  },
  {
    key: 'shellCommands',
    label: 'Shell Commands',
    description: 'run_shell_command',
  },
  {
    key: 'webSearch',
    label: 'Web Search',
    description: 'google_web_search',
  },
  {
    key: 'webFetch',
    label: 'Web Fetch',
    description: 'web_fetch',
  },
  {
    key: 'mcpServers',
    label: 'MCP Servers',
    description: 'All MCP server tools (mcp_*)',
  },
];

const DECISION_OPTIONS: Array<RadioSelectItem<PolicyDecisionValue>> = [
  {
    label: 'Allow',
    sublabel: 'Auto-approve without asking',
    value: 'allow',
    key: 'allow',
  },
  {
    label: 'Ask User',
    sublabel: 'Prompt for approval each time',
    value: 'ask_user',
    key: 'ask_user',
  },
  {
    label: 'Deny',
    sublabel: 'Block completely',
    value: 'deny',
    key: 'deny',
  },
];

const decisionColor = (decision: PolicyDecisionValue): string => {
  switch (decision) {
    case 'allow':
      return theme.status.success;
    case 'ask_user':
      return theme.status.warning;
    case 'deny':
      return theme.status.error;
    default:
      return theme.text.primary;
  }
};

export const PermissionsEditor: React.FC<PermissionsEditorProps> = ({
  initialPermissions,
  onConfirm,
}) => {
  const [permissions, setPermissions] =
    useState<ToolPermissions>(initialPermissions);
  const [editingCategory, setEditingCategory] = useState<
    keyof ToolPermissions | null
  >(null);

  const handleCategorySelect = useCallback(
    (categoryKey: keyof ToolPermissions) => {
      setEditingCategory(categoryKey);
    },
    [],
  );

  const handleDecisionSelect = useCallback(
    (decision: PolicyDecisionValue) => {
      if (editingCategory) {
        setPermissions((prev) => ({
          ...prev,
          [editingCategory]: decision,
        }));
        setEditingCategory(null);
      }
    },
    [editingCategory],
  );

  const handleSelect = useCallback(
    (value: keyof ToolPermissions | 'confirm') => {
      if (value === 'confirm') {
        onConfirm(permissions);
      } else {
        handleCategorySelect(value);
      }
    },
    [permissions, onConfirm, handleCategorySelect],
  );

  if (editingCategory) {
    const category = CATEGORIES.find((c) => c.key === editingCategory);
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color={theme.text.primary}>
            Set permission for <Text bold>{category?.label}</Text>:
          </Text>
        </Box>
        <RadioButtonSelect
          items={DECISION_OPTIONS}
          onSelect={handleDecisionSelect}
          isFocused={true}
          showNumbers={true}
        />
      </Box>
    );
  }

  const categoryItems: Array<RadioSelectItem<keyof ToolPermissions>> =
    CATEGORIES.map((cat) => ({
      label: `${cat.label}: ${permissions[cat.key].toUpperCase()}`,
      sublabel: cat.description,
      value: cat.key,
      key: cat.key,
    }));

  const confirmItem: RadioSelectItem<'confirm'> = {
    label: 'Confirm and continue',
    sublabel: 'Proceed to sandbox method selection',
    value: 'confirm' as const,
    key: 'confirm',
  };

  const allItems: Array<RadioSelectItem<keyof ToolPermissions | 'confirm'>> = [
    ...categoryItems,
    confirmItem,
  ];

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.text.primary}>
          Configure permissions for each tool category. Select a category to
          change its permission:
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {CATEGORIES.map((cat) => (
          <Box key={cat.key}>
            <Text color={theme.text.secondary}>{cat.label}: </Text>
            <Text color={decisionColor(permissions[cat.key])}>
              {permissions[cat.key].toUpperCase()}
            </Text>
          </Box>
        ))}
      </Box>

      <RadioButtonSelect
        items={allItems}
        onSelect={handleSelect}
        isFocused={true}
        showNumbers={true}
      />
    </Box>
  );
};
