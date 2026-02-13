/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  generateSummary,
  writeToStderr,
  writeToStdout,
  type Config,
} from '@google/gemini-cli-core';
import {
  deleteSessionArtifacts,
  formatRelativeTime,
  SessionError,
  SessionSelector,
  type SessionInfo,
} from './sessionUtils.js';

export async function listSessions(config: Config): Promise<void> {
  // Generate summary for most recent session if needed
  await generateSummary(config);

  const sessionSelector = new SessionSelector(config);
  const sessions = await sessionSelector.listSessions();

  if (sessions.length === 0) {
    writeToStdout('No previous sessions found.');
    return;
  }

  writeToStdout(`\nAvailable sessions (${sessions.length}):\n`);

  sessions
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    )
    .forEach((session, index) => {
      const current = session.isCurrentSession ? ', current' : '';
      const time = formatRelativeTime(session.lastUpdated);
      const folder = session.projectRoot || '(unknown project)';
      writeToStdout(
        `  ${index + 1}. ${session.sessionName} (${time}${current})\n`,
      );
      writeToStdout(`     ${folder}\n`);
    });
}

export async function deleteSession(
  config: Config,
  sessionIndex: string,
): Promise<void> {
  const sessionSelector = new SessionSelector(config);
  const sessions = await sessionSelector.listSessions();

  if (sessions.length === 0) {
    writeToStderr('No sessions found.');
    return;
  }
  let sessionToDelete: SessionInfo;
  try {
    sessionToDelete = await sessionSelector.findSession(sessionIndex);
  } catch (error) {
    if (error instanceof SessionError) {
      writeToStderr(error.message);
      return;
    }
    throw error;
  }

  // Prevent deleting the current session
  if (sessionToDelete.isCurrentSession) {
    writeToStderr('Cannot delete the current active session.');
    return;
  }

  try {
    await deleteSessionArtifacts(sessionToDelete);

    const time = formatRelativeTime(sessionToDelete.lastUpdated);
    writeToStdout(
      `Deleted session: ${sessionToDelete.sessionName} (${time})`,
    );
  } catch (error) {
    writeToStderr(
      `Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
