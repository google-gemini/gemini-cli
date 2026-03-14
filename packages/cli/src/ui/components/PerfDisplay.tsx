/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { PerfSnapshot } from '../types.js';

// ─── Reusable Row Components ────────────────────────────────────────────────

interface StatRowProps {
  title: string;
  children: React.ReactNode;
}

const StatRow: React.FC<StatRowProps> = ({ title, children }) => (
  <Box>
    <Box width={28}>
      <Text color={theme.text.link}>{title}</Text>
    </Box>
    {children}
  </Box>
);

interface SubStatRowProps {
  title: string;
  children: React.ReactNode;
}

const SubStatRow: React.FC<SubStatRowProps> = ({ title, children }) => (
  <Box paddingLeft={2}>
    <Box width={26}>
      <Text color={theme.text.secondary}>» {title}</Text>
    </Box>
    {children}
  </Box>
);

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      {title}
    </Text>
    {children}
  </Box>
);

// ─── Progress Bar ───────────────────────────────────────────────────────────

const ProgressBar: React.FC<{
  value: number;
  max: number;
  width?: number;
}> = ({ value, max, width = 20 }) => {
  const fraction = max > 0 ? Math.min(value / max, 1) : 0;
  const filled = Math.round(fraction * width);
  const empty = width - filled;

  let color = theme.status.success;
  if (fraction > 0.9) color = theme.status.error;
  else if (fraction > 0.75) color = theme.status.warning;

  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color={theme.border.default}>{'░'.repeat(empty)}</Text>
      <Text color={theme.text.secondary}> {(fraction * 100).toFixed(0)}%</Text>
    </Text>
  );
};

// ─── Overview Dashboard ─────────────────────────────────────────────────────

const OverviewPanel: React.FC<{ snapshot: PerfSnapshot }> = ({ snapshot }) => {
  const avgToolMs = snapshot.totalToolCalls > 0
    ? Math.round(snapshot.totalToolTime / snapshot.totalToolCalls)
    : 0;
  const avgApiMs = snapshot.totalApiRequests > 0
    ? Math.round(snapshot.totalApiTime / snapshot.totalApiRequests)
    : 0;

  return (
    <Box flexDirection="column">
      <Section title="⏱  Timing">
        <StatRow title="Session Duration:">
          <Text color={theme.text.primary}>{snapshot.duration}</Text>
        </StatRow>
        <SubStatRow title="API Time:">
          <Text color={theme.text.primary}>
            {formatMs(snapshot.totalApiTime)}
          </Text>
        </SubStatRow>
        <SubStatRow title="Tool Time:">
          <Text color={theme.text.primary}>
            {formatMs(snapshot.totalToolTime)}
          </Text>
        </SubStatRow>
      </Section>

      <MemorySummaryPanel snapshot={snapshot} />

      <Section title="📊 Session Summary">
        <StatRow title="Tool Calls:">
          <Text color={theme.text.primary}>
            {snapshot.totalToolCalls}
            {avgToolMs > 0 && (
              <Text color={theme.text.secondary}> (avg {avgToolMs}ms)</Text>
            )}
          </Text>
        </StatRow>
        <StatRow title="API Requests:">
          <Text color={theme.text.primary}>
            {snapshot.totalApiRequests}
            {avgApiMs > 0 && (
              <Text color={theme.text.secondary}> (avg {avgApiMs}ms)</Text>
            )}
          </Text>
        </StatRow>
        <StatRow title="Tokens:">
          <Text color={theme.text.primary}>
            <Text color={theme.status.success}>↓ {snapshot.totalInputTokens.toLocaleString()}</Text>
            {'  '}
            <Text color={theme.text.link}>↑ {snapshot.totalOutputTokens.toLocaleString()}</Text>
            {snapshot.totalCachedTokens > 0 && (
              <Text color={theme.text.secondary}> (cached: {snapshot.totalCachedTokens.toLocaleString()})</Text>
            )}
          </Text>
        </StatRow>
        {(snapshot.totalLinesAdded > 0 || snapshot.totalLinesRemoved > 0) && (
          <StatRow title="Code Changes:">
            <Text color={theme.text.primary}>
              <Text color={theme.status.success}>+{snapshot.totalLinesAdded}</Text>
              {'  '}
              <Text color={theme.status.error}>-{snapshot.totalLinesRemoved}</Text>
            </Text>
          </StatRow>
        )}
      </Section>

      <Box>
        <Text color={theme.text.secondary}>
          💡 Tip: Run <Text color={theme.text.link}>/perf tools</Text> for tool breakdown, <Text color={theme.text.link}>/perf api</Text> for API latency
        </Text>
      </Box>
    </Box>
  );
};

// ─── Memory Panel ───────────────────────────────────────────────────────────

