import React, { useEffect, useState } from 'react';
import { ThoughtChain } from './components/ThoughtChain.tsx';
import { LiveLogs } from './components/LiveLogs.tsx';
import { TokenUsage } from './components/TokenUsage.tsx';
import type { DashboardEvent, TokenUsageStats } from './types.ts';

export default function App() {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [usage, setUsage] = useState<TokenUsageStats>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    sessions: 0,
  });
  const [connected, setConnected] = useState(false);

  // ── SSE connection ─────────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource('/events');

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as DashboardEvent;
      setEvents((prev) => [event, ...prev].slice(0, 500));

      if (event.type === 'token_usage' && event.tokens) {
        setUsage((prev) => ({
          inputTokens: prev.inputTokens + event.tokens!.input,
          outputTokens: prev.outputTokens + event.tokens!.output,
          totalTokens: prev.totalTokens + event.tokens!.total,
          estimatedCostUsd: prev.estimatedCostUsd + event.tokens!.estimatedCostUsd,
          sessions: event.type === 'session_start' ? prev.sessions + 1 : prev.sessions,
        }));
      }
    };

    return () => es.close();
  }, []);

  const thoughtEvents = events.filter((e) =>
    ['session_start', 'think', 'act', 'observe', 'session_end'].includes(e.type),
  );

  const logEvents = events;

  const screenshots = events.filter((e) => e.type === 'screenshot');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🤖</span>
          <h1 className="text-sm font-bold text-gray-100 tracking-wider uppercase">
            Gemini Cowork — Command Center
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}
          />
          <span className="text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      {/* Three-panel layout */}
      <main className="flex flex-1 overflow-hidden divide-x divide-gray-800">
        {/* Left: Thought Chain */}
        <section className="flex flex-col w-2/5 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
            Thought Chain
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ThoughtChain events={thoughtEvents} />
          </div>
        </section>

        {/* Middle: Live Logs + Screenshots */}
        <section className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
            Live Output
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <LiveLogs events={logEvents} />
          </div>
          {screenshots.length > 0 && (
            <div className="border-t border-gray-800 p-4">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">
                Latest Screenshot
              </p>
              <img
                src={`data:image/png;base64,${screenshots[0]!.screenshotBase64}`}
                alt="Agent screenshot"
                className="max-h-48 rounded border border-gray-700"
              />
            </div>
          )}
        </section>

        {/* Right: Token Usage */}
        <section className="flex flex-col w-56 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
            Token Usage
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <TokenUsage stats={usage} />
          </div>
        </section>
      </main>
    </div>
  );
}
