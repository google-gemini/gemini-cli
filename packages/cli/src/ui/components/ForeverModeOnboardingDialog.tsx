/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box, Text } from 'ink';
import { useState } from 'react';
import { theme } from '../semantic-colors.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { relaunchApp } from '../../utils/processUtils.js';
import { GEMINI_DIR, DEFAULT_CONTEXT_FILENAME } from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { useTextBuffer } from './shared/text-buffer.js';
import { TextInput } from './shared/TextInput.js';

enum Step {
  MISSION,
  FIRST_STEPS,
  SISYPHUS_CONFIG,
  SAVING,
  ERROR,
}

export const ForeverModeOnboardingDialog = ({
  onComplete,
}: {
  onComplete: () => void;
}) => {
  const config = useConfig();
  const [step, setStep] = useState(Step.MISSION);
  const [sisyphusFocus, setSisyphusFocus] = useState<'timeout' | 'prompt'>(
    'timeout',
  );
  const [error, setError] = useState<string | null>(null);

  const missionBuffer = useTextBuffer({
    initialText: '',
    viewport: { width: 80, height: 3 },
    singleLine: false,
  });

  const firstStepsBuffer = useTextBuffer({
    initialText: '',
    viewport: { width: 80, height: 5 },
    singleLine: false,
  });

  const sisyphusTimeoutBuffer = useTextBuffer({
    initialText: '',
    viewport: { width: 50, height: 1 },
    singleLine: true,
  });

  const sisyphusPromptBuffer = useTextBuffer({
    initialText: 'continue',
    viewport: { width: 50, height: 1 },
    singleLine: true,
  });

  const handleMissionSubmit = () => {
    if (missionBuffer.text.trim()) setStep(Step.FIRST_STEPS);
  };

  const handleFirstStepsSubmit = () => {
    if (firstStepsBuffer.text.trim()) setStep(Step.SISYPHUS_CONFIG);
  };

  const handleSisyphusTimeoutSubmit = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setSisyphusFocus('prompt');
    } else {
      void handleSaveSettings();
    }
  };

  const handleSisyphusPromptSubmit = () => {
    void handleSaveSettings();
  };

  const handleSaveSettings = async () => {
    setStep(Step.SAVING);
    try {
      const timeoutNum = parseInt(sisyphusTimeoutBuffer.text, 10);
      const hasSisyphus = !isNaN(timeoutNum) && timeoutNum > 0;

      let frontmatter = '---\n';
      frontmatter += 'sisyphus:\n';
      frontmatter += `  enabled: ${hasSisyphus}\n`;
      if (hasSisyphus) {
        frontmatter += `  idleTimeout: ${timeoutNum}\n`;
        if (sisyphusPromptBuffer.text.trim()) {
          frontmatter += `  prompt: "${sisyphusPromptBuffer.text.trim()}"\n`;
        }
      }
      frontmatter += '---\n\n';

      let content = frontmatter;
      if (missionBuffer.text.trim()) {
        content += `# Mission\n${missionBuffer.text.trim()}\n\n`;
      }

      const geminiDir = path.join(config.getTargetDir(), GEMINI_DIR);
      await fs.mkdir(geminiDir, { recursive: true });
      await fs.writeFile(
        path.join(geminiDir, DEFAULT_CONTEXT_FILENAME),
        content,
        'utf-8',
      );

      if (firstStepsBuffer.text.trim()) {
        await fs.writeFile(
          path.join(geminiDir, '.onboarding_prompt'),
          firstStepsBuffer.text.trim(),
          'utf-8',
        );
      }

      try {
        execSync('git init', { cwd: geminiDir, stdio: 'ignore' });
        execSync('git add .', { cwd: geminiDir, stdio: 'ignore' });
        execSync('git commit -m "chore(memory): initialize gemini memory"', {
          cwd: geminiDir,
          stdio: 'ignore',
        });
      } catch (_e) {
        // Ignore git errors if git is not installed or user has no git config
      }

      onComplete(); // Before relaunch
      await relaunchApp();
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError(String(e));
      }
      setStep(Step.ERROR);
    }
  };

  if (step === Step.ERROR) {
    return (
      <Box
        flexDirection="column"
        padding={1}
        borderStyle="round"
        borderColor={theme.border.default}
      >
        <Text color={theme.status.error} bold>
          Failed to generate config
        </Text>
        <Text>{error}</Text>
        <Text color={theme.text.secondary}>
          Please create the .gemini/GEMINI.md file manually and try again.
        </Text>
      </Box>
    );
  }

  if (step === Step.SAVING) {
    return (
      <Box padding={1} borderStyle="round" borderColor={theme.border.default}>
        <Text color={theme.text.accent}>
          Saving your configuration... please wait.
        </Text>
      </Box>
    );
  }

  if (step === Step.MISSION) {
    return (
      <Box
        flexDirection="column"
        padding={1}
        borderStyle="round"
        borderColor={theme.border.default}
      >
        <Text color={theme.status.success} bold>
          Welcome to Forever Mode!
        </Text>
        <Text>
          You launched the CLI with <Text bold>--forever</Text>, which runs the
          agent continuously.
        </Text>
        <Text>
          To get started, we need to set up your{' '}
          <Text bold>.gemini/GEMINI.md</Text> configuration file.
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary} bold>
            What is the primary mission of the agent?
          </Text>
          <Text color={theme.text.secondary}>
            (e.g. &quot;Refactor the authentication module to use OAuth2&quot;)
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.primary}>❯ </Text>
            <TextInput
              buffer={missionBuffer}
              onSubmit={handleMissionSubmit}
              focus={true}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (step === Step.FIRST_STEPS) {
    return (
      <Box
        flexDirection="column"
        padding={1}
        borderStyle="round"
        borderColor={theme.border.default}
      >
        <Text color={theme.text.primary} bold>
          What are the immediate first steps?
        </Text>
        <Text color={theme.text.secondary}>
          (e.g. &quot;Investigate src/auth.ts and propose changes&quot;)
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>❯ </Text>
          <TextInput
            buffer={firstStepsBuffer}
            onSubmit={handleFirstStepsSubmit}
            focus={true}
          />
        </Box>
      </Box>
    );
  }

  if (step === Step.SISYPHUS_CONFIG) {
    return (
      <Box
        flexDirection="column"
        padding={1}
        borderStyle="round"
        borderColor={theme.border.default}
      >
        <Text color={theme.text.primary} bold>
          Sisyphus Mode (Auto-resume)
        </Text>
        <Text>
          If the agent completes a task and remains idle, it can automatically
          resume itself by sending a specific prompt.
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>
            Enter idle timeout in minutes before the agent automatically resumes
            (leave blank to disable):
          </Text>
          <Box>
            <Text
              color={
                sisyphusFocus === 'timeout'
                  ? theme.text.primary
                  : theme.text.secondary
              }
            >
              ❯{' '}
            </Text>
            <TextInput
              buffer={sisyphusTimeoutBuffer}
              onSubmit={handleSisyphusTimeoutSubmit}
              focus={sisyphusFocus === 'timeout'}
            />
          </Box>
        </Box>

        {sisyphusFocus === 'prompt' && (
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text.secondary}>
              What prompt should be sent when Sisyphus triggers?
            </Text>
            <Box>
              <Text color={theme.text.primary}>❯ </Text>
              <TextInput
                buffer={sisyphusPromptBuffer}
                onSubmit={handleSisyphusPromptSubmit}
                focus={sisyphusFocus === 'prompt'}
              />
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  if (step === Step.SAVING) {
    return (
      <Box padding={1} borderStyle="round" borderColor={theme.border.default}>
        <Text>Saving your settings and launching the agent...</Text>
      </Box>
    );
  }

  if (step === Step.ERROR && error) {
    return (
      <Box
        flexDirection="column"
        padding={1}
        borderStyle="round"
        borderColor={theme.status.error}
      >
        <Text color={theme.status.error} bold>
          Error
        </Text>
        <Text>{error}</Text>
        <Text color={theme.text.secondary}>
          Press Ctrl+C to exit and try again.
        </Text>
      </Box>
    );
  }

  return null;
};
