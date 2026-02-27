import React, { useRef, useEffect } from 'react';
import type { DashboardEvent } from '../types.ts';

interface Props {
  events: DashboardEvent[];
}

const ROW_COLOUR: Record<string, string> = {
  session_start: 'text-cyan-400',
  think: 'text-blue-300',
  act: 'text-green-300',
  observe: 'text-purple-300',
  session_end: 'text-gray-400',
  token_usage: 'text-yellow-600',
  screenshot: 'text-orange-400',
};

export function LiveLogs({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="text-xs text-gray-600 font-mono text-center mt-8">
        No events yet…
      </div>
    );
  }

  return (
    <div className="font-mono text-xs space-y-1">
      {[...events].reverse().map((ev, i) => {
        const colour = ROW_COLOUR[ev.type] ?? 'text-gray-300';
        const ts = ev.timestamp
          ? new Date(ev.timestamp).toISOString().slice(11, 23)
          : '';

        let summary = ev.content ?? '';
        if (ev.type === 'token_usage' && ev.tokens) {
          summary = `tokens ↑${ev.tokens.input} ↓${ev.tokens.output} total=${ev.tokens.total}`;
        }

        return (
          <div key={i} className="flex gap-2 items-start hover:bg-gray-900 rounded px-1 py-0.5">
            <span className="text-gray-700 shrink-0 w-28">{ts}</span>
            <span className={`shrink-0 w-20 uppercase tracking-wider ${colour}`}>
              {ev.type.replace('_', ' ')}
            </span>
            {ev.tool && (
              <span className="text-green-700 shrink-0">[{ev.tool}]</span>
            )}
            <span className="text-gray-300 break-all line-clamp-2">
              {summary.slice(0, 200)}
            </span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
