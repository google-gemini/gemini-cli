/**
 * WorkspacePanel — Right panel with tabbed views:
 *   Terminal | File Diff | Vision Monitor
 */

import React, { useState } from 'react';
import { Terminal as TerminalIcon, GitBranch, Camera } from 'lucide-react';
import { TerminalView } from './TerminalView.js';
import { FileDiffView } from './FileDiffView.js';
import { VisionMonitor } from './VisionMonitor.js';
import type { AgentStep, FileDiff, VisionCapture } from '../types.js';

type Tab = 'terminal' | 'diff' | 'vision';

interface Props {
  fileDiffs: FileDiff[];
  visionCaptures: VisionCapture[];
  agentSteps: AgentStep[];
}

export function WorkspacePanel({ fileDiffs, visionCaptures, agentSteps }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('terminal');

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    {
      id: 'terminal',
      label: 'Terminal',
      icon: <TerminalIcon size={13} />,
    },
    {
      id: 'diff',
      label: 'File Diff',
      icon: <GitBranch size={13} />,
      badge: fileDiffs.length || undefined,
    },
    {
      id: 'vision',
      label: 'Vision',
      icon: <Camera size={13} />,
      badge: visionCaptures.length || undefined,
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-surface-500 shrink-0 bg-surface-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative
              ${activeTab === tab.id
                ? 'text-surface-100 border-b-2 border-gemini-500 -mb-px'
                : 'text-surface-400 hover:text-surface-300'
              }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span className="ml-1 px-1 min-w-[16px] h-4 flex items-center justify-center
                               rounded-full bg-gemini-500/30 text-gemini-300 text-[10px]">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' && <TerminalView agentSteps={agentSteps} />}
        {activeTab === 'diff' && <FileDiffView diffs={fileDiffs} />}
        {activeTab === 'vision' && <VisionMonitor captures={visionCaptures} />}
      </div>
    </div>
  );
}
