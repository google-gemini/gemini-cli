/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChatRecordingService,
  generateSummary,
  writeToStderr,
  writeToStdout,
  type Config,
} from '@google/gemini-cli-core';
import {
  formatRelativeTime,
  SessionSelector,
  type SessionInfo,
} from './sessionUtils.js';

export async function listSessions(config: Config): Promise<void> {
  // Generate summary for most recent session if needed
  await generateSummary(config);

  const sessionSelector = new SessionSelector(config);
  const sessions = await sessionSelector.listSessions();

  if (sessions.length === 0) {
    writeToStdout('No previous sessions found for this project.');
    return;
  }

  writeToStdout(
    `\nAvailable sessions for this project (${sessions.length}):\n`,
  );

  const columns = process.stdout.columns || 100;

  sessions
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    )
    .forEach((session, index) => {
      const current = session.isCurrentSession ? ', current' : '';
      const time = formatRelativeTime(session.lastUpdated);
      const identifiers = session.alias
        ? `${session.alias}, ${session.id}`
        : session.id;

      const prefix = `  ${index + 1}. `;
      const suffix = ` (${time}${current}) [${identifiers}]`;

      // Calculate available space for the title, ensuring at least 10 chars
      const availableTitleLength = Math.max(
        10,
        columns - prefix.length - suffix.length,
      );

      const title =
        session.displayName.length > availableTitleLength
          ? session.displayName.slice(0, availableTitleLength - 3) + '...'
          : session.displayName;

      writeToStdout(`${prefix}${title}${suffix}\n`);
    });
}

export async function deleteSession(
  config: Config,
  sessionIndex: string,
): Promise<void> {
  const sessionSelector = new SessionSelector(config);
  const sessions = await sessionSelector.listSessions();

  if (sessions.length === 0) {
    writeToStderr('No sessions found for this project.');
    return;
  }

  // Sort sessions by start time to match list-sessions ordering
  const sortedSessions = sessions.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  let sessionToDelete: SessionInfo;

  // Try to find by UUID first
  const sessionByUuid = sortedSessions.find(
    (session) => session.id === sessionIndex,
  );
  if (sessionByUuid) {
    sessionToDelete = sessionByUuid;
  } else {
    // Parse session index
    const index = parseInt(sessionIndex, 10);
    if (isNaN(index) || index < 1 || index > sessions.length) {
      writeToStderr(
        `Invalid session identifier "${sessionIndex}". Use --list-sessions to see available sessions.`,
      );
      return;
    }
    sessionToDelete = sortedSessions[index - 1];
  }

  // Prevent deleting the current session
  if (sessionToDelete.isCurrentSession) {
    writeToStderr('Cannot delete the current active session.');
    return;
  }

  try {
    // Use ChatRecordingService to delete the session
    const chatRecordingService = new ChatRecordingService(config);
    await chatRecordingService.deleteSession(sessionToDelete.file);

    const time = formatRelativeTime(sessionToDelete.lastUpdated);
    writeToStdout(
      `Deleted session ${sessionToDelete.index}: ${sessionToDelete.firstUserMessage} (${time})`,
    );
  } catch (error) {
    writeToStderr(
      `Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
