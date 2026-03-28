/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type React from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../hooks/useKeypress.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';
import { saveSettings } from '../../config/settings.js';
import type { LoadedSettings } from '../../config/settings.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import commandExists from 'command-exists';
import * as os from 'node:os';
import { spawn } from 'node:child_process';

type SandboxCommand = 'docker' | 'podman' | 'sandbox-exec' | 'runsc' | 'lxc';

/**
 * Asynchronously checks whether a container runtime is installed and its
 * daemon is reachable. Uses `docker info` / `podman info` (reliable across
 * all platforms including Windows named pipes).
 * On macOS, sandbox-exec needs no daemon so it always counts as ready.
 */
async function checkSandboxRuntime(): Promise<{
  ready: boolean;
  command?: SandboxCommand;
  reason?: string;
}> {
  const platform = os.platform();

  // macOS: sandbox-exec (seatbelt) needs no daemon
  if (
    platform === 'darwin' &&
    (await commandExists('sandbox-exec')
      .then(Boolean)
      .catch(() => false))
  ) {
    return { ready: true, command: 'sandbox-exec' };
  }

  const [hasDocker, hasPodman] = await Promise.all([
    commandExists('docker')
      .then(Boolean)
      .catch(() => false),
    commandExists('podman')
      .then(Boolean)
      .catch(() => false),
  ]);

  if (!hasDocker && !hasPodman) {
    return {
      ready: false,
      reason:
        'Docker or Podman is not installed. Install Docker Desktop (docker.com/get-started) and start it before enabling sandbox.',
    };
  }

  const command = hasDocker ? 'docker' : 'podman';
  const exitCode = await new Promise<number>((resolve) => {
    const proc = spawn(command, ['info'], { stdio: 'ignore' });
    const timer = setTimeout(() => {
      proc.kill();
      resolve(1);
    }, 5000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
  });

  if (exitCode !== 0) {
    const tool = hasDocker ? 'Docker Desktop' : 'Podman';
    return {
      ready: false,
      reason: `${tool} is installed but the daemon is not running. Start ${tool} and try again.`,
    };
  }

  return { ready: true, command };
}

type SandboxProfile = 'web' | 'cli' | 'api' | 'custom';
type WizardStep = 'profile' | 'review' | 'done';
type RuntimeStatus = 'checking' | 'ready' | 'error';

interface SandboxSetupDialogProps {
  onExit: () => void;
  settings: LoadedSettings;
}

const PROFILES: Array<{
  label: string;
  sublabel: string;
  value: SandboxProfile;
  key: string;
}> = [
  {
    label: 'Web App',
    sublabel: 'Network access enabled, isolated filesystem',
    value: 'web',
    key: 'web',
  },
  {
    label: 'CLI Tool',
    sublabel: 'No network access, filesystem isolation',
    value: 'cli',
    key: 'cli',
  },
  {
    label: 'API Service',
    sublabel: 'Network access, strict filesystem isolation',
    value: 'api',
    key: 'api',
  },
  {
    label: 'Custom',
    sublabel: 'Enable sandbox with default settings',
    value: 'custom',
    key: 'custom',
  },
];

const PROFILE_CONFIGS: Record<
  SandboxProfile,
  { enabled: boolean; networkAccess: boolean; allowedPaths: string[] }
> = {
  web: { enabled: true, networkAccess: true, allowedPaths: [] },
  cli: { enabled: true, networkAccess: false, allowedPaths: [] },
  api: { enabled: true, networkAccess: true, allowedPaths: [] },
  custom: { enabled: true, networkAccess: false, allowedPaths: [] },
};

export function SandboxSetupDialog({
  onExit,
  settings,
}: SandboxSetupDialogProps): React.JSX.Element {
  const [step, setStep] = useState<WizardStep>('profile');
  const [selectedProfile, setSelectedProfile] = useState<SandboxProfile>('cli');
  const [error, setError] = useState<string | null>(null);
  // Resolved sandbox command (e.g. 'docker') stored after the async runtime check
  const [sandboxCommand, setSandboxCommand] =
    useState<SandboxCommand>('docker');
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('checking');
  const { handleRestart } = useUIActions();

  // Run the runtime check asynchronously whenever the review step is entered
  useEffect(() => {
    if (step !== 'review') return;
    let cancelled = false;
    setRuntimeStatus('checking');
    setError(null);
    void checkSandboxRuntime().then((result) => {
      if (cancelled) return;
      if (result.ready) {
        setSandboxCommand(result.command ?? 'docker');
        setRuntimeStatus('ready');
      } else {
        setError(result.reason ?? 'Sandbox runtime not available.');
        setRuntimeStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
        return true;
      }

      if (step === 'review' && key.name === 'enter') {
        // Only advance once the runtime check has confirmed a runtime is available
        if (runtimeStatus === 'ready') {
          setError(null);
          setStep('done');
        }
        return true;
      }

      if (step === 'done') {
        // 'r' — session only: pass env via IPC so the next child picks up sandbox,
        // but settings.json is NOT modified (sandbox won't persist after that session)
        if (key.name === 'r') {
          if (process.send) {
            process.send({
              type: 'session-env-update',
              env: { GEMINI_SANDBOX: sandboxCommand },
            });
          }
          void handleRestart();
          return true;
        }
        // 's' — permanent: write to settings.json then restart
        if (key.name === 's') {
          try {
            const config = {
              ...PROFILE_CONFIGS[selectedProfile],
              command: sandboxCommand,
            };
            const workspaceFile = settings.workspace;
            if (!workspaceFile.settings.tools) {
              workspaceFile.settings.tools = {};
            }
            workspaceFile.settings.tools.sandbox = config;
            saveSettings(workspaceFile);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return true;
          }
          void handleRestart();
          return true;
        }
      }

      return false;
    },
    { isActive: true },
  );

  function handleProfileSelect(profile: SandboxProfile) {
    setSelectedProfile(profile);
    setStep('review');
  }

  const config = PROFILE_CONFIGS[selectedProfile];

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
    >
      <Box flexDirection="column" paddingBottom={1}>
        <Text bold>{'> '}Sandbox Setup Wizard</Text>
        <Box marginTop={1} />
        {step === 'profile' && (
          <Text color={theme.text.secondary}>
            Step 1 of 2 — Choose a security profile for this project
          </Text>
        )}
        {step === 'review' && (
          <Text color={theme.text.secondary}>
            Step 2 of 2 — Review and confirm
          </Text>
        )}
        {step === 'done' && <Text color={theme.text.secondary}>Done</Text>}
      </Box>

      {step === 'profile' && (
        <RadioButtonSelect
          items={PROFILES}
          onSelect={handleProfileSelect}
          isFocused={true}
        />
      )}

      {step === 'review' && (
        <Box flexDirection="column">
          <Text>
            Profile: <Text bold>{selectedProfile.toUpperCase()}</Text>
          </Text>
          <Text>
            Network access:{' '}
            <Text
              bold
              color={
                config.networkAccess
                  ? theme.status.success
                  : theme.status.warning
              }
            >
              {config.networkAccess ? 'Yes' : 'No'}
            </Text>
          </Text>
          <Text>
            Allowed paths:{' '}
            <Text bold>
              {config.allowedPaths.length === 0
                ? 'none (strict isolation)'
                : config.allowedPaths.join(', ')}
            </Text>
          </Text>
          <Box marginTop={1}>
            {runtimeStatus === 'checking' && (
              <Text color={theme.text.secondary}>
                Checking sandbox runtime…
              </Text>
            )}
            {runtimeStatus === 'error' && (
              <Text color={theme.status.error}>{error}</Text>
            )}
            {runtimeStatus === 'ready' && (
              <Text color={theme.text.secondary}>
                (Press Enter to continue, Esc to cancel)
              </Text>
            )}
          </Box>
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text bold color={theme.status.success}>
            Ready — how would you like to enable sandbox?
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text>
              <Text bold color={theme.text.accent}>
                r
              </Text>
              <Text color={theme.text.secondary}>
                {' '}
                — This session only (restart now, no settings change)
              </Text>
            </Text>
            <Text>
              <Text bold color={theme.text.accent}>
                s
              </Text>
              <Text color={theme.text.secondary}>
                {' '}
                — Save permanently to .gemini/settings.json then restart
              </Text>
            </Text>
            <Text>
              <Text bold color={theme.text.accent}>
                Esc
              </Text>
              <Text color={theme.text.secondary}> — Cancel</Text>
            </Text>
          </Box>
          {error && (
            <Box marginTop={1}>
              <Text color={theme.status.error}>{error}</Text>
            </Box>
          )}
        </Box>
      )}

      {step === 'profile' && (
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            (Use arrows to navigate, Enter to select, Esc to close)
          </Text>
        </Box>
      )}
    </Box>
  );
}
