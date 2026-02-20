import React from 'react';
import type { DashboardEvent } from '../types.ts';

interface Props {
  events: DashboardEvent[];
}

const TYPE_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  session_start: { dot: 'bg-cyan-400', label: 'text-cyan-400', text: 'text-cyan-300' },
  think: { dot: 'bg-blue-400', label: 'text-blue-400', text: 'text-blue-200' },
  act: { dot: 'bg-green-400', label: 'text-green-400', text: 'text-green-200' },
  observe: { dot: 'bg-purple-400', label: 'text-purple-400', text: 'text-purple-200' },
  session_end: { dot: 'bg-gray-400', label: 'text-gray-400', text: 'text-gray-300' },
};

export function ThoughtChain({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="text-xs text-gray-600 text-center mt-8">
        Waiting for agent session…
      </div>
    );
  }

  return (
    <ol className="relative border-l border-gray-800 space-y-6 ml-2">
      {events.map((ev, i) => {
        const style = TYPE_STYLE[ev.type] ?? TYPE_STYLE['observe']!;
        const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '';

        return (
          <li key={i} className="ml-4">
            {/* Timeline dot */}
            <span
              className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-gray-950 ${style.dot}`}
            />

            {/* Header */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className={`text-xs font-bold uppercase tracking-widest ${style.label}`}>
                {ev.type.replace('_', ' ')}
              </span>
              {ev.iteration !== undefined && (
                <span className="text-xs text-gray-600">#{ev.iteration}</span>
              )}
              {ev.tool && (
                <span className="text-xs text-green-600 font-mono">[{ev.tool}]</span>
              )}
              <span className="text-xs text-gray-700 ml-auto">{ts}</span>
            </div>

            {/* Content */}
            {ev.content && (
              <p className={`text-xs leading-relaxed break-words whitespace-pre-wrap ${style.text}`}>
                {ev.content.slice(0, 400)}
                {ev.content.length > 400 && (
                  <span className="text-gray-600"> …({ev.content.length} chars)</span>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
