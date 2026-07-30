/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  deleteStoredSession,
  generateSummary,
  writeToStderr,
  writeToStdout,
  type Config,
  Storage,
  ProjectRegistry,
  debugLogger,
} from '@google/gemini-cli-core';
import {
  formatRelativeTime,
  SessionSelector,
  type SessionInfo,
  getSessionFiles,
} from './sessionUtils.js';
import * as path from 'node:path';

export async function listSessions(config: Config): Promise<void> {
  // Generate summary for most recent session if needed
  await generateSummary(config);

  const sessionSelector = new SessionSelector(config.storage);
  const sessions = await sessionSelector.listSessions();

  if (sessions.length === 0) {
    writeToStdout('No previous sessions found for this project.');
    return;
  }

  writeToStdout(
    `\nAvailable sessions for this project (${sessions.length}):\n`,
  );

  sessions
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    )
    .forEach((session, index) => {
      const current = session.isCurrentSession ? ', current' : '';
      const time = formatRelativeTime(session.lastUpdated);
      const title =
        session.displayName.length > 100
          ? session.displayName.slice(0, 97) + '...'
          : session.displayName;
      writeToStdout(
        `  ${index + 1}. ${title} (${time}${current}) [${session.id}]\n`,
      );
    });
}

export async function deleteSession(
  config: Config,
  sessionIndex: string,
): Promise<void> {
  const sessionSelector = new SessionSelector(config.storage);
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
    await deleteStoredSession(config, sessionToDelete.file);

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

export async function listAllSessions(config: Config): Promise<void> {
  const registryPath = path.join(Storage.getGlobalGeminiDir(), 'projects.json');
  const registry = new ProjectRegistry(registryPath, [
    Storage.getGlobalTempDir(),
    path.join(Storage.getGlobalGeminiDir(), 'history'),
  ]);
  await registry.initialize();

  const projects = registry.getProjects();
  const projectPaths = Object.keys(projects);

  if (projectPaths.length === 0) {
    writeToStdout('No workspaces found in the project registry.\n');
    return;
  }

  interface FlatSessionInfo extends SessionInfo {
    projectPath: string;
    projectSlug: string;
  }
  const allSessions: FlatSessionInfo[] = [];

  for (const projectPath of projectPaths) {
    const shortId = projects[projectPath];
    const chatsDir = path.join(Storage.getGlobalTempDir(), shortId, 'chats');

    try {
      const sessions = await getSessionFiles(chatsDir, config.getSessionId());
      for (const session of sessions) {
        allSessions.push({
          ...session,
          projectPath,
          projectSlug: shortId,
        });
      }
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'EACCES')
      ) {
        // Expected FS errors if directory doesn't exist or is unreadable - ignore silently
      } else {
        // Log other unexpected errors
        debugLogger.error(`Failed to load sessions from ${chatsDir}:`, error);
      }
    }
  }

  if (allSessions.length === 0) {
    writeToStdout('No previous sessions found across any workspaces.\n');
    return;
  }

  const currentProjectRoot = config.storage.getProjectRoot();

  if (config.getGroupByWorkspace()) {
    // ---- Grouped Workspace Mode ----
    writeToStdout('\nAll Workspaces Sessions:\n');

    // Group the accumulated sessions by projectPath
    const groupedByProject = new Map<string, FlatSessionInfo[]>();
    for (const session of allSessions) {
      const list = groupedByProject.get(session.projectPath) ?? [];
      list.push(session);
      groupedByProject.set(session.projectPath, list);
    }

    for (const [projectPath, sessions] of groupedByProject.entries()) {
      const shortId = projects[projectPath];
      const isActiveWorkspace =
        path.resolve(projectPath) === path.resolve(currentProjectRoot);
      const label = isActiveWorkspace ? `${projectPath} (active)` : projectPath;

      writeToStdout(
        `\nWorkspace: ${label} [${shortId}] (${sessions.length} session${sessions.length === 1 ? '' : 's'}):\n`,
      );

      sessions
        .sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        )
        .forEach((session, index) => {
          const current = session.isCurrentSession ? ', current' : '';
          const time = formatRelativeTime(session.lastUpdated);
          const title =
            session.displayName.length > 100
              ? session.displayName.slice(0, 97) + '...'
              : session.displayName;
          writeToStdout(
            `  ${index + 1}. ${title} (${time}${current}) [${session.id}]\n`,
          );
        });
    }
  } else {
    // ---- Flat Chronological Mode (Default) ----
    allSessions.sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );

    writeToStdout('\nLatest Sessions Across All Workspaces:\n\n');

    allSessions.forEach((session, index) => {
      const isCurrentProject =
        path.resolve(session.projectPath) === path.resolve(currentProjectRoot);
      const activeLabel = isCurrentProject ? '*' : ' ';
      const current = session.isCurrentSession ? ', current' : '';
      const time = formatRelativeTime(session.lastUpdated);
      const title =
        session.displayName.length > 80
          ? session.displayName.slice(0, 77) + '...'
          : session.displayName;

      writeToStdout(
        `  ${activeLabel} ${index + 1}. ${title} [${session.projectSlug}] (${time}${current}) [${session.id}]\n`,
      );
    });
  }

  writeToStdout('\n');
}