const MemorySummaryPanel: React.FC<{ snapshot: PerfSnapshot }> = ({ snapshot }) => {
  const { memory, memoryWarnings } = snapshot;

  return (
    <Section title="🧠 Memory">
      <StatRow title="Heap Used:">
        <Box>
          <Text color={theme.text.primary}>
            {memory.heapUsedMB} MB / {memory.heapTotalMB} MB{' '}
          </Text>
          <ProgressBar value={memory.heapUsedMB} max={memory.heapTotalMB} width={15} />
        </Box>
      </StatRow>
      <StatRow title="RSS:">
        <Text color={theme.text.primary}>{memory.rssMB} MB</Text>
      </StatRow>
      <StatRow title="External:">
        <Text color={theme.text.primary}>{memory.externalMB} MB</Text>
      </StatRow>
      {memoryWarnings.map((w, i) => (
        <Box key={i} paddingLeft={2}>
          <Text color={w.startsWith('Critical') ? theme.status.error : theme.status.warning}>
            ⚠ {w}
          </Text>
        </Box>
      ))}
    </Section>
  );
};

const MemoryDetailPanel: React.FC<{ snapshot: PerfSnapshot }> = ({ snapshot }) => (
  <Box flexDirection="column">
    <MemorySummaryPanel snapshot={snapshot} />
    <Section title="📈 Memory Breakdown">
      <StatRow title="Heap Used:">
        <Text color={theme.text.primary}>{snapshot.memory.heapUsedMB} MB</Text>
      </StatRow>
      <StatRow title="Heap Total:">
        <Text color={theme.text.primary}>{snapshot.memory.heapTotalMB} MB</Text>
      </StatRow>
      <StatRow title="RSS:">
        <Text color={theme.text.primary}>{snapshot.memory.rssMB} MB</Text>
      </StatRow>
      <StatRow title="External (C++):">
        <Text color={theme.text.primary}>{snapshot.memory.externalMB} MB</Text>
      </StatRow>
      <StatRow title="Heap Utilization:">
        <ProgressBar
          value={snapshot.memory.heapUsedMB}
          max={snapshot.memory.heapTotalMB}
          width={25}
        />
      </StatRow>
    </Section>
  </Box>
);

// ─── Tools Panel ────────────────────────────────────────────────────────────

