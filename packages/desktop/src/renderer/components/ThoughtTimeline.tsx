/**
 * ThoughtTimeline — Compact timeline of Think → Act → Observe steps.
 * Shown at the bottom of the chat panel while the agent is running.
 */

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { AgentStep } from '../types.js';

interface Props {
  steps: AgentStep[];
}

const STEP_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  think:         { dot: 'bg-blue-500',   label: 'text-blue-400',   text: 'text-blue-200' },
  act:           { dot: 'bg-green-500',  label: 'text-green-400',  text: 'text-green-200' },
  observe:       { dot: 'bg-purple-500', label: 'text-purple-400', text: 'text-purple-200' },
  session_start: { dot: 'bg-cyan-500',   label: 'text-cyan-400',   text: 'text-cyan-300' },
  session_end:   { dot: 'bg-surface-400',label: 'text-surface-400',text: 'text-surface-300' },
};

export function ThoughtTimeline({ steps }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest step
  useEffect(() => {
    containerRef.current?.scrollTo({
      left: containerRef.current.scrollWidth,
      behavior: 'smooth',
    });
  }, [steps]);

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-surface-600">
        <span className="text-[10px] text-surface-400 font-semibold uppercase tracking-wider">
          Thought Chain
        </span>
        <span className="text-[10px] text-surface-500">({steps.length} steps)</span>
      </div>

      {/* Horizontal scrolling timeline */}
      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden flex items-start gap-0 px-3 py-2"
      >
        {steps.map((step, i) => {
          const style = STEP_STYLES[step.type] ?? STEP_STYLES['observe']!;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-1 flex-shrink-0 w-36 px-1"
            >
              {/* Step header */}
              <div className="flex items-center gap-1 w-full">
                {i > 0 && <div className="h-px flex-1 bg-surface-600" />}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                {i < steps.length - 1 && <div className="h-px flex-1 bg-surface-600" />}
              </div>

              {/* Label */}
              <span className={`text-[9px] font-bold uppercase tracking-widest ${style.label}`}>
                {step.type.replace('_', ' ')}
                {step.iteration !== undefined && (
                  <span className="ml-1 text-surface-500 normal-case">#{step.iteration}</span>
                )}
              </span>

              {/* Tool badge */}
              {step.tool && (
                <span className="text-[9px] font-mono text-green-600 bg-green-900/20 px-1 rounded truncate max-w-full">
                  {step.tool}
                </span>
              )}

              {/* Snippet */}
              <p className={`text-[9px] leading-tight break-words line-clamp-3 text-center ${style.text}`}>
                {step.content.slice(0, 80)}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
