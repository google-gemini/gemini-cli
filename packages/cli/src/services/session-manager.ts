/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit, type SimpleGit } from 'simple-git';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { debugLogger } from '@google/gemini-cli-core';

import { EventEmitter } from 'node:events';

export interface ActiveSession {
  id: string;
  branchName: string;
  worktreePath: string;
  pid: number | undefined;
  status:
    | 'starting'
    | 'running'
    | 'waiting_for_input'
    | 'completed'
    | 'failed'
    | 'stopped';
  taskDescription: string;
  process?: ChildProcess;
  lastOutput?: string;
}

export interface WorkflowTask {
  id: string;
  description: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  branchName: string;
  assignedSessionId?: string;
}

export class SessionManager extends EventEmitter {
  private git: SimpleGit;
  private projectRoot: string;
  private worktreesDir: string;
  private sessions: Map<string, ActiveSession> = new Map();
  private tasks: Map<string, WorkflowTask> = new Map();
  private useSandbox: boolean;

  constructor(projectRoot: string, options: { useSandbox?: boolean } = {}) {
    super();
    this.projectRoot = path.resolve(projectRoot);
    this.git = simpleGit(this.projectRoot);
    this.worktreesDir = path.join(this.projectRoot, '.gemini', 'worktrees');
    this.useSandbox = options.useSandbox ?? false;
  }

