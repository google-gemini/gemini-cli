/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import {
  type ActiveSession,
  type WorkflowTask,
} from '../../services/session-manager.js';

const Column = ({
  title,
  tasks,
  sessions,
  borderColor,
}: {
  title: string;
  tasks: WorkflowTask[];
  sessions: ActiveSession[];
  borderColor: string;
}) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={borderColor}
    flexGrow={1}
    padding={1}
    marginRight={1}
  >
    <Box marginBottom={1}>
      <Text bold underline>
        {title}
      </Text>
    </Box>

    {tasks.length === 0 && sessions.length === 0 && (
      <Text dimColor>No items</Text>
    )}

    {tasks.map((task) => {
      const relatedSession = sessions.find(
        (s) => s.id === task.assignedSessionId,
      );
      return (
        <Box
          key={task.id}
          flexDirection="column"
          marginBottom={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold>{task.id}</Text>
          <Text wrap="wrap">{task.description}</Text>
          <Text dimColor>Status: {task.status}</Text>
          {task.dependencies && task.dependencies.length > 0 && (
            <Text dimColor>Deps: {task.dependencies.join(', ')}</Text>
          )}
          {relatedSession && (
            <Text
              color={
                relatedSession.status === 'waiting_for_input'
                  ? 'yellow'
                  : 'green'
              }
            >
              Session: {relatedSession.branchName} ({relatedSession.status})
            </Text>
          )}
        </Box>
      );
    })}

    {/* Show sessions that might not have a linked task (ad-hoc) */}
    {sessions
      .filter((s) => !tasks.find((t) => t.assignedSessionId === s.id))
      .map((session) => (
        <Box
          key={session.id}
          flexDirection="column"
          marginBottom={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold color="green">
            {session.branchName}
          </Text>
          <Text>Task: {session.taskDescription}</Text>
          <Text
            color={
              session.status === 'waiting_for_input' ? 'yellow' : undefined
            }
          >
            Status: {session.status}
          </Text>
          {session.lastOutput && session.status === 'waiting_for_input' && (
            <Box marginTop={1} borderColor="yellow">
              <Text dimColor>
                {session.lastOutput.split('\n').slice(-3).join('\n')}
              </Text>
            </Box>
          )}
        </Box>
      ))}
  </Box>
);

export const SessionsView: React.FC = () => {
  const { activeSessions, workflowTasks, mainAreaWidth } = useUIState();

  const { pending, running, completed } = useMemo(() => {
    const pendingTasks = workflowTasks.filter(
      (t) => t.status === 'pending' || t.status === 'blocked',
    );
    const runningTasks = workflowTasks.filter((t) => t.status === 'running');
    const completedTasks = workflowTasks.filter(
      (t) => t.status === 'completed' || t.status === 'failed',
    );

    const runningSessions = activeSessions.filter(
      (s) =>
        s.status !== 'completed' &&
        s.status !== 'failed' &&
        s.status !== 'stopped',
    );
    // Ad-hoc running sessions (not linked to a task) should go to running column

    // We pass all sessions to columns, but the column component filters for "unlinked" ones
    // to avoid double rendering if we passed them explicitly.
    // Actually, for simplicity, let's just pass the full lists and let the Column component handle matching.

    return {
      pending: { tasks: pendingTasks, sessions: [] },
      running: { tasks: runningTasks, sessions: runningSessions },
      completed: {
        tasks: completedTasks,
        sessions: activeSessions.filter(
          (s) => s.status === 'completed' || s.status === 'failed',
        ),
      },
    };
  }, [workflowTasks, activeSessions]);

  return (
    <Box
      width={mainAreaWidth}
      borderStyle="single"
      borderColor="blue"
      flexDirection="column"
      padding={1}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Column
          title="Pending / Blocked"
          tasks={pending.tasks}
          sessions={[]}
          borderColor="yellow"
        />
        <Column
          title="In Progress"
          tasks={running.tasks}
          sessions={running.sessions}
          borderColor="cyan"
        />
        <Column
          title="Done"
          tasks={completed.tasks}
          sessions={completed.sessions}
          borderColor="green"
        />
      </Box>
    </Box>
  );
};
