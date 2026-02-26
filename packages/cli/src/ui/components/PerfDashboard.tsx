/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import { PerformanceDataService } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';

export type PerfView =
  | undefined
  | 'startup'
  | 'memory'
  | 'tools'
  | 'api'
  | 'session';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

interface PerfDashboardProps {
  view?: PerfView;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      {title}
    </Text>
    {children}
  </Box>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box>
    <Box width={24}>
      <Text color={theme.text.link}>{label}</Text>
    </Box>
    <Text color={theme.text.secondary}>{value}</Text>
  </Box>
);

export const PerfDashboard: React.FC<PerfDashboardProps> = ({ view }) => {
  const snapshot = useMemo(
    () => PerformanceDataService.getPerformanceSnapshot(),
    [],
  );

  const showStartup = !view || view === 'startup';
  const showMemory = !view || view === 'memory';
  const showTools = !view || view === 'tools';
  const showApi = !view || view === 'api';
  const showSession = !view || view === 'session';

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold color={theme.text.primary}>
        Performance Dashboard
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {showStartup && (
          <Section title="Startup">
            {snapshot.startup.length === 0 ? (
              <Text color={theme.text.secondary}>
                No startup phases recorded.
              </Text>
            ) : (
              snapshot.startup.map((p) => (
                <Row
                  key={p.name}
                  label={p.name}
                  value={`${p.duration_ms.toFixed(2)} ms`}
                />
              ))
            )}
          </Section>
        )}

        {showMemory && (
          <Section title="Memory">
            <Row
              label="heapUsed"
              value={formatBytes(snapshot.memory.heapUsed)}
            />
            <Row label="rss" value={formatBytes(snapshot.memory.rss)} />
            <Row
              label="highWaterMark"
              value={formatBytes(snapshot.memory.highWaterMark)}
            />
          </Section>
        )}

        {showTools && (
          <Section title="Tools">
            {snapshot.tools.length === 0 ? (
              <Text color={theme.text.secondary}>No tool calls recorded.</Text>
            ) : (
              snapshot.tools.map((t) => (
                <Box key={t.name} flexDirection="column" marginLeft={2}>
                  <Row label={t.name} value="" />
                  <Row label="  calls" value={String(t.callCount)} />
                  <Row
                    label="  total time"
                    value={formatMs(t.totalExecutionTimeMs)}
                  />
                </Box>
              ))
            )}
          </Section>
        )}

        {showApi && (
          <Section title="API">
            <Row
              label="Total requests"
              value={String(snapshot.api.totalRequests)}
            />
            <Row
              label="Total errors"
              value={String(snapshot.api.totalErrors)}
            />
            <Row
              label="Error rate"
              value={`${(snapshot.api.errorRate * 100).toFixed(2)}%`}
            />
            {snapshot.api.byModel.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text color={theme.text.link}>By model</Text>
                {snapshot.api.byModel.map((m) => (
                  <Box key={m.model} marginLeft={2}>
                    <Row label={m.model} value="" />
                    <Row label="  requests" value={String(m.requestCount)} />
                    <Row label="  errors" value={String(m.errorCount)} />
                    <Row
                      label="  avg latency"
                      value={`${m.avgLatencyMs.toFixed(0)} ms`}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Section>
        )}

        {showSession && (
          <Section title="Session">
            <Row label="Uptime" value={formatMs(snapshot.session.uptimeMs)} />
            <Row
              label="Request count"
              value={String(snapshot.session.requestCount)}
            />
          </Section>
        )}
      </Box>
    </Box>
  );
};
