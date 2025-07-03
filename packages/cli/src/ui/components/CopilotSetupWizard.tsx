/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

interface CopilotSetupWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

interface SetupStep {
  title: string;
  description: string;
  status: 'pending' | 'checking' | 'success' | 'error';
  errorMessage?: string;
}

export function CopilotSetupWizard({ onComplete, onCancel }: CopilotSetupWizardProps): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [steps, setSteps] = useState<SetupStep[]>([
    {
      title: 'VSCode Installation',
      description: 'Checking if VSCode is installed...',
      status: 'checking',
    },
    {
      title: 'VSCode Bridge Extension',
      description: 'Checking if the bridge extension is running...',
      status: 'pending',
    },
    {
      title: 'GitHub Copilot',
      description: 'Checking GitHub Copilot availability...',
      status: 'pending',
    },
  ]);

  const updateStepStatus = (index: number, status: SetupStep['status'], errorMessage?: string) => {
    setSteps(prev => {
      const newSteps = [...prev];
      newSteps[index] = { ...newSteps[index], status, errorMessage };
      return newSteps;
    });
  };

  // Check VSCode installation
  useEffect(() => {
    if (steps[0].status === 'checking') {
      const checkVSCode = async () => {
        try {
          await execAsync('code --version');
          updateStepStatus(0, 'success');
          setCurrentStep(1);
          updateStepStatus(1, 'checking');
        } catch {
          updateStepStatus(0, 'error', 'VSCode is not installed or not in PATH');
        }
      };
      checkVSCode();
    }
  }, [retryCount, steps]);

  // Check Bridge Extension
  useEffect(() => {
    if (currentStep === 1 && steps[1].status === 'checking') {
      const checkBridge = async () => {
        try {
          const response = await axios.get('http://localhost:7337/health', { timeout: 2000 });
          if (response.data.status === 'ok') {
            updateStepStatus(1, 'success');
            setCurrentStep(2);
            updateStepStatus(2, 'checking');
          } else {
            throw new Error('Bridge not healthy');
          }
        } catch {
          updateStepStatus(1, 'error', 'VSCode bridge extension is not running');
        }
      };
      checkBridge();
    }
  }, [currentStep, steps]);

  // Check GitHub Copilot
  useEffect(() => {
    if (currentStep === 2 && steps[2].status === 'checking') {
      const checkCopilot = async () => {
        try {
          const response = await axios.get('http://localhost:7337/health', { timeout: 2000 });
          if (response.data.copilot === 'available') {
            updateStepStatus(2, 'success');
            // All checks passed
            setTimeout(() => onComplete(), 1500);
          } else {
            updateStepStatus(2, 'error', 'GitHub Copilot is not available in VSCode');
          }
        } catch {
          updateStepStatus(2, 'error', 'Could not verify GitHub Copilot status');
        }
      };
      checkCopilot();
    }
  }, [currentStep, steps, onComplete]);

  const resetAndRetry = () => {
    setCurrentStep(0);
    setRetryCount(prev => prev + 1);
    setSteps([
      {
        title: 'VSCode Installation',
        description: 'Checking if VSCode is installed...',
        status: 'checking',
      },
      {
        title: 'VSCode Bridge Extension',
        description: 'Checking if the bridge extension is running...',
        status: 'pending',
      },
      {
        title: 'GitHub Copilot',
        description: 'Checking GitHub Copilot availability...',
        status: 'pending',
      },
    ]);
  };

  useInput((input, key) => {
    if (key.escape || (input === 'q' && !key.ctrl)) {
      onCancel();
    }
    if (key.return && steps.some(s => s.status === 'error')) {
      resetAndRetry();
    }
  });

  const hasErrors = steps.some(s => s.status === 'error');

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentPurple}>
          GitHub Copilot Setup Wizard
        </Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        {steps.map((step, index) => (
          <Box key={index} flexDirection="column">
            <Box>
              {step.status === 'pending' && <Text color={Colors.Gray}>○ </Text>}
              {step.status === 'checking' && <Text color={Colors.AccentBlue}>◐ </Text>}
              {step.status === 'success' && <Text color={Colors.AccentGreen}>✓ </Text>}
              {step.status === 'error' && <Text color={Colors.AccentRed}>✗ </Text>}
              <Text bold={step.status === 'checking'}>{step.title}</Text>
            </Box>
            <Box marginLeft={2}>
              <Text color={step.status === 'error' ? Colors.AccentRed : Colors.Gray}>
                {step.status === 'error' && step.errorMessage ? step.errorMessage : step.description}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>

      {hasErrors && (
        <Box marginTop={1} flexDirection="column">
          <Text color={Colors.AccentYellow}>
            Setup incomplete. Please resolve the issues above:
          </Text>
          {steps[0].status === 'error' && (
            <Box marginTop={1}>
              <Text>• Install VSCode from: https://code.visualstudio.com/</Text>
            </Box>
          )}
          {steps[1].status === 'error' && (
            <Box marginTop={1} flexDirection="column">
              <Text>• Install and start the VSCode bridge:</Text>
              <Text color={Colors.Gray}>  1. Open VSCode</Text>
              <Text color={Colors.Gray}>  2. Install extension from packages/vscode-bridge:</Text>
              <Text color={Colors.Gray}>     - cd packages/vscode-bridge</Text>
              <Text color={Colors.Gray}>     - npm run package</Text>
              <Text color={Colors.Gray}>     - code --install-extension gemini-copilot-bridge-0.1.0.vsix</Text>
              <Text color={Colors.Gray}>  3. Press Cmd/Ctrl+Shift+P to open command palette</Text>
              <Text color={Colors.Gray}>  4. Type "Gemini Copilot: Start Bridge" and press Enter</Text>
              <Text color={Colors.Gray}>  5. Wait for "Bridge started on port 7337" notification</Text>
              <Text color={Colors.Gray}>  6. Return here and press Enter to retry</Text>
            </Box>
          )}
          {steps[2].status === 'error' && (
            <Box marginTop={1} flexDirection="column">
              <Text>• Ensure GitHub Copilot is installed and active:</Text>
              <Text color={Colors.Gray}>  1. Install GitHub Copilot extension in VSCode</Text>
              <Text color={Colors.Gray}>  2. Sign in with your GitHub account</Text>
              <Text color={Colors.Gray}>  3. Ensure you have an active Copilot subscription</Text>
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          {hasErrors ? '(Press Enter to retry or Esc to cancel)' : '(Setting up...)'}
        </Text>
      </Box>
    </Box>
  );
}