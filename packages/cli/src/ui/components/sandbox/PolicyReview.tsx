/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import type { Config } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from '../shared/RadioButtonSelect.js';
import {
  generatePolicyToml,
  getSandboxCommand,
} from '../../../utils/policyWriter.js';
import type { WizardData, ToolPermissions } from './types.js';
import { SandboxMethod } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PolicyReviewProps {
  wizardData: WizardData;
  onConfirm: () => void;
  onCancel: () => void;
  config: Config | null;
}

type ReviewAction = 'save_workspace' | 'save_user' | 'cancel';

const reviewOptions: Array<RadioSelectItem<ReviewAction>> = [
  {
    label: 'Save to workspace (.gemini/policies/)',
    sublabel: 'Applies only to this project',
    value: 'save_workspace',
    key: 'save_workspace',
  },
  {
    label: 'Save to user (~/.gemini/policies/)',
    sublabel: 'Applies to all projects',
    value: 'save_user',
    key: 'save_user',
  },
  {
    label: 'Cancel',
    sublabel: 'Discard and exit wizard',
    value: 'cancel',
    key: 'cancel',
  },
];

export const PolicyReview: React.FC<PolicyReviewProps> = ({
  wizardData,
  onConfirm,
  onCancel,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tomlContent = generatePolicyToml(wizardData);
  const sandboxCmd = getSandboxCommand(wizardData.sandboxMethod);

  const savePolicyFile = useCallback(
    (scope: 'workspace' | 'user') => {
      setSaving(true);
      setError(null);

      try {
        let policiesDir: string;
        if (scope === 'workspace') {
          policiesDir = path.join(process.cwd(), '.gemini', 'policies');
        } else {
          const homeDir =
            process.env['HOME'] || process.env['USERPROFILE'] || '~';
          policiesDir = path.join(homeDir, '.gemini', 'policies');
        }

        fs.mkdirSync(policiesDir, { recursive: true });

        const filePath = path.join(policiesDir, 'sandbox-wizard.toml');
        fs.writeFileSync(filePath, tomlContent, 'utf-8');

        onConfirm();
      } catch (err) {
        setError(
          `Failed to save policy: ${err instanceof Error ? err.message : String(err)}`,
        );
        setSaving(false);
      }
    },
    [tomlContent, onConfirm],
  );

  const handleSelect = useCallback(
    (action: ReviewAction) => {
      switch (action) {
        case 'save_workspace':
          savePolicyFile('workspace');
          break;
        case 'save_user':
          savePolicyFile('user');
          break;
        case 'cancel':
          onCancel();
          break;
        default:
          break;
      }
    },
    [savePolicyFile, onCancel],
  );

  const permKeys: Array<keyof ToolPermissions> = [
    'fileRead',
    'fileWrite',
    'shellCommands',
    'webSearch',
    'webFetch',
    'mcpServers',
  ];

  const formatLabel = (key: string): string =>
    key.replace(/([A-Z])/g, ' $1').trim();

  const decisionColor = (value: string): string => {
    if (value === 'allow') return theme.status.success;
    if (value === 'deny') return theme.status.error;
    return theme.status.warning;
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.text.primary} bold>
          Review your security policy:
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.secondary}>
          Project Type:{' '}
          <Text color={theme.text.primary}>
            {wizardData.projectType.replace('_', ' ').toUpperCase()}
          </Text>
        </Text>
        <Text color={theme.text.secondary}>
          Sandbox:{' '}
          <Text color={theme.text.primary}>
            {wizardData.sandboxMethod === SandboxMethod.NONE
              ? 'Policy Only'
              : `${wizardData.sandboxMethod} (${sandboxCmd})`}
          </Text>
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.primary} bold>
          Permissions:
        </Text>
        {permKeys.map((key) => {
          const value = wizardData.permissions[key];
          return (
            <Box key={key}>
              <Text color={theme.text.secondary}>{formatLabel(key)}: </Text>
              <Text color={decisionColor(value)}>{value.toUpperCase()}</Text>
            </Box>
          );
        })}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.text.primary} bold>
          Generated TOML:
        </Text>
        <Box
          borderStyle="single"
          borderColor={theme.border.default}
          paddingX={1}
        >
          <Text color={theme.text.secondary}>{tomlContent}</Text>
        </Box>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}

      {saving ? (
        <Text color={theme.status.warning}>Saving policy...</Text>
      ) : (
        <RadioButtonSelect
          items={reviewOptions}
          onSelect={handleSelect}
          isFocused={true}
          showNumbers={true}
        />
      )}
    </Box>
  );
};