const ToolsPerfPanel: React.FC<{ snapshot: PerfSnapshot }> = ({ snapshot }) => {
  const { toolPerf } = snapshot;

  if (toolPerf.length === 0) {
    return (
      <Section title="🔧 Tool Performance">
        <Text color={theme.text.secondary}>No tool calls recorded yet.</Text>
      </Section>
    );
  }

  const nameWidth = 24;
  const colWidth = 10;
  const slowest = toolPerf.length > 0 ? toolPerf.reduce((a, b) => a.avgMs > b.avgMs ? a : b) : null;

  return (
    <Box flexDirection="column">
      <Section title="🔧 Tool Performance">
        {/* Table Header */}
        <Box>
          <Box width={nameWidth}><Text bold color={theme.text.primary}>Tool</Text></Box>
          <Box width={colWidth} justifyContent="flex-end"><Text bold color={theme.text.primary}>Calls</Text></Box>
          <Box width={colWidth} justifyContent="flex-end"><Text bold color={theme.text.primary}>Avg</Text></Box>
          <Box width={colWidth + 2} justifyContent="flex-end"><Text bold color={theme.text.primary}>Total</Text></Box>
          <Box width={colWidth} justifyContent="flex-end"><Text bold color={theme.text.primary}>Success</Text></Box>
        </Box>

        {/* Divider */}
        <Box
          borderStyle="round"
          borderBottom={true}
          borderTop={false}
          borderLeft={false}
          borderRight={false}
          borderColor={theme.border.default}
          width={nameWidth + colWidth * 3 + colWidth + 2}
        />

        {/* Table Rows */}
        {toolPerf.map((tool) => (
          <Box key={tool.name}>
            <Box width={nameWidth}>
              <Text color={theme.text.primary} wrap="truncate-end">{tool.name}</Text>
            </Box>
            <Box width={colWidth} justifyContent="flex-end">
              <Text color={theme.text.primary}>{tool.calls}</Text>
            </Box>
            <Box width={colWidth} justifyContent="flex-end">
              <Text color={getLatencyColor(tool.avgMs)}>{tool.avgMs}ms</Text>
            </Box>
            <Box width={colWidth + 2} justifyContent="flex-end">
              <Text color={theme.text.secondary}>{formatMs(tool.totalMs)}</Text>
            </Box>
            <Box width={colWidth} justifyContent="flex-end">
              <Text color={getSuccessColor(tool.successRate)}>
                {tool.successRate.toFixed(0)}%
              </Text>
            </Box>
          </Box>
        ))}
      </Section>

      {slowest && slowest.avgMs > 500 && (
        <Box paddingLeft={2}>
          <Text color={theme.status.warning}>
            ⚠ Slowest: {slowest.name} (avg {slowest.avgMs}ms)
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ─── API Panel ──────────────────────────────────────────────────────────────

const ApiPerfPanel: React.FC<{ snapshot: PerfSnapshot }> = ({ snapshot }) => {
  const { apiPerf } = snapshot;

  if (apiPerf.length === 0) {
    return (
      <Section title="🌐 API Performance">
        <Text color={theme.text.secondary}>No API requests recorded yet.</Text>
      </Section>
    );
  }

  const nameWidth = 24;
  const colWidth = 10;

  return (
    <Box flexDirection="column">
      <Section title="🌐 API Performance">
        {/* Table Header */}
        <Box>
          <Box width={nameWidth}><Text bold color={theme.text.primary}>Model</Text></Box>
          <Box width={colWidth} justifyContent="flex-end"><Text bold color={theme.text.primary}>Reqs</Text></Box>
          <Box width={colWidth + 2} justifyContent="flex-end"><Text bold color={theme.text.primary}>Avg Latency</Text></Box>
          <Box width={colWidth + 2} justifyContent="flex-end"><Text bold color={theme.text.primary}>Total</Text></Box>
          <Box width={colWidth} justifyContent="flex-end"><Text bold color={theme.text.primary}>Errors</Text></Box>
        </Box>

        {/* Divider */}
        <Box
          borderStyle="round"
          borderBottom={true}
          borderTop={false}
          borderLeft={false}
          borderRight={false}
          borderColor={theme.border.default}
          width={nameWidth + colWidth * 2 + (colWidth + 2) * 2}
        />

        {/* Table Rows */}
        {apiPerf.map((api) => (
          <Box key={api.model}>
            <Box width={nameWidth}>
              <Text color={theme.text.primary} wrap="truncate-end">{api.model}</Text>
            </Box>
            <Box width={colWidth} justifyContent="flex-end">
              <Text color={theme.text.primary}>{api.requests}</Text>
            </Box>
            <Box width={colWidth + 2} justifyContent="flex-end">
              <Text color={getLatencyColor(api.avgLatencyMs)}>{api.avgLatencyMs}ms</Text>
            </Box>
            <Box width={colWidth + 2} justifyContent="flex-end">
              <Text color={theme.text.secondary}>{formatMs(api.totalLatencyMs)}</Text>
            </Box>
            <Box width={colWidth} justifyContent="flex-end">
              <Text color={api.errorRate > 0 ? theme.status.error : theme.status.success}>
                {api.errorRate.toFixed(1)}%
              </Text>
            </Box>
          </Box>
        ))}
      </Section>

      {/* Token summary */}
      <Section title="🪙 Token Usage by Model">
        {apiPerf.map((api) => (
          <Box key={api.model}>
            <Box width={nameWidth}>
              <Text color={theme.text.primary}>{api.model}</Text>
            </Box>
            <Text color={theme.text.secondary}>
              in: {api.inputTokens.toLocaleString()}  out: {api.outputTokens.toLocaleString()}
              {api.cachedTokens > 0 && `  cached: ${api.cachedTokens.toLocaleString()}`}
            </Text>
          </Box>
        ))}
      </Section>
    </Box>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getLatencyColor(ms: number): string {
  if (ms < 200) return theme.status.success;
  if (ms < 1000) return theme.status.warning;
  return theme.status.error;
}

function getSuccessColor(rate: number): string {
  if (rate >= 95) return theme.status.success;
  if (rate >= 80) return theme.status.warning;
  return theme.status.error;
}

// ─── Main PerfDisplay Component ─────────────────────────────────────────────

export interface PerfDisplayProps {
  view: 'overview' | 'memory' | 'tools' | 'api';
  snapshot: PerfSnapshot;
}

export const PerfDisplay: React.FC<PerfDisplayProps> = ({ view, snapshot }) => {
  const renderView = () => {
    switch (view) {
      case 'memory':
        return <MemoryDetailPanel snapshot={snapshot} />;
      case 'tools':
        return <ToolsPerfPanel snapshot={snapshot} />;
      case 'api':
        return <ApiPerfPanel snapshot={snapshot} />;
      case 'overview':
      default:
        return <OverviewPanel snapshot={snapshot} />;
    }
  };

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
      overflow="hidden"
    >
      <Text bold color={theme.text.accent}>
        ⚡ Performance Dashboard
      </Text>
      <Box height={1} />
      {renderView()}
    </Box>
  );
};
