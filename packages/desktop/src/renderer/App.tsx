/**
 * Gemini Cowork Desktop — Root App layout.
 *
 * Three-column layout:
 *   Left   (320px)  — FileTree + ProjectSwitcher
 *   Center (flex-1) — ChatPanel
 *   Right  (420px)  — WorkspacePanel (FileDiff | Terminal | VisionMonitor)
 *
 * A ThoughtTimeline overlays the bottom of the center panel.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatPanel } from './components/ChatPanel.js';
import { WorkspacePanel } from './components/WorkspacePanel.js';
import { FileTree } from './components/FileTree.js';
import { ProjectSwitcher } from './components/ProjectSwitcher.js';
import { ThoughtTimeline } from './components/ThoughtTimeline.js';
import { ApproveButton } from './components/ApproveButton.js';
import type {
  AgentStep,
  AgentStatus,
  ApprovalRequest,
  ChatMessage,
  FileDiff,
  VisionCapture,
} from './types.js';

export function App() {
  // ── Project state ──────────────────────────────────────────────────────────
  const [projectRoot, setProjectRoot] = useState<string>(
    localStorage.getItem('cowork:lastProject') ?? '',
  );

  // ── Agent state ────────────────────────────────────────────────────────────
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    running: false,
    iteration: 0,
    currentPhase: null,
  });
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // ── Workspace state ────────────────────────────────────────────────────────
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [visionCaptures, setVisionCaptures] = useState<VisionCapture[]>([]);

  // ── Shell approval ─────────────────────────────────────────────────────────
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

  // ── Subscribe to agent events ──────────────────────────────────────────────
  useEffect(() => {
    const unsubStep = window.cowork.onAgentStep((step) => {
      setAgentSteps((prev) => [...prev, step]);
      setAgentStatus((s) => ({
        running: true,
        iteration: step.iteration ?? s.iteration,
        currentPhase: step.type,
      }));

      // Detect file diffs in observe steps
      if (step.type === 'observe' && step.content.includes('--- ') && step.content.includes('+++ ')) {
        const diff = parseDiff(step.content);
        if (diff) setFileDiffs((prev) => [...prev, diff]);
      }

      // Detect screenshot captures
      if (step.type === 'observe' && step.tool === 'screenshot_and_analyze') {
        const match = step.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (match) {
          setVisionCaptures((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              url: match[0],
              caption: step.content.slice(0, 200),
              timestamp: step.timestamp,
            },
          ]);
        }
      }
    });

    const unsubDone = window.cowork.onAgentDone((result) => {
      setAgentStatus({ running: false, iteration: 0, currentPhase: null });
      const sysMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: result.success
          ? '✓ Agent completed successfully.'
          : `⚠ Agent stopped: ${result.error ?? 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, sysMsg]);
    });

    const unsubApproval = window.cowork.onApprovalRequest((req) => {
      setPendingApproval(req);
    });

    return () => {
      unsubStep();
      unsubDone();
      unsubApproval();
    };
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSendGoal = useCallback(
    async (goal: string, opts: { dryRun: boolean; audit: boolean; trace: boolean }) => {
      if (!projectRoot) return;

      // Optimistic user message
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: goal,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setAgentSteps([]);
      setFileDiffs([]);

      setAgentStatus({ running: true, iteration: 0, currentPhase: 'think' });

      await window.cowork.runAgent({
        goal,
        projectRoot,
        dryRun: opts.dryRun,
        audit: opts.audit,
        trace: opts.trace,
        maxIterations: 15,
        memory: true,
        pruneContext: true,
        codeowners: true,
      });
    },
    [projectRoot],
  );

  const handleStop = useCallback(async () => {
    await window.cowork.stopAgent();
  }, []);

  const handleApprove = useCallback(
    async (approved: boolean) => {
      if (!pendingApproval) return;
      await window.cowork.approveShell(pendingApproval.requestId, approved);
      setPendingApproval(null);
    },
    [pendingApproval],
  );

  const handleOpenProject = useCallback(async () => {
    const dir = await window.cowork.openDirectory();
    if (dir) {
      setProjectRoot(dir);
      localStorage.setItem('cowork:lastProject', dir);
      setMessages([]);
      setAgentSteps([]);
      setFileDiffs([]);
      setVisionCaptures([]);
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-surface-900 text-surface-100 font-sans select-none">
      {/* Title bar (draggable on macOS) */}
      <TitleBar
        projectRoot={projectRoot}
        agentStatus={agentStatus}
        onOpenProject={handleOpenProject}
      />

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: File tree ─────────────────────────────────────────── */}
        <aside className="w-64 flex-shrink-0 border-r border-surface-500 flex flex-col bg-surface-800">
          <ProjectSwitcher
            projectRoot={projectRoot}
            onOpen={handleOpenProject}
          />
          {projectRoot && <FileTree root={projectRoot} />}
        </aside>

        {/* ── Center: Chat ─────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden border-r border-surface-500">
          <ChatPanel
            messages={messages}
            agentStatus={agentStatus}
            onSend={handleSendGoal}
            onStop={handleStop}
            projectRoot={projectRoot}
          />

          {/* Thought Timeline */}
          <AnimatePresence>
            {agentSteps.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 180, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-surface-500 bg-surface-800 overflow-y-auto"
              >
                <ThoughtTimeline steps={agentSteps} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ── Right: Workspace ─────────────────────────────────────────── */}
        <aside className="w-[420px] flex-shrink-0 flex flex-col bg-surface-800">
          <WorkspacePanel
            fileDiffs={fileDiffs}
            visionCaptures={visionCaptures}
            agentSteps={agentSteps}
          />
        </aside>
      </div>

      {/* Shell approval overlay */}
      <AnimatePresence>
        {pendingApproval && (
          <ApproveButton
            request={pendingApproval}
            onApprove={() => handleApprove(true)}
            onDeny={() => handleApprove(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Title bar ─────────────────────────────────────────────────────────────────

function TitleBar({
  projectRoot,
  agentStatus,
  onOpenProject,
}: {
  projectRoot: string;
  agentStatus: AgentStatus;
  onOpenProject: () => void;
}) {
  const projectName = projectRoot.split('/').pop() ?? 'No project open';

  return (
    <header
      className="h-10 flex items-center px-4 gap-3 border-b border-surface-500
                 bg-surface-800 draggable shrink-0"
    >
      {/* Gemini gradient logo mark */}
      <div className="w-5 h-5 rounded-full bg-gemini-gradient flex-shrink-0 non-draggable" />

      <span className="text-sm font-semibold text-surface-100 non-draggable">
        Gemini Cowork
      </span>

      <span className="text-surface-500 text-xs">|</span>

      <button
        className="text-xs text-surface-300 hover:text-surface-100 transition-colors non-draggable truncate max-w-[200px]"
        onClick={onOpenProject}
        title={projectRoot || 'Click to open a project'}
      >
        {projectName}
      </button>

      {agentStatus.running && (
        <div className="ml-auto flex items-center gap-1.5 non-draggable">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
          <span className="text-xs text-success">
            {agentStatus.currentPhase ?? 'running'} #{agentStatus.iteration}
          </span>
        </div>
      )}
    </header>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDiff(content: string): FileDiff | null {
  const lines = content.split('\n');
  const headerLine = lines.find((l) => l.startsWith('+++ b/'));
  if (!headerLine) return null;

  const filePath = headerLine.replace('+++ b/', '');
  const diffLines = lines.map((l) => {
    if (l.startsWith('@@')) return { type: 'header' as const, content: l };
    if (l.startsWith('+') && !l.startsWith('+++')) return { type: 'add' as const, content: l.slice(1) };
    if (l.startsWith('-') && !l.startsWith('---')) return { type: 'remove' as const, content: l.slice(1) };
    return { type: 'context' as const, content: l };
  });

  return { path: filePath, before: '', after: '', lines: diffLines };
}
