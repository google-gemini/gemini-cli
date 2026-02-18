/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDevToolsData, type ConsoleLog, type NetworkLog } from './hooks';

type ThemeMode = 'light' | 'dark' | null; // null means follow system

interface ThemeColors {
  bg: string;
  bgSecondary: string;
  bgHover: string;
  border: string;
  text: string;
  textSecondary: string;
  accent: string;
  consoleBg: string;
  rowBorder: string;
  errorBg: string;
  warnBg: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'console' | 'network'>('console');
  const { networkLogs, consoleLogs, connectedSessions } = useDevToolsData();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [importedLogs, setImportedLogs] = useState<{
    network: NetworkLog[];
    console: ConsoleLog[];
  } | null>(null);
  const [importedSessionId, setImportedSessionId] = useState<string | null>(
    null,
  );

  // --- Theme Logic ---
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('devtools-theme');
    if (!saved) return null; // Default: follow system
    return saved as ThemeMode;
  });

  const [systemIsDark, setSystemIsDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const isDark = themeMode === null ? systemIsDark : themeMode === 'dark';

  const t = useMemo(
    () => ({
      bg: isDark ? '#202124' : '#ffffff',
      bgSecondary: isDark ? '#292a2d' : '#f3f3f3',
      bgHover: isDark ? '#35363a' : '#e8f0fe',
      border: isDark ? '#3c4043' : '#ccc',
      text: isDark ? '#e8eaed' : '#333',
      textSecondary: isDark ? '#9aa0a6' : '#666',
      accent: isDark ? '#8ab4f8' : '#1a73e8',
      consoleBg: isDark ? '#1e1e1e' : '#fff',
      rowBorder: isDark ? '#303134' : '#f0f0f0',
      errorBg: isDark ? '#3c1e1e' : '#fff0f0',
      warnBg: isDark ? '#302a10' : '#fff3cd',
    }),
    [isDark],
  );

  const toggleTheme = () => {
    const nextMode = isDark ? 'light' : 'dark';
    setThemeMode(nextMode);
    localStorage.setItem('devtools-theme', nextMode);
  };

  // --- Import Logic ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        const networkMap = new Map<string, NetworkLog>();
        const consoleLogs: ConsoleLog[] = [];

        content
          .split('\n')
          .filter((l) => l.trim())
          .forEach((l) => {
            const parsed = JSON.parse(l);
            const payload = parsed.payload || {};
            const type = parsed.type;
            const timestamp = parsed.timestamp;

            if (type === 'console') {
              consoleLogs.push({
                ...payload,
                type,
                timestamp,
                id: payload.id || Math.random().toString(36).substring(2, 11),
              });
            } else if (type === 'network') {
              const id = payload.id;
              if (!id) return;

              if (!networkMap.has(id)) {
                networkMap.set(id, {
                  ...payload,
                  type,
                  timestamp,
                  id,
                } as NetworkLog);
              } else {
                // It's likely a response update
                const existing = networkMap.get(id)!;
                networkMap.set(id, {
                  ...existing,
                  ...payload,
                  // Ensure we don't overwrite the original timestamp or type
                  type: existing.type,
                  timestamp: existing.timestamp,
                } as NetworkLog);
              }
            }
          });

        const importId = `[Imported] ${file.name}`;
        const networkLogs = Array.from(networkMap.values()).sort(
          (a, b) => a.timestamp - b.timestamp,
        );

        setImportedLogs({ network: networkLogs, console: consoleLogs });
        setImportedSessionId(importId);
        setSelectedSessionId(importId);
      } catch (err) {
        console.error('Import error:', err);
        alert('Failed to parse session file. Ensure it is a valid JSONL file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- Export Logic ---
  const handleExport = () => {
    if (!selectedSessionId) return;

    // Collect entries with timestamps, then sort before serializing
    const entries: Array<{ timestamp: number; data: object }> = [];

    // Export console logs
    filteredConsoleLogs.forEach((log) => {
      entries.push({
        timestamp: log.timestamp,
        data: {
          type: 'console',
          payload: { type: log.type, content: log.content },
          sessionId: log.sessionId,
          timestamp: log.timestamp,
        },
      });
    });

    // Export network logs
    filteredNetworkLogs.forEach((log) => {
      entries.push({
        timestamp: log.timestamp,
        data: {
          type: 'network',
          payload: log,
          sessionId: log.sessionId,
          timestamp: log.timestamp,
        },
      });
    });

    // Sort by timestamp, then serialize
    entries.sort((a, b) => a.timestamp - b.timestamp);

    const content = entries.map((e) => JSON.stringify(e.data)).join('\n');
    const blob = new Blob([content], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${selectedSessionId}.jsonl`;
    a.click();

    URL.revokeObjectURL(url);
  };

  // --- Session Discovery ---
  const sessions = useMemo(() => {
    const sessionMap = new Map<string, number>();
    const updateMap = (l: { sessionId?: string; timestamp: number }) => {
      if (!l.sessionId) return;
      const currentMax = sessionMap.get(l.sessionId) || 0;
      if (l.timestamp > currentMax) sessionMap.set(l.sessionId, l.timestamp);
    };
    networkLogs.forEach(updateMap);
    consoleLogs.forEach(updateMap);

    const discovered = Array.from(sessionMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0]);

    if (importedSessionId) {
      return [importedSessionId, ...discovered];
    }
    return discovered;
  }, [networkLogs, consoleLogs, importedSessionId]);

  useEffect(() => {
    if (sessions.length > 0 && selectedSessionId === null) {
      setSelectedSessionId(sessions[0]);
    }
  }, [sessions, selectedSessionId]);

  const filteredConsoleLogs = useMemo(() => {
    if (!selectedSessionId) return [];
    if (selectedSessionId === importedSessionId && importedLogs) {
      return importedLogs.console;
    }
    return consoleLogs.filter((l) => l.sessionId === selectedSessionId);
  }, [consoleLogs, selectedSessionId, importedSessionId, importedLogs]);

  const filteredNetworkLogs = useMemo(() => {
    if (!selectedSessionId) return [];
    if (selectedSessionId === importedSessionId && importedLogs) {
      return importedLogs.network;
    }
    return networkLogs.filter((l) => l.sessionId === selectedSessionId);
  }, [networkLogs, selectedSessionId, importedSessionId, importedLogs]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: t.bg,
        color: t.text,
        transition: 'background 0.2s, color 0.2s',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <style>{`
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: ${t.bgSecondary}; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${t.textSecondary}; }
        [data-gutter]::selection, [data-gutter] *::selection { background: transparent; }
        [data-gutter] .fold-icon { opacity: 0; transition: opacity 0.15s; }
        [data-code-view]:has([data-gutter]:hover) .fold-icon { opacity: 1; }
      `}</style>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          background: t.bgSecondary,
          borderBottom: `1px solid ${t.border}`,
          height: '36px',
          alignItems: 'center',
          padding: '0 8px',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', height: '100%' }}>
          <TabButton
            active={activeTab === 'console'}
            onClick={() => setActiveTab('console')}
            label="Console"
            t={t}
          />
          <TabButton
            active={activeTab === 'network'}
            onClick={() => setActiveTab('network')}
            label="Network"
            t={t}
          />
        </div>

        <div
          style={{
            marginLeft: 'auto',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {selectedSessionId &&
            connectedSessions.includes(selectedSessionId) && (
              <button
                onClick={handleExport}
                style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                📤 Export
              </button>
            )}

          <label
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              border: `1px solid ${t.border}`,
              background: t.bg,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              fontSize: '11px',
            }}
          >
            <span>📥 Import</span>
            <input
              type="file"
              accept=".jsonl"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '11px', color: t.textSecondary }}>
              Session:
            </span>
            {sessions.length > 0 ? (
              <select
                value={selectedSessionId || ''}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  background: t.bg,
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: '3px',
                  minWidth: '280px',
                  outline: 'none',
                }}
              >
                {sessions.map((id) => (
                  <option key={id} value={id}>
                    {id}{' '}
                    {id === sessions[0] && !id.startsWith('[Imported]')
                      ? '(Latest)'
                      : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span
                style={{
                  fontSize: '11px',
                  color: t.textSecondary,
                  fontStyle: 'italic',
                }}
              >
                No Sessions
              </span>
            )}
            {selectedSessionId &&
              !selectedSessionId.startsWith('[Imported]') && (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    marginLeft: '8px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: connectedSessions.includes(selectedSessionId)
                        ? '#34a853'
                        : '#ea4335',
                    }}
                  />
                  <span style={{ color: t.textSecondary }}>
                    {connectedSessions.includes(selectedSessionId)
                      ? 'Connected'
                      : 'Disconnected'}
                  </span>
                </span>
              )}
          </div>

          <button
            onClick={toggleTheme}
            style={{
              fontSize: '14px',
              padding: '2px 8px',
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '24px',
              width: '32px',
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {selectedSessionId ? (
          <>
            <div
              style={{
                display: activeTab === 'console' ? 'flex' : 'none',
                height: '100%',
              }}
            >
              <ConsoleView logs={filteredConsoleLogs} t={t} />
            </div>
            <div
              style={{
                display: activeTab === 'network' ? 'flex' : 'none',
                height: '100%',
              }}
            >
              <NetworkView logs={filteredNetworkLogs} t={t} isDark={isDark} />
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: t.textSecondary,
              fontSize: '14px',
            }}
          >
            Please start Gemini CLI to begin debugging
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  t,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  t: ThemeColors;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '4px 16px',
        cursor: 'pointer',
        color: active ? t.accent : t.textSecondary,
        fontWeight: 600,
        fontSize: '12px',
        userSelect: 'none',
        borderBottom: active
          ? `2px solid ${t.accent}`
          : '2px solid transparent',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </div>
  );
}

// --- Console Components ---

function ConsoleLogEntry({ log, t }: { log: ConsoleLog; t: ThemeColors }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const content = log.content || '';
  const lines = content.split('\n');
  const CHAR_LIMIT = 500;
  const LINE_LIMIT = 5;

  const isTooLong = content.length > CHAR_LIMIT;
  const isTooManyLines = lines.length > LINE_LIMIT;
  const needsCollapse = isTooLong || isTooManyLines;

  const isError = log.type === 'error';
  const isWarn = log.type === 'warn';
  const bg = isError ? t.errorBg : isWarn ? t.warnBg : 'transparent';
  const color = isError ? '#f28b82' : isWarn ? '#fdd663' : t.text;
  const icon = isError ? '❌' : isWarn ? '⚠️' : ' ';

  let displayContent = content;
  if (needsCollapse && !isExpanded) {
    if (isTooManyLines) {
      displayContent = lines.slice(0, LINE_LIMIT).join('\n') + '\n...';
    } else {
      displayContent = content.substring(0, CHAR_LIMIT) + '...';
    }
  }

  return (
    <div
      style={{
        display: 'flex',

        borderBottom: `1px solid ${t.rowBorder}`,

        padding: '4px 12px',

        backgroundColor: bg,

        alignItems: 'flex-start',

        gap: '8px',
      }}
    >
      <div
        style={{
          width: '16px',

          textAlign: 'center',

          flexShrink: 0,

          fontSize: '10px',

          marginTop: '2px',
        }}
      >
        {icon}
      </div>

      <div
        style={{
          flex: 1,

          display: 'flex',

          flexDirection: 'column',
        }}
      >
        <div
          style={{
            whiteSpace: 'pre-wrap',

            wordBreak: 'break-all',

            color: color,

            lineHeight: '1.5',

            fontSize: '11px',
          }}
        >
          {displayContent}
        </div>
      </div>

      <div
        style={{
          display: 'flex',

          alignItems: 'center',

          gap: '8px',

          flexShrink: 0,
        }}
      >
        {needsCollapse && (
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              fontSize: '12px',

              color: t.text,

              cursor: 'pointer',

              fontWeight: 'bold',

              userSelect: 'none',

              width: '20px',

              height: '20px',

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'center',

              borderRadius: '4px',

              border: `1px solid ${t.border}`,

              background: t.bgSecondary,

              transition: 'all 0.1s',
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = t.bgHover;
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                t.bgSecondary;
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '−' : '+'}
          </div>
        )}

        <div
          style={{
            color: t.textSecondary,

            fontSize: '10px',

            userSelect: 'none',

            textAlign: 'right',

            minWidth: '70px',
          }}
        >
          {new Date(log.timestamp).toLocaleTimeString([], {
            hour12: false,

            hour: '2-digit',

            minute: '2-digit',

            second: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

function ConsoleView({ logs, t }: { logs: ConsoleLog[]; t: ThemeColors }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div
        style={{
          padding: '20px',

          color: t.textSecondary,

          fontSize: '11px',

          textAlign: 'center',

          flex: 1,
        }}
      >
        No console logs in this session
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,

        overflowY: 'auto',

        fontFamily:
          'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',

        background: t.consoleBg,

        fontSize: '12px',
      }}
    >
      {logs.map((log) => (
        <ConsoleLogEntry key={log.id} log={log} t={t} />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}

// --- Network Components ---

function NetworkView({
  logs,
  t,
  isDark,
}: {
  logs: NetworkLog[];
  t: ThemeColors;
  isDark: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [groupByDomain, setGroupByDomain] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(
        200,
        Math.min(e.clientX, window.innerWidth - 200),
      );
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = () => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filter) {
      const lower = filter.toLowerCase();
      result = logs.filter((l) => l.url.toLowerCase().includes(lower));
    }
    return result;
  }, [logs, filter]);

  const groupedLogs = useMemo(() => {
    if (!groupByDomain) return null;
    const groups: Record<string, NetworkLog[]> = {};
    filteredLogs.forEach((log) => {
      let groupKey = 'Other';
      try {
        const url = new URL(log.url);
        const lastSlashIndex = url.pathname.lastIndexOf('/');
        const basePath =
          lastSlashIndex !== -1
            ? url.pathname.substring(0, lastSlashIndex + 1)
            : '/';
        groupKey = url.hostname + basePath;
      } catch {
        /* ignore */
      }
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(log);
    });
    return groups;
  }, [filteredLogs, groupByDomain]);

  useEffect(() => {
    if (groupedLogs) {
      setExpandedGroups((prev) => {
        const next = { ...prev };
        Object.keys(groupedLogs).forEach((key) => {
          if (next[key] === undefined) {
            // Collapse play.googleapis.com by default
            next[key] = !key.includes('play.googleapis.com');
          }
        });
        return next;
      });
    }
  }, [groupedLogs]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // --- Context Menu --- (reserved for future actions)

  const selectedLog = logs.find((l) => l.id === selectedId);

  const renderLogItem = (log: NetworkLog, nameOverride?: string) => {
    const isPending = log.pending;
    const status = log.response
      ? log.response.status
      : log.error
        ? 'ERR'
        : '...';
    const isError = log.error || (log.response && log.response.status >= 400);

    let name = nameOverride || log.url;
    if (!nameOverride) {
      try {
        const urlObj = new URL(log.url);
        name = urlObj.pathname + urlObj.search;
      } catch {
        /* ignore */
      }
    }

    const isSelected = log.id === selectedId;

    return (
      <div
        key={log.id}
        onClick={() => setSelectedId(log.id)}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          borderBottom: `1px solid ${t.rowBorder}`,
          display: 'flex',
          flexDirection: 'column',
          fontSize: '12px',
          backgroundColor: isSelected ? t.bgHover : 'transparent',
          color: isError ? '#f28b82' : t.text,
          paddingLeft: nameOverride ? '24px' : '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              fontWeight: 'bold',
              width: '45px',
              flexShrink: 0,
              fontSize: '10px',
              color: isDark ? '#81c995' : '#188038', // Green for methods
            }}
          >
            {log.method}
          </span>
          <span
            style={{
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              margin: '0 8px',
              fontWeight: 500,
            }}
            title={log.url}
          >
            {name}
          </span>
          <span
            style={{
              width: '40px',
              textAlign: 'right',
              flexShrink: 0,
              fontSize: '11px',
              color: isPending ? t.accent : isError ? '#f28b82' : '#81c995',
            }}
          >
            {isPending ? '⏳' : status}
          </span>
        </div>
      </div>
    );
  };

  if (logs.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: t.textSecondary,
          fontSize: '12px',
        }}
      >
        No network activity in this session
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* List */}
      <div
        style={{
          width: `${sidebarWidth}px`,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${t.border}`,
          background: t.bg,
        }}
      >
        <div
          style={{
            padding: '6px',
            background: t.bgSecondary,
            borderBottom: `1px solid ${t.border}`,
            display: 'flex',
            gap: '6px',
          }}
        >
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: 1,
              boxSizing: 'border-box',
              padding: '4px 10px',
              background: t.bg,
              color: t.text,
              border: `1px solid ${t.border}`,
              borderRadius: '4px',
              fontSize: '12px',
            }}
          />
          <button
            onClick={() => setGroupByDomain(!groupByDomain)}
            style={{
              background: groupByDomain ? t.accent : t.bg,
              color: groupByDomain ? '#fff' : t.text,
              border: `1px solid ${t.border}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '0 8px',
            }}
            title="Group by Domain"
          >
            📂
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {groupByDomain && groupedLogs
            ? Object.keys(groupedLogs).map((groupKey) => (
                <div key={groupKey}>
                  <div
                    onClick={() => toggleGroup(groupKey)}
                    style={{
                      padding: '6px 12px',
                      background: t.bgSecondary,
                      fontWeight: 'bold',
                      fontSize: '11px',
                      borderBottom: `1px solid ${t.rowBorder}`,
                      wordBreak: 'break-all',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      userSelect: 'none',
                    }}
                  >
                    <span
                      style={{
                        marginRight: '8px',
                        fontSize: '9px',
                        color: t.textSecondary,
                      }}
                    >
                      {expandedGroups[groupKey] ? '▼' : '▶'}
                    </span>
                    {groupKey}
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontWeight: 'normal',
                        color: t.textSecondary,
                        fontSize: '10px',
                        background: t.bg,
                        padding: '0 6px',
                        borderRadius: '10px',
                      }}
                    >
                      {groupedLogs[groupKey].length}
                    </span>
                  </div>
                  {expandedGroups[groupKey] &&
                    groupedLogs[groupKey].map((log) => {
                      let displayName = log.url;
                      try {
                        const url = new URL(log.url);
                        const lastSlashIndex = url.pathname.lastIndexOf('/');
                        const suffix = url.pathname.substring(
                          lastSlashIndex + 1,
                        );
                        displayName = (suffix || '/') + url.search;
                      } catch {
                        /* ignore */
                      }
                      return renderLogItem(log, displayName);
                    })}
                </div>
              ))
            : filteredLogs.map((log) => renderLogItem(log))}
        </div>
      </div>

      {/* Resizer */}
      <div
        onMouseDown={startResizing}
        style={{
          width: '2px',
          cursor: 'col-resize',
          background: t.border,
          flexShrink: 0,
          zIndex: 10,
        }}
      />

      {/* Detail */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: t.bg,
        }}
      >
        {selectedLog ? (
          <NetworkDetail log={selectedLog} t={t} />
        ) : (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: t.textSecondary,
              fontSize: '14px',
            }}
          >
            Select a request to view details
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = 'headers' | 'payload' | 'response';

function NetworkDetail({ log, t }: { log: NetworkLog; t: ThemeColors }) {
  const [activeTab, setActiveTab] = useState<Tab>('headers');
  const status = log.response
    ? log.pending
      ? '⏳'
      : log.response.status
    : log.error
      ? 'Error'
      : '⏳';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${t.border}`,
          background: t.bgSecondary,
        }}
      >
        <div
          style={{
            fontWeight: 'bold',
            fontSize: '13px',
            marginBottom: '6px',
            wordBreak: 'break-all',
            color: t.text,
          }}
        >
          {log.url}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: t.textSecondary,
            display: 'flex',
            gap: '8px',
          }}
        >
          <span
            style={{
              background: t.bg,
              padding: '1px 6px',
              borderRadius: '3px',
              fontWeight: 'bold',
            }}
          >
            {log.method}
          </span>
          <span>•</span>
          <span style={{ color: log.error ? '#f28b82' : '#81c995' }}>
            {status}
          </span>
          <span>•</span>
          <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
          {log.response && (
            <>
              <span>•</span>
              <span style={{ color: t.accent }}>
                {log.response.durationMs}ms
              </span>
            </>
          )}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${t.border}`,
          background: t.bgSecondary,
          paddingLeft: '8px',
        }}
      >
        {(['headers', 'payload', 'response'] as const).map((tab) => (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              textTransform: 'capitalize',
              borderBottom:
                activeTab === tab
                  ? `2px solid ${t.accent}`
                  : '2px solid transparent',
              color: activeTab === tab ? t.accent : t.textSecondary,
              transition: 'all 0.2s',
            }}
          >
            {tab}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: t.bg }}>
        {activeTab === 'headers' && (
          <div style={{ padding: '16px' }}>
            <Section title="General" t={t}>
              <Pair k="Request URL" v={log.url} t={t} />
              <Pair k="Request Method" v={log.method} t={t} />
              <Pair
                k="Status Code"
                v={String(log.response ? log.response.status : 'Pending')}
                t={t}
                color={log.error ? '#f28b82' : '#81c995'}
              />
              {log.error && (
                <Pair k="Error" v={log.error} t={t} color="#f28b82" />
              )}
            </Section>
            <Section title="Response Headers" t={t}>
              {log.response ? (
                <HeadersMap headers={log.response.headers} t={t} />
              ) : (
                <span style={{ fontStyle: 'italic', color: t.textSecondary }}>
                  (no response yet)
                </span>
              )}
            </Section>
            <Section title="Request Headers" t={t}>
              <HeadersMap headers={log.headers} t={t} />
            </Section>
          </div>
        )}
        {activeTab === 'payload' && <BodyView content={log.body} t={t} />}
        {activeTab === 'response' && (
          <BodyView content={log.response?.body} chunks={log.chunks} t={t} />
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  t,
}: {
  title: string;
  children: React.ReactNode;
  t: ThemeColors;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      style={{
        marginBottom: '16px',
        border: `1px solid ${t.border}`,
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '8px 12px',
          background: t.bgSecondary,
          fontWeight: 'bold',
          fontSize: '11px',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '9px', color: t.textSecondary }}>
          {collapsed ? '▶' : '▼'}
        </span>
        {title}
      </div>
      {!collapsed && (
        <div style={{ padding: '12px', background: t.bg }}>{children}</div>
      )}
    </div>
  );
}

function Pair({
  k,
  v,
  color,
  t,
}: {
  k: string;
  v: string;
  color?: string;
  t: ThemeColors;
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: '12px',
        fontFamily: 'monospace',
        marginBottom: '4px',
        lineHeight: '1.4',
      }}
    >
      <div
        style={{
          fontWeight: 'bold',
          color: t.textSecondary,
          width: '160px',
          flexShrink: 0,
        }}
      >
        {k}:
      </div>
      <div style={{ flex: 1, wordBreak: 'break-all', color: color || t.text }}>
        {v}
      </div>
    </div>
  );
}

function HeadersMap({
  headers,
  t,
}: {
  headers: Record<string, unknown> | undefined;
  t: ThemeColors;
}) {
  if (!headers) return <div style={{ color: t.textSecondary }}>(none)</div>;
  return (
    <>
      {Object.entries(headers).map(([k, v]) => (
        <Pair key={k} k={k} v={String(v)} t={t} />
      ))}
    </>
  );
}

function BodyView({
  content,
  chunks,
  t,
}: {
  content?: string;
  chunks?: Array<{ index: number; data: string; timestamp: number }>;
  t: ThemeColors;
}) {
  const [mode, setMode] = useState<'json' | 'raw'>('json');
  const hasChunks = chunks && chunks.length > 0;
  const safeContent = hasChunks
    ? chunks.map((c) => c.data).join('')
    : content || '';
  const getFormattedJson = () => {
    try {
      return JSON.stringify(JSON.parse(safeContent), null, 2);
    } catch {
      return safeContent;
    }
  };

  const copyJson = () => {
    navigator.clipboard.writeText(getFormattedJson()).catch(() => {
      // Clipboard API unavailable — silently ignore
    });
  };

  const downloadJson = () => {
    const blob = new Blob([getFormattedJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'body.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!safeContent && !hasChunks)
    return (
      <div
        style={{ padding: '40px', color: t.textSecondary, textAlign: 'center' }}
      >
        (No content)
      </div>
    );

  const iconBtn = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: t.textSecondary,
    padding: '2px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '6px 12px',
          background: t.bgSecondary,
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        {(['json', 'raw'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              border: `1px solid ${t.border}`,
              background: mode === m ? t.accent : t.bg,
              color: mode === m ? '#fff' : t.text,
              cursor: 'pointer',
              textTransform: 'uppercase',
              fontWeight: 'bold',
            }}
          >
            {m}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={copyJson} style={iconBtn} title="Copy JSON">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25z" />
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25z" />
          </svg>
        </button>
        <button onClick={downloadJson} style={iconBtn} title="Download JSON">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14z" />
            <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06z" />
          </svg>
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: mode === 'raw' ? '16px' : 0,
        }}
      >
        {hasChunks && mode === 'raw' ? (
          <div>
            {chunks.map((chunk, i) => (
              <div key={i} style={{ marginBottom: '12px' }}>
                <div
                  style={{
                    fontSize: '10px',
                    color: t.textSecondary,
                    marginBottom: '4px',
                  }}
                >
                  [
                  {new Date(chunk.timestamp).toLocaleTimeString('en-US', {
                    hour12: false,
                  })}
                  .{String(chunk.timestamp % 1000).padStart(3, '0')}]
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    fontFamily: 'SFMono-Regular, Consolas, monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: t.text,
                    lineHeight: '1.5',
                  }}
                >
                  {chunk.data}
                </pre>
              </div>
            ))}
          </div>
        ) : mode === 'raw' ? (
          <pre
            style={{
              margin: 0,
              fontSize: '12px',
              fontFamily: 'SFMono-Regular, Consolas, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: t.text,
              lineHeight: '1.5',
            }}
          >
            {safeContent}
          </pre>
        ) : (
          <JsonViewer content={safeContent} t={t} />
        )}
      </div>
    </div>
  );
}

function JsonViewer({ content, t }: { content: string; t: ThemeColors }) {
  const safeContent = content || '';
  if (safeContent.includes('data:')) {
    const chunks = safeContent
      .split(/\n\s*\n/)
      .map((eventBlock, i) => ({
        index: i + 1,
        jsonStr: eventBlock
          .split('\n')
          .filter((line) => line.trim().startsWith('data:'))
          .map((line) => line.trim().substring(5).trim())
          .join(''),
      }))
      .filter((c) => c.jsonStr);
    if (chunks.length > 0) {
      return (
        <div>
          {chunks.map((chunk) => (
            <div
              key={chunk.index}
              style={{
                marginBottom: '12px',
                borderLeft: `2px solid ${t.accent}`,
                paddingLeft: '12px',
                background: t.bgSecondary,
                borderRadius: '0 4px 4px 0',
                padding: '8px 12px',
              }}
            >
              <div
                style={{
                  fontWeight: 'bold',
                  color: t.textSecondary,
                  fontSize: '10px',
                  marginBottom: '4px',
                }}
              >
                CHUNK {chunk.index}
              </div>
              <CodeView data={tryParse(chunk.jsonStr)} t={t} />
            </div>
          ))}
        </div>
      );
    }
  }
  return <CodeView data={tryParse(safeContent)} t={t} />;
}

function tryParse(str: string) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

interface JsonLine {
  text: string;
  foldStart: boolean;
  foldEnd: number; // -1 if not a fold start
  closingBracket: string; // '}' or ']' for fold starts
}

function jsonToLines(data: unknown): JsonLine[] {
  const str =
    typeof data === 'string' && !data.startsWith('{') && !data.startsWith('[')
      ? data
      : JSON.stringify(data, null, 2);
  if (str == null)
    return [
      { text: 'undefined', foldStart: false, foldEnd: -1, closingBracket: '' },
    ];
  const raw = str.split('\n');
  const lines: JsonLine[] = raw.map((text) => ({
    text,
    foldStart: false,
    foldEnd: -1,
    closingBracket: '',
  }));
  // Match opening brackets to closing brackets using a stack
  const stack: Array<{ index: number; bracket: string }> = [];
  for (let i = 0; i < raw.length; i++) {
    const trimmed = raw[i].trimEnd();
    const last = trimmed[trimmed.length - 1];
    if (last === '{' || last === '[') {
      stack.push({ index: i, bracket: last === '{' ? '}' : ']' });
    }
    // Check for closing bracket (with or without trailing comma)
    const stripped = trimmed.replace(/,\s*$/, '');
    const closeChar = stripped[stripped.length - 1];
    if (
      (closeChar === '}' || closeChar === ']') &&
      stack.length > 0 &&
      stack[stack.length - 1].bracket === closeChar
    ) {
      const open = stack.pop()!;
      lines[open.index].foldStart = true;
      lines[open.index].foldEnd = i;
      lines[open.index].closingBracket = open.bracket;
    }
  }
  return lines;
}

// Tokenize a JSON line for syntax highlighting
const TOKEN_RE =
  /("(?:[^"\\]|\\.)*")\s*(?=:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\]:,])/g;

function highlightLine(text: string, t: ThemeColors): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    // Push any unmatched text before this token (whitespace/other)
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [full, key, str, num, bool, nul] = match;
    if (key) {
      parts.push(
        <span key={lastIndex} style={{ color: t.accent, fontWeight: 'bold' }}>
          {full}
        </span>,
      );
    } else if (str) {
      // Unescape JSON string escapes so \n renders as actual newlines.
      // Use JSON.parse to handle all escape sequences correctly in one pass
      // (manual chained .replace() can double-unescape e.g. \\n → \<newline>).
      let unescaped: string;
      try {
        unescaped = JSON.parse(full) as string;
      } catch {
        unescaped = full.slice(1, -1);
      }
      const strLines = unescaped.split('\n');
      if (strLines.length <= 1) {
        parts.push(
          <span key={lastIndex} style={{ color: '#81c995' }}>
            {full}
          </span>,
        );
      } else {
        const indent = ' '.repeat(match.index + 1);
        parts.push(
          <CollapsibleString
            key={lastIndex}
            lines={strLines}
            indent={indent}
            t={t}
          />,
        );
      }
    } else if (num) {
      parts.push(
        <span key={lastIndex} style={{ color: '#ad7fa8' }}>
          {full}
        </span>,
      );
    } else if (bool) {
      parts.push(
        <span key={lastIndex} style={{ color: '#fdd663', fontWeight: 'bold' }}>
          {full}
        </span>,
      );
    } else if (nul) {
      parts.push(
        <span key={lastIndex} style={{ color: '#babdb6', fontWeight: 'bold' }}>
          {full}
        </span>,
      );
    } else {
      // punctuation
      parts.push(<span key={lastIndex}>{full}</span>);
    }
    lastIndex = match.index + full.length;
  }
  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

const STRING_LINE_THRESHOLD = 20;

function CollapsibleString({
  lines,
  indent,
  t,
}: {
  lines: string[];
  indent: string;
  t: ThemeColors;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = lines.length > STRING_LINE_THRESHOLD;
  const displayLines =
    needsTruncation && !expanded
      ? lines.slice(0, STRING_LINE_THRESHOLD)
      : lines;

  return (
    <span style={{ color: '#81c995' }}>
      &quot;{displayLines[0]}
      {displayLines.slice(1).map((sl, si) => (
        <React.Fragment key={si}>
          {'\n'}
          {indent}
          {sl}
        </React.Fragment>
      ))}
      {needsTruncation && (
        <>
          {'\n'}
          {indent}
          <span
            onClick={() => setExpanded(!expanded)}
            style={{
              color: t.accent,
              cursor: 'pointer',
              fontStyle: 'italic',
              userSelect: 'none',
            }}
          >
            {expanded
              ? '▲ collapse'
              : `... ${lines.length - STRING_LINE_THRESHOLD} more lines`}
          </span>
        </>
      )}
      &quot;
    </span>
  );
}

function CodeView({ data, t }: { data: unknown; t: ThemeColors }) {
  const lines = useMemo(() => jsonToLines(data), [data]);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  const toggleFold = (lineIndex: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(lineIndex)) {
        next.delete(lineIndex);
      } else {
        next.add(lineIndex);
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      const sel = window.getSelection();
      if (sel && contentRef.current) {
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(contentRef.current);
        sel.addRange(range);
      }
    }
  };

  // Build visible lines, skipping folded regions
  const visibleLines: Array<{
    index: number;
    content: React.ReactNode;
    foldable: boolean;
    isCollapsed: boolean;
  }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isCollapsed = collapsed.has(i);
    if (line.foldStart && isCollapsed) {
      // Show the opening line with collapsed indicator
      const indent = line.text.match(/^(\s*)/)?.[1] || '';
      const trimmed = line.text.trimStart();
      visibleLines.push({
        index: i,
        content: (
          <>
            {indent.length > 0 && <span>{indent}</span>}
            {highlightLine(trimmed, t)}
            <span style={{ color: t.textSecondary, fontStyle: 'italic' }}>
              {' '}
              ... {line.closingBracket}
            </span>
          </>
        ),
        foldable: true,
        isCollapsed: true,
      });
      // Skip to the line after foldEnd
      i = line.foldEnd + 1;
    } else {
      visibleLines.push({
        index: i,
        content: highlightLine(line.text, t),
        foldable: line.foldStart,
        isCollapsed: false,
      });
      i++;
    }
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      ref={contentRef}
      data-code-view
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 1fr',
        fontFamily:
          'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
        fontSize: '12px',
        lineHeight: '1.5',
        outline: 'none',
      }}
    >
      {visibleLines.map((vl) => (
        <React.Fragment key={vl.index}>
          {/* Gutter cell */}
          <div
            data-gutter
            style={{
              userSelect: 'none',
              textAlign: 'center',
              color: t.textSecondary,
              borderRight: `1px solid ${t.border}`,
              paddingRight: '2px',
              cursor: vl.foldable ? 'pointer' : 'default',
              fontSize: '9px',
              paddingTop: '3px',
            }}
            onClick={vl.foldable ? () => toggleFold(vl.index) : undefined}
          >
            {vl.foldable ? (
              <span className="fold-icon">{vl.isCollapsed ? '▶' : '▼'}</span>
            ) : (
              ''
            )}
          </div>
          {/* Content cell */}
          <div
            style={{
              whiteSpace: 'pre',
              color: t.text,
              paddingLeft: '8px',
              minHeight: '18px',
            }}
          >
            {vl.content}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
