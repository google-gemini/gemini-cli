/**
 * @license Apache-2.0
 * Gemini Cowork Desktop — IPC Bridge
 *
 * This module registers all `ipcMain` handlers that connect the Electron
 * renderer (React UI) to the Gemini Cowork Agent core running in the main
 * process. Each handler maps a channel name to an agent action.
 *
 * Channel naming convention:  agent:<action>   (request → reply)
 *                              agent:<event>    (push from main to renderer)
 *
 * Push events are sent via `mainWindow.webContents.send(channel, payload)`.
 */

import type { IpcMain, BrowserWindow } from 'electron';
import { dialog } from 'electron';
import path from 'node:path';
import { Coworker } from '@google/gemini-cowork';
import type { AgentStep } from '@google/gemini-cowork';

// ── Types shared with the renderer (mirrored in src/renderer/types.ts) ───────

export interface RunOptions {
  goal: string;
  projectRoot: string;
  maxIterations?: number;
  trace?: boolean;
  memory?: boolean;
  dryRun?: boolean;
  audit?: boolean;
  pruneContext?: boolean;
  codeowners?: boolean;
}

export interface ShellApprovalRequest {
  requestId: string;
  command: string;
  cwd: string;
}

export interface ShellApprovalResponse {
  requestId: string;
  approved: boolean;
}

// ── Module state ─────────────────────────────────────────────────────────────

let activeAgent: Coworker | null = null;
let pendingApprovals = new Map<string, (approved: boolean) => void>();

// ── Bridge registration ───────────────────────────────────────────────────────

export function registerBridgeHandlers(
  ipc: IpcMain,
  mainWindow: BrowserWindow,
): void {
  /**
   * agent:run — Start a new agentic loop session.
   * Streams Think/Act/Observe steps back as 'agent:step' push events.
   */
  ipc.handle('agent:run', async (_event, opts: RunOptions) => {
    if (activeAgent) {
      return { error: 'An agent session is already running. Stop it first.' };
    }

    // Custom shell confirmation function that delegates to the renderer UI
    const shellConfirm = async (command: string, cwd: string): Promise<boolean> => {
      const requestId = crypto.randomUUID();
      // Push approval request to the renderer
      mainWindow.webContents.send('agent:approval-request', {
        requestId,
        command,
        cwd,
      } satisfies ShellApprovalRequest);

      // Wait for the renderer to reply via agent:approve or agent:deny
      return new Promise<boolean>((resolve) => {
        pendingApprovals.set(requestId, resolve);
        // Auto-deny after 60 s if no user response
        setTimeout(() => {
          if (pendingApprovals.has(requestId)) {
            pendingApprovals.delete(requestId);
            resolve(false);
          }
        }, 60_000);
      });
    };

    activeAgent = new Coworker({
      projectRoot: opts.projectRoot,
      maxIterations: opts.maxIterations ?? 10,
      trace: opts.trace ?? false,
      memory: opts.memory ?? false,
      dryRun: opts.dryRun ?? false,
      securityAudit: opts.audit ?? false,
      pruneContext: opts.pruneContext ?? false,
      codeownersAware: opts.codeowners ?? false,
      // Hook agent steps to push real-time events to the renderer
      onStep: (step: AgentStep) => {
        mainWindow.webContents.send('agent:step', step);
      },
    });

    try {
      await activeAgent.runLoop(opts.goal);
      mainWindow.webContents.send('agent:done', { success: true });
    } catch (err) {
      mainWindow.webContents.send('agent:done', {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      activeAgent = null;
    }

    return { ok: true };
  });

  /**
   * agent:stop — Request graceful shutdown of the active agent.
   */
  ipc.handle('agent:stop', async () => {
    if (!activeAgent) return { ok: false, error: 'No active agent' };
    activeAgent = null;
    mainWindow.webContents.send('agent:done', { success: false, error: 'Stopped by user' });
    return { ok: true };
  });

  /**
   * agent:approve / agent:deny — Renderer replies to a shell approval request.
   */
  ipc.handle('agent:approve', async (_event, resp: ShellApprovalResponse) => {
    const resolve = pendingApprovals.get(resp.requestId);
    if (resolve) {
      pendingApprovals.delete(resp.requestId);
      resolve(resp.approved);
    }
    return { ok: true };
  });

  /**
   * fs:open-directory — Show native directory picker, return selected path.
   */
  ipc.handle('fs:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Project Root',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  /**
   * fs:read-file — Read a file from the local filesystem (renderer sandbox bypass).
   */
  ipc.handle('fs:read-file', async (_event, filePath: string) => {
    const { readFile } = await import('node:fs/promises');
    try {
      const content = await readFile(filePath, 'utf8');
      return { content };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * fs:list-directory — List files/dirs in a directory (for FileTree component).
   */
  ipc.handle('fs:list-directory', async (_event, dirPath: string) => {
    const { readdir, stat } = await import('node:fs/promises');
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      return {
        entries: entries
          .filter((e) => !e.name.startsWith('.') || e.name === '.coworkrc')
          .map((e) => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            path: path.join(dirPath, e.name),
          })),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * audit:verify — Run audit log integrity check for a project root.
   */
  ipc.handle('audit:verify', async (_event, projectRoot: string) => {
    const { AuditLog } = await import('@google/gemini-cowork');
    const log = new AuditLog(projectRoot, 'desktop-verify');
    return log.verify();
  });

  /**
   * session:export — Export current session state.
   */
  ipc.handle('session:export', async (_event, projectRoot: string) => {
    const { SessionManager } = await import('@google/gemini-cowork');
    const mgr = new SessionManager(projectRoot);
    const out = await mgr.export({}, {});
    return { path: out };
  });

  /**
   * session:import — Import a session file.
   */
  ipc.handle('session:import', async (_event, sessionFile: string) => {
    const { SessionManager } = await import('@google/gemini-cowork');
    const mgr = new SessionManager(path.dirname(sessionFile));
    return mgr.import(sessionFile);
  });
}
