/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDevToolsData, type ConsoleLog, type NetworkLog } from './hooks';

type ThemeMode = 'system' | 'light' | 'dark';

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
  const { networkLogs, consoleLogs } = useDevToolsData();
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
    return (localStorage.getItem('devtools-theme') as ThemeMode) || 'system';
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

  const isDark = themeMode === 'system' ? systemIsDark : themeMode === 'dark';

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
      warnBg: isDark ? '#302a10' : '#fffce0',
    }),
    [isDark],
  );

  const cycleTheme = () => {
    const modes: ThemeMode[] = ['system', 'light', 'dark'];
    const nextIndex = (modes.indexOf(themeMode) + 1) % modes.length;
    const nextMode = modes[nextIndex];
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
                id: payload.id || Math.random().toString(36).substr(2, 9),
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
          </div>

          <button
            onClick={cycleTheme}
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
            title={`Current: ${themeMode}. Click to cycle.`}
          >
            {themeMode === 'system'
              ? '💻'
              : themeMode === 'light'
                ? '☀️'
                : '🌙'}
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
          <BodyView content={log.response?.body} t={t} />
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

function BodyView({ content, t }: { content?: string; t: ThemeColors }) {
  const [mode, setMode] = useState<'json' | 'raw'>('json');
  const safeContent = content || '';
  if (!safeContent)
    return (
      <div
        style={{ padding: '40px', color: t.textSecondary, textAlign: 'center' }}
      >
        (No content)
      </div>
    );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '6px 12px',
          background: t.bgSecondary,
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
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
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {mode === 'raw' ? (
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
      .split('\n')
      .filter((l) => l.trim().startsWith('data:'))
      .map((l, i) => ({ index: i + 1, jsonStr: l.trim().substring(5).trim() }))
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
              <JsonNode data={tryParse(chunk.jsonStr)} t={t} />
            </div>
          ))}
        </div>
      );
    }
  }
  return <JsonNode data={tryParse(safeContent)} t={t} />;
}

function tryParse(str: string) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function JsonNode({ data, t }: { data: unknown; t: ThemeColors }) {
  const [collapsed, setCollapsed] = useState(false);
  if (data === null)
    return <span style={{ color: '#babdb6', fontWeight: 'bold' }}>null</span>;
  if (typeof data === 'boolean')
    return (
      <span style={{ color: '#fdd663', fontWeight: 'bold' }}>
        {String(data)}
      </span>
    );
  if (typeof data === 'number')
    return <span style={{ color: '#ad7fa8' }}>{data}</span>;
  if (typeof data === 'string')
    return (
      <span style={{ color: '#81c995', whiteSpace: 'pre-wrap' }}>
        &quot;{data}&quot;
      </span>
    );
  if (typeof data === 'object' && data !== null) {
    const isArray = Array.isArray(data);
    const keys = Object.keys(data as object);
    if (keys.length === 0) return <span>{isArray ? '[]' : '{}'}</span>;
    return (
      <span style={{ position: 'relative' }}>
        <span
          onClick={() => setCollapsed(!collapsed)}
          style={{
            cursor: 'pointer',
            fontSize: '10px',
            color: t.textSecondary,
            marginRight: '4px',
          }}
        >
          {collapsed ? '▶' : '▼'}
        </span>
        {isArray ? '[' : '{'}
        {!collapsed && (
          <ul style={{ listStyle: 'none', paddingLeft: '20px', margin: 0 }}>
            {keys.map((key, i) => (
              <li key={key} style={{ padding: '1px 0' }}>
                {!isArray && (
                  <span style={{ color: t.accent, fontWeight: 'bold' }}>
                    &quot;{key}&quot;
                  </span>
                )}
                {!isArray && ': '}
                <JsonNode data={(data as Record<string, unknown>)[key]} t={t} />
                {i < keys.length - 1 && ','}
              </li>
            ))}
          </ul>
        )}
        {collapsed && (
          <span
            style={{
              color: t.textSecondary,
              fontStyle: 'italic',
              fontSize: '11px',
            }}
          >
            ...
          </span>
        )}
        {isArray ? ']' : '}'}
      </span>
    );
  }
  return <span>{String(data)}</span>;
}
