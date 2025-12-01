/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface ShellCommandOutput {
  stdout: string;
  stderr: string;
  error: Error | null;
  exitCode: number;
  signal: string | null;
  backgroundPIDs: number[] | null;
  processGroupPGID: number | null;
}

interface ShellRunner {
  (command: string, description: string): Promise<ShellCommandOutput>;
}

const defaultShellRunner: ShellRunner = async (command, description) =>
  run_shell_command({ command, description });

export const getRemoteName = async (
  gitUrl: string,
  shellRunner: ShellRunner = defaultShellRunner,
): Promise<string | undefined> => {
  try {
    const { stdout } = await shellRunner(
      'git remote -v',
      'Listing git remotes',
    );
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const remoteName = parts[0];
        const remoteUrl = parts[1];
        if (remoteUrl === gitUrl) {
          return remoteName;
        }
      }
    }
  } catch (error) {
    console.error('Failed to get git remote name:', error);
  }
  return undefined;
};
