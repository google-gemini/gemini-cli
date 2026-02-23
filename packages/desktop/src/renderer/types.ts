/**
 * Shared types for the Gemini Cowork Desktop renderer.
 */

// ── Agent events ─────────────────────────────────────────────────────────────

export type AgentStepType = 'think' | 'act' | 'observe' | 'session_start' | 'session_end';

export interface AgentStep {
  type: AgentStepType;
  iteration?: number;
  content: string;
  tool?: string;
  timestamp: string;
}

export interface ApprovalRequest {
  requestId: string;
  command: string;
  cwd: string;
}

export interface AgentStatus {
  running: boolean;
  iteration: number;
  currentPhase: AgentStepType | null;
}

// ── Chat messages ─────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  steps?: AgentStep[];
}

// ── File tree ─────────────────────────────────────────────────────────────────

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

export interface FileTreeNode extends DirEntry {
  children?: FileTreeNode[];
  expanded?: boolean;
}

// ── File diff ─────────────────────────────────────────────────────────────────

export type DiffLineType = 'context' | 'add' | 'remove' | 'header';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  lineNum?: number;
}

export interface FileDiff {
  path: string;
  before: string;
  after: string;
  lines: DiffLine[];
}

// ── Vision Monitor ────────────────────────────────────────────────────────────

export interface VisionCapture {
  id: string;
  url: string;          // data: URI or blob: URL
  caption: string;
  timestamp: string;
}

// ── Window-level API (exposed by preload) ─────────────────────────────────────

export interface AgentRunOptions {
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

declare global {
  interface Window {
    cowork: {
      runAgent(opts: AgentRunOptions): Promise<{ ok?: boolean; error?: string }>;
      stopAgent(): Promise<{ ok: boolean; error?: string }>;
      approveShell(requestId: string, approved: boolean): Promise<void>;
      onAgentStep(cb: (step: AgentStep) => void): () => void;
      onAgentDone(cb: (result: { success: boolean; error?: string }) => void): () => void;
      onApprovalRequest(cb: (req: ApprovalRequest) => void): () => void;
      openDirectory(): Promise<string | null>;
      readFile(filePath: string): Promise<{ content?: string; error?: string }>;
      listDirectory(dirPath: string): Promise<{ entries?: DirEntry[]; error?: string }>;
      verifyAudit(projectRoot: string): Promise<unknown>;
      exportSession(projectRoot: string): Promise<{ path: string }>;
      importSession(sessionFile: string): Promise<unknown>;
    };
  }
}
