/**
 * ChatPanel — Left-center panel for user↔agent conversation.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, Zap, Eye, FileText } from 'lucide-react';
import type { AgentStatus, ChatMessage } from '../types.js';

interface Props {
  messages: ChatMessage[];
  agentStatus: AgentStatus;
  projectRoot: string;
  onSend: (
    goal: string,
    opts: { dryRun: boolean; audit: boolean; trace: boolean },
  ) => void;
  onStop: () => void;
}

export function ChatPanel({ messages, agentStatus, projectRoot, onSend, onStop }: Props) {
  const [input, setInput] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [audit, setAudit] = useState(false);
  const [trace, setTrace] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const handleSubmit = () => {
    const goal = input.trim();
    if (!goal || agentStatus.running || !projectRoot) return;
    onSend(goal, { dryRun, audit, trace });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-surface-400">
            <div className="w-12 h-12 rounded-full bg-gemini-gradient opacity-70" />
            <p className="text-sm text-center">
              {projectRoot
                ? 'Describe a task for the Gemini Cowork Agent.'
                : 'Open a project folder to get started.'}
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageBubble msg={msg} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking indicator */}
        {agentStatus.running && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-xs text-gemini-400"
          >
            <ThinkingDots />
            <span className="capitalize">{agentStatus.currentPhase ?? 'thinking'}…</span>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-surface-500 p-3 bg-surface-800 shrink-0">
        {/* Option toggles */}
        <div className="flex gap-2 mb-2">
          <ToggleChip icon={<Eye size={11} />} label="Dry run" active={dryRun} onChange={setDryRun} />
          <ToggleChip icon={<FileText size={11} />} label="Audit" active={audit} onChange={setAudit} />
          <ToggleChip icon={<Zap size={11} />} label="Trace" active={trace} onChange={setTrace} />
        </div>

        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none bg-surface-700 border border-surface-500 rounded-lg
                       px-3 py-2 text-sm text-surface-100 placeholder:text-surface-400
                       focus:outline-none focus:border-gemini-500 focus:ring-1 focus:ring-gemini-500
                       transition-colors min-h-[40px] max-h-[160px] font-sans"
            placeholder={
              !projectRoot
                ? 'Open a project first…'
                : agentStatus.running
                ? 'Agent is running…'
                : 'Describe a task (⌘↵ to send)'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={agentStatus.running || !projectRoot}
            rows={1}
          />

          {agentStatus.running ? (
            <button
              onClick={onStop}
              className="p-2.5 rounded-lg bg-danger/20 hover:bg-danger/30 text-danger
                         transition-colors flex-shrink-0"
              title="Stop agent"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || !projectRoot}
              className="p-2.5 rounded-lg bg-gemini-500 hover:bg-gemini-600 disabled:opacity-40
                         disabled:cursor-not-allowed text-white transition-colors flex-shrink-0"
              title="Send (⌘↵)"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  if (isSystem) {
    return (
      <p className="text-xs text-center text-surface-400 py-1">{msg.content}</p>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-gemini-600 text-white rounded-br-sm'
            : 'bg-surface-700 text-surface-100 rounded-bl-sm'
          }`}
      >
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        <p className="text-[10px] mt-1 opacity-50">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gemini-400 animate-pulse-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function ToggleChip({
  icon,
  label,
  active,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!active)}
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium
                  transition-colors border
                  ${active
                    ? 'bg-gemini-500/20 border-gemini-500 text-gemini-300'
                    : 'bg-transparent border-surface-500 text-surface-400 hover:border-surface-400'
                  }`}
    >
      {icon}
      {label}
    </button>
  );
}
