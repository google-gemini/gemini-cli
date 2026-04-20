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
import { useKeypress } from '../../hooks/useKeypress.js';
import { ProjectTypeSelector } from './ProjectTypeSelector.js';
import { PermissionsEditor } from './PermissionsEditor.js';
import { SandboxMethodSelector } from './SandboxMethodSelector.js';
import { PolicyReview } from './PolicyReview.js';
import {
  WizardStep,
  ProjectType,
  SandboxMethod,
  PROJECT_TYPE_PRESETS,
  type WizardData,
  type ToolPermissions,
} from './types.js';

interface SandboxWizardProps {
  onComplete: () => void;
  onCancel: () => void;
  config: Config | null;
}

export const SandboxWizard: React.FC<SandboxWizardProps> = ({
  onComplete,
  onCancel,
  config,
}) => {
  const [step, setStep] = useState<WizardStep>(WizardStep.PROJECT_TYPE);
  const [wizardData, setWizardData] = useState<WizardData>({
    projectType: ProjectType.CUSTOM,
    permissions: PROJECT_TYPE_PRESETS[ProjectType.CUSTOM],
    sandboxMethod: SandboxMethod.NONE,
  });

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (step === WizardStep.PROJECT_TYPE) {
          onCancel();
        } else {
          setStep((s) => (s - 1) as WizardStep);
        }
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const handleProjectTypeSelect = useCallback((projectType: ProjectType) => {
    const permissions = PROJECT_TYPE_PRESETS[projectType];
    setWizardData((prev) => ({ ...prev, projectType, permissions }));
    setStep(WizardStep.PERMISSIONS);
  }, []);

  const handlePermissionsConfirm = useCallback(
    (permissions: ToolPermissions) => {
      setWizardData((prev) => ({ ...prev, permissions }));
      setStep(WizardStep.SANDBOX_METHOD);
    },
    [],
  );

  const handleSandboxMethodSelect = useCallback(
    (sandboxMethod: SandboxMethod) => {
      setWizardData((prev) => ({ ...prev, sandboxMethod }));
      setStep(WizardStep.REVIEW);
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const totalSteps = 4;

  const renderStep = () => {
    switch (step) {
      case WizardStep.PROJECT_TYPE:
        return <ProjectTypeSelector onSelect={handleProjectTypeSelect} />;
      case WizardStep.PERMISSIONS:
        return (
          <PermissionsEditor
            initialPermissions={wizardData.permissions}
            onConfirm={handlePermissionsConfirm}
          />
        );
      case WizardStep.SANDBOX_METHOD:
        return <SandboxMethodSelector onSelect={handleSandboxMethodSelect} />;
      case WizardStep.REVIEW:
        return (
          <PolicyReview
            wizardData={wizardData}
            onConfirm={handleConfirm}
            onCancel={onCancel}
            config={config}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      padding={1}
      width="100%"
    >
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Sandbox Security Policy Setup
        </Text>
        <Text color={theme.text.secondary}>
          {' '}
          [Step {step}/{totalSteps}]
        </Text>
      </Box>

      {renderStep()}

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {step > WizardStep.PROJECT_TYPE ? 'Esc: Back' : 'Esc: Cancel'}
          {' | '}
          Enter: Select
        </Text>
      </Box>
    </Box>
  );
};
