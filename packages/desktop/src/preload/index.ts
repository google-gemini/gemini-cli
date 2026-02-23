/**
 * @license Apache-2.0
 * Gemini Cowork Desktop — Preload script.
 *
 * Exposes a safe, typed API to the renderer via `contextBridge`.
 * Only explicitly listed channels/functions are accessible.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ── Typed API exposed as `window.cowork` ─────────────────────────────────────

const api = {
  // ── Agent control ──────────────────────────────────────────────────────────
  runAgent: (opts: AgentRunOptions) =>
    ipcRenderer.invoke('agent:run', opts),

  stopAgent: () =>
    ipcRenderer.invoke('agent:stop'),

  approveShell: (requestId: string, approved: boolean) =>
    ipcRenderer.invoke('agent:approve', { requestId, approved }),

  // ── Event listeners (main → renderer push) ─────────────────────────────────
  onAgentStep: (cb: (step: AgentStepEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, step: AgentStepEvent) => cb(step);
    ipcRenderer.on('agent:step', handler);
    return () => ipcRenderer.removeListener('agent:step', handler);
  },

  onAgentDone: (cb: (result: AgentDoneEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, result: AgentDoneEvent) => cb(result);
    ipcRenderer.once('agent:done', handler);
    return () => ipcRenderer.removeListener('agent:done', handler);
  },

  onApprovalRequest: (cb: (req: ApprovalRequest) => void) => {
    const handler = (_: Electron.IpcRendererEvent, req: ApprovalRequest) => cb(req);
    ipcRenderer.on('agent:approval-request', handler);
    return () => ipcRenderer.removeListener('agent:approval-request', handler);
  },

  // ── File system ────────────────────────────────────────────────────────────
  openDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('fs:open-directory'),

  readFile: (filePath: string): Promise<{ content?: string; error?: string }> =>
    ipcRenderer.invoke('fs:read-file', filePath),

  listDirectory: (dirPath: string): Promise<{ entries?: DirEntry[]; error?: string }> =>
    ipcRenderer.invoke('fs:list-directory', dirPath),

  // ── Audit ──────────────────────────────────────────────────────────────────
  verifyAudit: (projectRoot: string) =>
    ipcRenderer.invoke('audit:verify', projectRoot),

  // ── Session ────────────────────────────────────────────────────────────────
  exportSession: (projectRoot: string) =>
    ipcRenderer.invoke('session:export', projectRoot),

  importSession: (sessionFile: string) =>
    ipcRenderer.invoke('session:import', sessionFile),
};

contextBridge.exposeInMainWorld('cowork', api);

// ── Shared types (duplicated here for the preload scope) ─────────────────────

interface AgentRunOptions {
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

interface AgentStepEvent {
  type: 'think' | 'act' | 'observe';
  iteration: number;
  content: string;
  tool?: string;
  timestamp: string;
}

interface AgentDoneEvent {
  success: boolean;
  error?: string;
}

interface ApprovalRequest {
  requestId: string;
  command: string;
  cwd: string;
}

interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}
