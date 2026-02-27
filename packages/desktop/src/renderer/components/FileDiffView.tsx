/**
 * FileDiffView — Real-time file diff preview panel.
 * Shows each write_file change as a side-by-side or unified diff.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { FileDiff, DiffLine } from '../types.js';

interface Props {
  diffs: FileDiff[];
}

export function FileDiffView({ diffs }: Props) {
  if (diffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-surface-400">
        <FileText size={32} className="opacity-30" />
        <p className="text-sm">No file changes yet.</p>
        <p className="text-xs text-surface-500">
          Diffs appear here as the agent modifies files.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto divide-y divide-surface-600">
      {diffs.map((diff, i) => (
        <DiffCard key={i} diff={diff} />
      ))}
    </div>
  );
}

function DiffCard({ diff }: { diff: FileDiff }) {
  const [expanded, setExpanded] = useState(true);
  const added   = diff.lines.filter((l) => l.type === 'add').length;
  const removed = diff.lines.filter((l) => l.type === 'remove').length;

  return (
    <div className="bg-surface-800">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs
                   hover:bg-surface-700 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="font-mono text-surface-200 flex-1 truncate">{diff.path}</span>
        <span className="text-success">+{added}</span>
        <span className="mx-1 text-surface-500">/</span>
        <span className="text-danger">-{removed}</span>
      </button>

      {/* Diff lines */}
      {expanded && (
        <div className="font-mono text-[11px] leading-5 overflow-x-auto">
          {diff.lines.map((line, i) => (
            <DiffLineRow key={i} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const styles: Record<string, string> = {
    add:     'bg-success/10 text-success border-l-2 border-success',
    remove:  'bg-danger/10 text-danger border-l-2 border-danger',
    header:  'bg-aistudio-950 text-aistudio-400',
    context: 'text-surface-400',
  };

  const prefix: Record<string, string> = {
    add:     '+ ',
    remove:  '- ',
    header:  '  ',
    context: '  ',
  };

  return (
    <div className={`px-3 whitespace-pre ${styles[line.type]}`}>
      <span className="select-none opacity-50 mr-2">{prefix[line.type]}</span>
      {line.content}
    </div>
  );
}
