import React from 'react';
import type { TokenUsageStats } from '../types.ts';

interface Props {
  stats: TokenUsageStats;
}

// Gemini 2.0 Flash pricing (Feb 2026 estimate)
const COST_PER_1M_INPUT = 0.10;
const COST_PER_1M_OUTPUT = 0.40;

function Gauge({ value, max, colour }: { value: number; max: number; colour: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${colour}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-gray-800 rounded-lg p-3 space-y-1">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

export function TokenUsage({ stats }: Props) {
  const contextLimit = 2_000_000;
  const estimatedCost =
    (stats.inputTokens / 1_000_000) * COST_PER_1M_INPUT +
    (stats.outputTokens / 1_000_000) * COST_PER_1M_OUTPUT;

  return (
    <div className="space-y-4">
      <Stat
        label="Sessions"
        value={stats.sessions.toString()}
        sub="active / total"
      />

      <Stat
        label="Total Tokens"
        value={stats.totalTokens.toLocaleString()}
        sub={`${((stats.totalTokens / contextLimit) * 100).toFixed(2)}% of 2M ctx`}
      />

      <div className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Context Usage</p>
        <Gauge value={stats.totalTokens} max={contextLimit} colour="bg-blue-500" />
      </div>

      <div className="border border-gray-800 rounded-lg p-3 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Breakdown</p>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Input</span>
          <span className="text-blue-300">{stats.inputTokens.toLocaleString()}</span>
        </div>
        <Gauge value={stats.inputTokens} max={stats.totalTokens} colour="bg-blue-400" />
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Output</span>
          <span className="text-purple-300">{stats.outputTokens.toLocaleString()}</span>
        </div>
        <Gauge value={stats.outputTokens} max={stats.totalTokens} colour="bg-purple-400" />
      </div>

      <div className="border border-yellow-900/50 rounded-lg p-3 space-y-1 bg-yellow-950/20">
        <p className="text-xs text-yellow-600 uppercase tracking-wider">Est. Cost</p>
        <p className="text-xl font-bold text-yellow-300">
          ${estimatedCost.toFixed(4)}
        </p>
        <p className="text-xs text-gray-600">
          Flash: $0.10/1M in · $0.40/1M out
        </p>
      </div>
    </div>
  );
}
