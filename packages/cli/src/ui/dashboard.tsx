/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { TextProps } from 'ink';
import Spinner from 'ink-spinner';
import { usePerformanceData } from './hooks/usePerformanceData.js';
import { useKeypress, type Key } from './hooks/useKeypress.js';
import { MemoryChart } from './components/MemoryChart.js';
import { StartupTimeline } from './components/StartupTimeline.js';
import { ToolStatsTable } from './components/ToolStatsTable.js';
import { ModelLatencyChart } from './components/ModelLatencyChart.js';
import { SessionStats } from './components/SessionStats.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';

interface DashboardProps {
  live?: boolean;
  onExit: () => void;
}

type DashboardSection =
  | 'system'
  | 'memory'
  | 'startup'
  | 'tools'
  | 'model'
  | 'session';

// ─────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────

/** A horizontal rule, optionally with a centred label */
const Rule: React.FC<{ label?: string; width?: number; color?: string }> = ({
  label,
  width = 58,
  color = 'gray',
}) => {
  if (!label) {
    return <Text color={color}>{'─'.repeat(width)}</Text>;
  }
  const side = Math.max(2, Math.floor((width - label.length - 2) / 2));
  const line = '─'.repeat(side);
  return (
    <Text>
      <Text color={color}>{line + ' '}</Text>
      <Text color="cyan" bold>
        {label}
      </Text>
      <Text color={color}>{' ' + line}</Text>
    </Text>
  );
};

/** Labelled value row */
const KV: React.FC<{
  label: string;
  value: React.ReactNode;
  labelWidth?: number;
  accent?: TextProps['color'];
}> = ({ label, value, labelWidth = 12, accent = 'cyan' }) => (
  <Box>
    <Text color="gray">{label.padEnd(labelWidth)}</Text>
    <Text color={accent}>{value}</Text>
  </Box>
);

/** Glowing status indicator */
const Dot: React.FC<{ on: boolean; label: string }> = ({ on, label }) => (
  <Box marginRight={2}>
    <Text color={on ? 'green' : 'red'}>{on ? '◉' : '○'}</Text>
    <Text color={on ? 'green' : 'gray'}> {label}</Text>
  </Box>
);

/** Keyboard shortcut badge */
const Key: React.FC<{ k: string; desc: string }> = ({ k, desc }) => (
  <Box marginRight={2}>
    <Text backgroundColor="gray" color="black">{` ${k} `}</Text>
    <Text color="gray"> {desc}</Text>
  </Box>
);

/** Section header strip */
const SectionHeader: React.FC<{ icon: string; title: string }> = ({
  icon,
  title,
}) => (
  <Box marginBottom={1}>
    <Rule label={`${icon}  ${title}`} color="blue" />
  </Box>
);

// ─────────────────────────────────────────────────────────────
// Header / wordmark
// ─────────────────────────────────────────────────────────────

const WordmarkBanner: React.FC = () => (
  <Box flexDirection="column" alignItems="center" marginBottom={1}>
    <Text color="#4FA8F8" bold>
      Gemini CLI Performance Dashboard
    </Text>
    <Box marginTop={0}>
      <Text color="#4285F4">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
    </Box>
  </Box>
);

// ─────────────────────────────────────────────────────────────
// Tab bar
// ─────────────────────────────────────────────────────────────

const Tab: React.FC<{
  icon: string;
  label: string;
  shortcut: string;
  active: boolean;
}> = ({ icon, label, shortcut, active }) => (
  <Box marginRight={1}>
    {active ? (
      <Text
        backgroundColor="blue"
        color="white"
        bold
      >{` ${icon} ${label} `}</Text>
    ) : (
      <Text color="gray">
        {'['}
        <Text color="cyan">{shortcut}</Text>
        {`] ${icon} ${label}`}
      </Text>
    )}
  </Box>
);

// ─────────────────────────────────────────────────────────────
// Loading / error / empty states
// ─────────────────────────────────────────────────────────────

