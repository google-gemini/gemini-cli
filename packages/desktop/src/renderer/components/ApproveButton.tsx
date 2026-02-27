/**
 * ApproveButton — Full-screen overlay for one-click shell command approval.
 * Appears when the agent requests permission to run a shell command.
 */

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ShieldX, Terminal } from 'lucide-react';
import type { ApprovalRequest } from '../types.js';

interface Props {
  request: ApprovalRequest;
  onApprove: () => void;
  onDeny: () => void;
}

export function ApproveButton({ request, onApprove, onDeny }: Props) {
  // Keyboard shortcut: Enter to approve, Escape to deny
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onApprove();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDeny();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onApprove, onDeny]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center pb-12 px-6
                 bg-black/60 backdrop-blur-sm"
      onClick={onDeny}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        className="w-full max-w-lg bg-surface-800 rounded-2xl border border-surface-500
                   shadow-glow overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-warning/10 border-b border-warning/20">
          <Terminal size={16} className="text-warning" />
          <span className="text-sm font-semibold text-warning">Shell Command Approval Required</span>
        </div>

        {/* Command preview */}
        <div className="p-4">
          <p className="text-xs text-surface-400 mb-2">
            The agent wants to run the following command in{' '}
            <code className="text-surface-300 font-mono">{request.cwd}</code>:
          </p>
          <pre className="bg-surface-900 rounded-lg px-4 py-3 text-sm font-mono text-success
                          overflow-x-auto border border-surface-600 whitespace-pre-wrap break-words">
            {request.command}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-4 pb-4">
          <button
            onClick={onDeny}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-danger/15 hover:bg-danger/25 text-danger border border-danger/30
                       transition-colors text-sm font-medium"
          >
            <ShieldX size={16} />
            Deny  <kbd className="ml-1 text-[10px] opacity-60">Esc</kbd>
          </button>

          <button
            onClick={onApprove}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-success/15 hover:bg-success/25 text-success border border-success/30
                       transition-colors text-sm font-medium"
          >
            <ShieldCheck size={16} />
            Approve & Run  <kbd className="ml-1 text-[10px] opacity-60">↵</kbd>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