  async initialize(): Promise<void> {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      throw new Error('Session Manager requires a git repository.');
    }
    await fs.mkdir(this.worktreesDir, { recursive: true });
  }

  async planWorkflow(
    tasks: Array<Omit<WorkflowTask, 'status' | 'assignedSessionId'>>,
  ): Promise<void> {
    for (const task of tasks) {
      this.tasks.set(task.id, {
        ...task,
        dependencies: task.dependencies || [],
        status: 'pending',
      });
    }
    this.updateTaskStatuses();
    this.emit('workflow_updated', this.getTasks());
    await this.processQueue();
  }

  getTasks(): WorkflowTask[] {
    return Array.from(this.tasks.values());
  }

  private updateTaskStatuses() {
    for (const [, task] of this.tasks) {
      if (
        task.status === 'running' ||
        task.status === 'completed' ||
        task.status === 'failed'
      )
        continue;

      const allDepsMet = task.dependencies.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });

      if (allDepsMet) {
        task.status = 'pending';
      } else {
        task.status = 'blocked';
      }
    }
  }

  private async processQueue() {
    for (const [id, task] of this.tasks) {
      if (task.status === 'pending') {
        task.status = 'running';
        try {
          const session = await this.startSession(
            task.description,
            task.branchName,
          );
          task.assignedSessionId = session.id;
        } catch (e) {
          task.status = 'failed';
          debugLogger.error(`[SessionManager] Failed to start task ${id}`, e);
        }
      }
    }
    this.emit('workflow_updated', this.getTasks());
  }

  private _spawnWorkerProcess(
    sessionId: string,
    branchName: string,
    worktreePath: string,
    taskDescription: string,
    input?: string,
  ): ChildProcess {
    const geminiExecutable = process.argv[1];
    const isNode = process.argv[0].endsWith('node');

    let spawnCommand = geminiExecutable;
    let spawnArgs: string[] = ['--approval-mode', 'yolo'];

    if (this.useSandbox) {
      spawnArgs.push('--sandbox');
    }

    if (input) {
      // Case: Restarting with input
      spawnArgs.push(input);
    } else {
      // Case: Starting new session with system note and task
      const systemNote = `
SYSTEM NOTE: You are running in an isolated git worktree on branch '${branchName}'.
1. You MUST perform your task and COMMIT all changes to git.
2. Do NOT push to remote.
3. If you create new files, ensure you 'git add' them.
4. When finished, print "WORK_COMPLETE".
5. RUNTIME CONTEXT: You are running in a non-interactive background process managed by a Manager Agent.
   - Do NOT ask the user questions via stdout expecting a reply, unless absolutely necessary.
   - If you need confirmation, pause and ask, but prefer autonomy.
   - You cannot run interactive TTY commands (like vim, nano, less). Use non-interactive tools only.
`;
      spawnArgs.push(`${systemNote}\n\nTask: ${taskDescription}`);
    }

    if (isNode) {
      spawnCommand = process.argv[0];
      spawnArgs = [geminiExecutable, ...spawnArgs];
    }

    const child = spawn(spawnCommand, spawnArgs, {
      cwd: worktreePath,
      env: {
        ...process.env,
        GEMINI_SESSION_ID: sessionId,
        GEMINI_SANDBOX_CONTAINER_NAME: `gemini-worker-${sessionId}`,
      },
      stdio: 'pipe',
      detached: false,
    });

    return child;
  }

  private _setupProcessListeners(session: ActiveSession, child: ChildProcess) {
    const handleOutput = (data: Buffer) => {
      const output = data.toString();
      // Keep a larger buffer for tailing, e.g., 5000 chars
      session.lastOutput = (session.lastOutput || '') + output;
      if (session.lastOutput.length > 5000) {
        session.lastOutput = session.lastOutput.slice(-5000);
      }

      const trimmed = output.trim();
      if (
        trimmed.endsWith('?') ||
        trimmed.match(/\([yY]\/[nN]\)/) ||
        trimmed.includes('Waiting for confirmation')
      ) {
        session.status = 'waiting_for_input';
      } else {
        session.status = 'running';
      }
      this.emit('sessions_updated', this.getSessions());
    };

    child.stdout?.on('data', handleOutput);
    child.stderr?.on('data', handleOutput);

    child.on('exit', (code) => {
      session.status = code === 0 ? 'completed' : 'failed';
      session.process = undefined;
      session.pid = undefined;

      this.emit('session_completed', session);
      this.emit('sessions_updated', this.getSessions());

      // Update associated task status
      for (const [, task] of this.tasks) {
        if (task.assignedSessionId === session.id) {
          task.status = session.status === 'completed' ? 'completed' : 'failed';
          break;
        }
      }
      this.emit('workflow_updated', this.getTasks());

      // Trigger next tasks
      this.updateTaskStatuses();
      this.processQueue().catch((e) =>
        debugLogger.error('[SessionManager] Error in processQueue', e),
      );
    });
  }

  async startSession(
    taskDescription: string,
    branchName: string,
  ): Promise<ActiveSession> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const worktreePath = path.join(this.worktreesDir, sessionId);

    try {
      debugLogger.log(
        `[SessionManager] Creating worktree for branch ${branchName} at ${worktreePath}`,
      );

      // Prune dead worktrees first to free up branches
      try {
        await this.git.raw(['worktree', 'prune']);
      } catch (e) {
        debugLogger.warn('[SessionManager] Failed to prune worktrees', e);
      }

      const branches = await this.git.branchLocal();
      if (branches.all.includes(branchName)) {
        // Check if branch is already checked out by another worktree
        try {
          await this.git.raw(['worktree', 'add', worktreePath, branchName]);
        } catch (e) {
          if (String(e).includes('already used by worktree')) {
            debugLogger.log(
              `[SessionManager] Branch ${branchName} in use, forcing worktree creation.`,
            );
            await this.git.raw([
              'worktree',
              'add',
              '-f',
              worktreePath,
              branchName,
            ]);
          } else {
            throw e;
          }
        }
      } else {
        await this.git.raw(['worktree', 'add', '-b', branchName, worktreePath]);
      }

      // Fix .git file for sandbox compatibility (use relative paths)
      try {
        const dotGitPath = path.join(worktreePath, '.git');
        const content = await fs.readFile(dotGitPath, 'utf8');
        if (content.startsWith('gitdir:')) {
          const absoluteGitDir = content.replace('gitdir:', '').trim();
          const relativeGitDir = path.relative(worktreePath, absoluteGitDir);
          await fs.writeFile(dotGitPath, `gitdir: ${relativeGitDir}\n`);
          debugLogger.log(
            `[SessionManager] Converted worktree .git to relative path: ${relativeGitDir}`,
          );
        }
      } catch (e) {
        debugLogger.warn(
          '[SessionManager] Failed to make worktree .git path relative. Git might fail in sandbox.',
          e,
        );
      }

      const child = this._spawnWorkerProcess(
        sessionId,
        branchName,
        worktreePath,
        taskDescription,
      );

      const session: ActiveSession = {
        id: sessionId,
        branchName,
        worktreePath,
        pid: child.pid,
        status: 'starting',
        taskDescription,
        process: child,
        lastOutput: '',
      };

      this._setupProcessListeners(session, child);
      this.sessions.set(sessionId, session);
      this.emit('sessions_updated', this.getSessions());

      return session;
    } catch (error) {
      debugLogger.error('[SessionManager] Failed to start session', error);
      throw error;
    }
  }

  getSessions(): ActiveSession[] {
    return Array.from(this.sessions.values());
  }

  async sendInput(sessionId: string, input: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Case 1: Session is running and potentially waiting for input
    if (session.process && session.process.exitCode === null) {
      try {
        // Ensure newline
        const textToSend = input.endsWith('\n') ? input : `${input}\n`;
        session.process.stdin?.write(textToSend);
        session.status = 'running';
        this.emit('sessions_updated', this.getSessions());
        return true;
      } catch (e) {
        debugLogger.error(
          `[SessionManager] Failed to send input to running session ${sessionId}`,
          e,
        );
        return false;
      }
    }

    // Case 2: Session is stopped/completed/failed -> Restart it with input as prompt
    // This allows multi-turn conversation by resuming the session
    try {
      debugLogger.log(
        `[SessionManager] Restarting session ${sessionId} with new input`,
      );

      const child = this._spawnWorkerProcess(
        sessionId,
        session.branchName,
        session.worktreePath,
        session.taskDescription,
        input,
      );

      session.process = child;
      session.pid = child.pid;
      session.status = 'running';
      // Append input to output for context history in UI
      session.lastOutput = (session.lastOutput || '') + `\n> ${input}\n`;

      this._setupProcessListeners(session, child);
      this.emit('sessions_updated', this.getSessions());

      return true;
    } catch (e) {
      debugLogger.error(
        `[SessionManager] Failed to restart session ${sessionId}`,
        e,
      );
      return false;
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.process) {
      session.process.kill();
    }

    // Cleanup worktree
    try {
      await this.git.raw(['worktree', 'remove', '-f', session.worktreePath]);
      // Also remove the directory if git didn't
      await fs.rm(session.worktreePath, { recursive: true, force: true });
    } catch (e) {
      debugLogger.warn(
        `[SessionManager] Failed to cleanup worktree for ${sessionId}`,
        e,
      );
    }

    session.status = 'stopped';
    this.sessions.delete(sessionId);
    this.emit('sessions_updated', this.getSessions());
  }
}