const HintList: React.FC = () => (
  <Box flexDirection="column" marginTop={1}>
    <Text color="gray" bold>
      {' '}
      Try one of these:
    </Text>
    <Text color="gray">
      {' '}
      <Text color="cyan">{'›'}</Text> <Text color="cyan">/git status</Text> run
      a shell tool
    </Text>
    <Text color="gray">
      {' '}
      <Text color="cyan">{'›'}</Text>{' '}
      <Text color="cyan">&quot;Hello!&quot;</Text> ask the model
    </Text>
    <Text color="gray">
      {' '}
      <Text color="cyan">{'›'}</Text> <Text color="cyan">/stats</Text> check
      current stats
    </Text>
  </Box>
);

const StateBox: React.FC<{
  border: 'round' | 'double' | 'single';
  borderColor: string;
  children: React.ReactNode;
}> = ({ border, borderColor, children }) => (
  <Box flexDirection="column" padding={1}>
    <WordmarkBanner />
    <Box
      borderStyle={border}
      borderColor={borderColor}
      padding={1}
      flexDirection="column"
    >
      {children}
    </Box>
  </Box>
);

// ─────────────────────────────────────────────────────────────
// System panel
// ─────────────────────────────────────────────────────────────

const SystemPanel: React.FC = () => {
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const uptimeStr = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;

  return (
    <Box flexDirection="column" width="100%">
      <SectionHeader icon="◈" title="System Information" />
      <KV label="  Node    " value={process.version} />
      <KV label="  Platform" value={`${process.platform} (${process.arch})`} />
      <KV label="  PID     " value={String(process.pid)} />
      <KV label="  Uptime  " value={uptimeStr} accent="green" />
      <Box marginTop={1} flexDirection="column">
        <SectionHeader icon="◎" title="Collectors" />
        <Box>
          <Dot on={true} label="Memory Collector" />
          <Dot on={true} label="DevTools Bridge" />
        </Box>
      </Box>
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────
// Main dashboard
// ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'system' as const, name: 'System', icon: '◈', shortcut: '1' },
  { id: 'memory' as const, name: 'Memory', icon: '▦', shortcut: '2' },
  { id: 'startup' as const, name: 'Startup', icon: '⚡', shortcut: '3' },
  { id: 'tools' as const, name: 'Tools', icon: '⚙', shortcut: '4' },
  { id: 'model' as const, name: 'Model', icon: '◆', shortcut: '5' },
  { id: 'session' as const, name: 'Session', icon: '❯', shortcut: '6' },
];

export const Dashboard: React.FC<DashboardProps> = ({
  live = false,
  onExit,
}) => {
  const { data, loading, error, lastUpdated } = usePerformanceData(live);
  const [selectedSection, setSelectedSection] =
    useState<DashboardSection>('system');
  const { rows } = useTerminalSize();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDataReady = (perfData: any) =>
    Object.keys(perfData.tools.stats).length > 0 ||
    perfData.model.recentCalls.length > 0 ||
    perfData.startup.total > 0 ||
    perfData.session.current.duration > 0;

  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (!loading && data) {
      setDataReady(isDataReady(data));
    }
  }, [loading, data]);

  useKeypress(
    (key: Key) => {
      if (key.sequence === 'q' || key.name === 'escape') {
        onExit();
        return true;
      }

      const ids = SECTIONS.map((s) => s.id);
      const idx = ids.indexOf(selectedSection);

      if (key.name === 'left') setSelectedSection(ids[Math.max(0, idx - 1)]);
      if (key.name === 'right')
        setSelectedSection(ids[Math.min(ids.length - 1, idx + 1)]);

      const map: Record<string, DashboardSection> = {
        '1': 'system',
        '2': 'memory',
        '3': 'startup',
        '4': 'tools',
        '5': 'model',
        '6': 'session',
      };
      if (map[key.sequence]) setSelectedSection(map[key.sequence]);

      return true;
    },
    { isActive: true },
  );

  // ── States ───────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <StateBox border="round" borderColor="blue">
        <Box>
          <Text color="cyan">
            <Spinner type="dots12" />
          </Text>
          <Text color="white" bold>
            {' '}
            Loading performance data…
          </Text>
        </Box>
        <Box marginTop={1}>
          <Rule />
        </Box>
        <HintList />
      </StateBox>
    );
  }

  if (error) {
    return (
      <StateBox border="double" borderColor="red">
        <Text color="red" bold>
          ✖ Error encountered
        </Text>
        <Text color="white" dimColor>
          {error}
        </Text>
        <Box marginTop={1}>
          <Rule />
        </Box>
        <Text color="gray"> › Verify collectors are initialized</Text>
        <Text color="gray">
          {' '}
          › Re-run <Text color="cyan">/perf</Text>
        </Text>
        <Box marginTop={1}>
          <Key k="q" desc="exit" />
        </Box>
      </StateBox>
    );
  }

  if (!data) {
    return (
      <StateBox border="round" borderColor="yellow">
        <Text color="yellow" bold>
          ⚠ No performance data available
        </Text>
        <Box marginTop={1}>
          <Rule />
        </Box>
        <HintList />
        <Box marginTop={1}>
          <Key k="q" desc="exit" />
        </Box>
      </StateBox>
    );
  }

  const hasData = isDataReady(data);

  if (!hasData && !loading) {
    return (
      <StateBox border="round" borderColor="blue">
        <Text color="blue" bold>
          ◎ Monitors active — awaiting data
        </Text>
        <Box marginTop={1}>
          <Rule />
        </Box>
        <HintList />
        <Box marginTop={1}>
          <Text dimColor>Data will appear automatically once collected.</Text>
        </Box>
        <Box marginTop={1}>
          <Key k="q" desc="exit" />
          <Text dimColor>
            Live:{' '}
            <Text color={live ? 'green' : 'gray'}>{live ? 'ON' : 'OFF'}</Text>
          </Text>
        </Box>
      </StateBox>
    );
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      height={rows > 5 ? rows - 1 : undefined}
      overflow="hidden"
    >
      {/* ── Wordmark ── */}
      <WordmarkBanner />

      {/* ── Meta row ── */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text color="blueBright" bold>
            Performance Dashboard
          </Text>
          <Text color="gray"> · </Text>
          <Text color="gray">v{data.version}</Text>
          <Text color="gray"> · </Text>
          <Text color="gray" dimColor>
            updated {lastUpdated?.toLocaleTimeString()}
          </Text>
        </Box>
        <Text color={dataReady ? 'green' : 'yellow'}>
          {dataReady ? '✔ Ready' : '⏳ Collecting…'}
        </Text>
      </Box>

      {/* ── Tabs ── */}
      <Box marginBottom={1} flexWrap="wrap">
        {SECTIONS.map((s) => (
          <Tab
            key={s.id}
            icon={s.icon}
            label={s.name}
            shortcut={s.shortcut}
            active={selectedSection === s.id}
          />
        ))}
      </Box>

      {/* ── Content ── */}
      <Box
        borderStyle="round"
        borderColor="blue"
        paddingX={1}
        flexGrow={1}
        flexDirection="column"
      >
        {selectedSection === 'system' && <SystemPanel />}
        {selectedSection === 'memory' && <MemoryChart data={data.memory} />}
        {selectedSection === 'startup' && (
          <StartupTimeline data={data.startup} />
        )}
        {selectedSection === 'tools' && <ToolStatsTable data={data.tools} />}
        {selectedSection === 'model' && <ModelLatencyChart data={data.model} />}
        {selectedSection === 'session' && <SessionStats data={data.session} />}
      </Box>

      {/* ── Footer ── */}
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          <Dot on={live} label={`Live ${live ? 'ON' : 'OFF'}`} />
          {!dataReady && !live && (
            <Text color="yellow" dimColor>
              · refresh with <Text color="cyan">/perf</Text>
            </Text>
          )}
        </Box>
        <Box>
          <Key k="← →" desc="navigate" />
          <Key k="1–6" desc="jump" />
          <Key k="q" desc="exit" />
        </Box>
      </Box>
    </Box>
  );
};
