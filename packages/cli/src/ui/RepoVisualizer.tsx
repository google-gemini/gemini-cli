/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RepoVisualizer.tsx
 * packages/cli/src/ui/RepoVisualizer.tsx
 *
 * Terminal UI built with Ink (Box + Text only, no HTML/CSS).
 *
 * Keyboard controls:
 *   ↑ / k        move cursor up
 *   ↓ / j        move cursor down
 *   → / l / ↵    expand directory
 *   ← / h        collapse directory
 *   Space        toggle expand/collapse
 *   /            open search
 *   Esc          close search / clear
 *   e            expand all
 *   c            collapse all
 *   g            jump to top
 *   G            jump to bottom
 *   q / Ctrl+C   quit
 */

import { useState, useEffect, useMemo, useCallback, type FC } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { buildTree } from '../utils/buildTree.js';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface RepoMeta {
  commits?: number;
  contributors?: number;
}

export interface FileNode {
  name: string;
  type: 'file' | 'dir';
  size?: string;
  lang?: string;
  meta?: RepoMeta;
  children?: FileNode[];
}

interface FlatNode extends FileNode {
  depth: number;
  path: string;
  id: string;
}

interface NodeCount {
  files: number;
  dirs: number;
}

export interface RepoVisualizerProps {
  repoPath?: string;
  repoData?: FileNode;
}

// ─────────────────────────────────────────────
// Language colours (Ink named colours)
// ─────────────────────────────────────────────

const LANG_COLOR: Record<string, string> = {
  ts: 'blueBright',
  tsx: 'blueBright',
  js: 'yellow',
  jsx: 'yellow',
  json: 'cyan',
  yaml: 'red',
  yml: 'red',
  md: 'cyanBright',
  mdx: 'cyanBright',
  css: 'magenta',
  html: 'redBright',
  py: 'blue',
  go: 'cyanBright',
  rs: 'yellowBright',
  sh: 'green',
  txt: 'gray',
  env: 'yellowBright',
  default: 'gray',
};

const lc = (lang?: string): string =>
  LANG_COLOR[lang ?? ''] ?? LANG_COLOR['default'];

const LANG_BADGE: Record<string, string> = {
  ts: 'TS',
  tsx: 'TX',
  js: 'JS',
  jsx: 'JX',
  json: '{}',
  yaml: 'YM',
  yml: 'YM',
  md: 'MD',
  mdx: 'MD',
  css: 'CS',
  html: 'HT',
  py: 'PY',
  go: 'GO',
  rs: 'RS',
  sh: 'SH',
  txt: 'TX',
  env: 'EN',
  default: '  ',
};

const lb = (lang?: string): string =>
  LANG_BADGE[lang ?? ''] ?? LANG_BADGE['default'];

// ─────────────────────────────────────────────
// Helpers (exported for tests)
// ─────────────────────────────────────────────

export function flattenTree(
  node: FileNode,
  depth = 0,
  parent = '',
): FlatNode[] {
  const path = parent ? `${parent}/${node.name}` : node.name;
  const id = encodeURIComponent(path);
  const result: FlatNode[] = [{ ...node, depth, path, id }];
  if (node.type === 'dir' && node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child, depth + 1, path));
    }
  }
  return result;
}

export function countNodes(node: FileNode): NodeCount {
  if (node.type === 'file') return { files: 1, dirs: 0 };
  return (node.children ?? []).reduce<NodeCount>(
    (acc, c) => {
      const r = countNodes(c);
      return { files: acc.files + r.files, dirs: acc.dirs + r.dirs };
    },
    { files: 0, dirs: 1 },
  );
}

function getDirPaths(node: FileNode, parent = ''): string[] {
  const path = parent ? `${parent}/${node.name}` : node.name;
  if (node.type !== 'dir') return [];
  return [path, ...(node.children ?? []).flatMap((c) => getDirPaths(c, path))];
}

function isAncestorOpen(path: string, open: Set<string>): boolean {
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i++) {
    if (!open.has(parts.slice(0, i).join('/'))) return false;
  }
  return true;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

// ─────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────

const Divider: FC<{ width: number; label?: string; color?: string }> = ({
  width,
  label,
  color = 'gray',
}) => {
  if (!label) {
    return <Text color={color}>{'─'.repeat(width)}</Text>;
  }
  const side = Math.max(0, Math.floor((width - label.length - 2) / 2));
  const right = Math.max(0, width - side - label.length - 2);
  return (
    <Text color={color}>
      {'─'.repeat(side)} {label} {'─'.repeat(right)}
    </Text>
  );
};

// ─────────────────────────────────────────────
// Key help bar
// ─────────────────────────────────────────────

interface KeyHelpProps {
  searching: boolean;
  hasSearch: boolean;
}

const KeyHelp: FC<KeyHelpProps> = ({ searching, hasSearch }) => {
  const keys = searching
    ? [
        ['type', 'filter'],
        ['Esc', 'clear'],
        ['↵', 'confirm'],
      ]
    : [
        ['↑↓/jk', 'move'],
        ['→←', 'open/close'],
        ['/', 'search'],
        ['e', 'expand all'],
        ['c', 'collapse all'],
        ['g/G', 'top/bot'],
        ['q', 'quit'],
      ];

  return (
    <Box gap={2} flexShrink={0} paddingX={1}>
      {keys.map(([key, label]) => (
        <Box key={key} gap={1}>
          <Text color="cyanBright" bold>
            {key}
          </Text>
          <Text dimColor>{label}</Text>
        </Box>
      ))}
      {!searching && hasSearch && (
        <Box gap={1}>
          <Text color="yellow" bold>
            Esc
          </Text>
          <Text dimColor>clear search</Text>
        </Box>
      )}
    </Box>
  );
};

// ─────────────────────────────────────────────
// Search bar
// ─────────────────────────────────────────────

interface SearchBarProps {
  value: string;
  active: boolean;
  resultCount: number;
  totalFiles: number;
  width: number;
}

const SearchBar: FC<SearchBarProps> = ({
  value,
  active,
  resultCount,
  totalFiles,
  width,
}) => {
  const label = active ? '🔍 SEARCH' : value ? '🔍 FILTER' : '🔍';
  const cursor = active ? '█' : '';
  const display = value
    ? value + cursor
    : active
      ? cursor
      : 'press / to search';
  const right = value
    ? `${resultCount}/${totalFiles} files`
    : `${totalFiles} files total`;

  const inner = width - 4; // account for borders and padding
  const rightW = right.length;
  const leftW = inner - rightW - 1;
  const leftStr = `${label}  ${display}`;

  return (
    <Box
      borderStyle="round"
      borderColor={active ? 'cyanBright' : value ? 'yellow' : 'gray'}
      paddingX={1}
      flexShrink={0}
    >
      <Text
        color={active ? 'white' : value ? 'yellow' : 'gray'}
        wrap="truncate"
      >
        {truncate(leftStr, leftW)}
        {' '.repeat(Math.max(1, leftW - leftStr.length + 1))}
        <Text dimColor>{right}</Text>
      </Text>
    </Box>
  );
};

// ─────────────────────────────────────────────
// Tree row
// ─────────────────────────────────────────────

interface TreeRowProps {
  node: FlatNode;
  isSelected: boolean;
  isOpen: boolean;
  isFiltered: boolean;
  width: number;
}

const TreeRow: FC<TreeRowProps> = ({
  node,
  isSelected,
  isOpen,
  isFiltered,
  width,
}) => {
  const indent = isFiltered ? 0 : node.depth * 2;
  const chevron =
    node.type === 'dir' ? (isOpen ? '▾ ' : '▸ ') : `${lb(node.lang)} `;

  const nameColor = isSelected
    ? 'black'
    : node.type === 'dir'
      ? 'blueBright'
      : lc(node.lang);

  const suffix =
    node.type === 'dir' && node.children
      ? `  (${node.children.length})`
      : node.size
        ? `  ${node.size}`
        : '';

  const available = width - indent - 2 - suffix.length;
  const name = truncate(node.name, available);

  const line = padEnd(' '.repeat(indent) + chevron + name + suffix, width);

  return (
    <Box>
      <Text
        color={isSelected ? undefined : nameColor}
        bold={node.type === 'dir'}
        inverse={isSelected}
        wrap="truncate"
      >
        {line}
      </Text>
    </Box>
  );
};

// ─────────────────────────────────────────────
// Detail panel
// ─────────────────────────────────────────────

interface DetailPanelProps {
  node: FlatNode;
  width: number;
}

const DetailPanel: FC<DetailPanelProps> = ({ node, width }) => {
  const stats = countNodes(node);
  const color = lc(node.lang);
  const w = width - 2; // minus border

  const statItems: Array<{ label: string; value: string }> = [
    { label: 'TYPE', value: node.type === 'dir' ? 'directory' : 'file' },
    ...(node.size ? [{ label: 'SIZE', value: node.size }] : []),
    ...(node.lang ? [{ label: 'LANG', value: node.lang.toUpperCase() }] : []),
    ...(node.type === 'dir'
      ? [
          { label: 'ITEMS', value: String(node.children?.length ?? 0) },
          { label: 'FILES', value: String(stats.files) },
          { label: 'SUBDIRS', value: String(Math.max(0, stats.dirs - 1)) },
        ]
      : []),
    { label: 'DEPTH', value: `L${node.depth}` },
  ];

  // Children preview rows: fill remaining height roughly
  const previewItems = (node.type === 'dir' ? (node.children ?? []) : []).slice(
    0,
    12,
  );

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      flexGrow={1}
      overflow="hidden"
    >
      {/* ── File/dir header ── */}
      <Box gap={1} marginBottom={0}>
        <Text>{node.type === 'dir' ? '📁' : '📄'}</Text>
        <Text
          color={node.type === 'dir' ? 'blueBright' : color}
          bold
          wrap="truncate"
        >
          {node.name}
        </Text>
      </Box>

      {/* ── Full path ── */}
      <Box marginBottom={1}>
        <Text dimColor wrap="truncate">
          {truncate(node.path, w - 2)}
        </Text>
      </Box>

      <Divider width={w} label="stats" color="gray" />

      {/* ── Stats ── */}
      <Box flexWrap="wrap" gap={2} marginY={1}>
        {statItems.map(({ label, value }) => (
          <Box key={label} flexDirection="column" minWidth={10}>
            <Text dimColor>{label}</Text>
            <Text color="cyanBright" bold>
              {value}
            </Text>
          </Box>
        ))}
      </Box>

      {/* ── Children ── */}
      {previewItems.length > 0 && (
        <>
          <Divider
            width={w}
            label={`contents (${node.children?.length ?? 0})`}
            color="gray"
          />
          <Box flexDirection="column" marginTop={1}>
            {previewItems.map((child) => {
              const childColor =
                child.type === 'dir' ? 'blueBright' : lc(child.lang);
              const badge = child.type === 'dir' ? '▸ ' : `${lb(child.lang)} `;
              const meta =
                child.type === 'dir' && child.children
                  ? ` (${child.children.length})`
                  : child.size
                    ? ` ${child.size}`
                    : '';
              return (
                <Box key={child.name} gap={0}>
                  <Text
                    color={childColor}
                    bold={child.type === 'dir'}
                    wrap="truncate"
                  >
                    {badge}
                    {truncate(child.name, w - 12)}
                    {meta}
                  </Text>
                </Box>
              );
            })}
            {(node.children?.length ?? 0) > 12 && (
              <Text dimColor> … {(node.children?.length ?? 0) - 12} more</Text>
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

// ─────────────────────────────────────────────
// Lang legend bar
// ─────────────────────────────────────────────

interface LegendProps {
  nodes: FlatNode[];
}

const LangLegend: FC<LegendProps> = ({ nodes }) => {
  const counts: Record<string, number> = {};
  for (const n of nodes) {
    if (n.type === 'file' && n.lang) {
      counts[n.lang] = (counts[n.lang] ?? 0) + 1;
    }
  }
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!entries.length) return null;

  return (
    <Box gap={2} paddingX={1} flexShrink={0}>
      {entries.map(([lang, count]) => (
        <Box key={lang} gap={1}>
          <Text color={lc(lang)} bold>
            {lang.toUpperCase()}
          </Text>
          <Text dimColor>{count}</Text>
        </Box>
      ))}
    </Box>
  );
};

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

const RepoVisualizer: FC<RepoVisualizerProps> = ({
  repoPath,
  repoData: repoProp,
}) => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [termCols, setTermCols] = useState(stdout?.columns ?? 120);
  const [termRows, setTermRows] = useState(stdout?.rows ?? 30);

  const handleResize = useCallback(() => {
    setTermCols(stdout?.columns ?? 120);
    setTermRows(stdout?.rows ?? 30);
  }, [stdout]);

  useEffect(() => {
    if (!stdout) return;
    stdout.on('resize', handleResize);
    // Re-read immediately in case terminal was resized before mount
    handleResize();
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout, handleResize]);

  // ── Data ────────────────────────────────────────────────────────────

  const [repo, setRepo] = useState<FileNode | null>(repoProp ?? null);
  const [loading, setLoading] = useState(!repoProp);
  const [error, setError] = useState<string | null>(null);

  // ── UI ──────────────────────────────────────────────────────────────

  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set());
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (repoProp) {
      setRepo(repoProp);
      setLoading(false);
      return;
    }
    if (!repoPath) {
      setError('No path provided.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    buildTree(repoPath)
      .then((tree: FileNode) => {
        if (!cancelled) {
          setRepo(tree);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, repoProp]);

  // ── Seed open dirs ──────────────────────────────────────────────────

  const dirPaths = useMemo(() => (repo ? getDirPaths(repo) : []), [repo]);

  useEffect(() => {
    if (!repo) return;
    setOpenDirs(new Set(dirPaths.filter((p) => p.split('/').length <= 3)));
  }, [repo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ─────────────────────────────────────────────────────────

  const allNodes = useMemo(() => (repo ? flattenTree(repo) : []), [repo]);
  const fileNodes = useMemo(
    () => allNodes.filter((n) => n.type === 'file'),
    [allNodes],
  );

  const visibleNodes = useMemo<FlatNode[]>(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return allNodes.filter(
        (n) =>
          n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q),
      );
    }
    return allNodes.filter(
      (n) => n.depth === 0 || isAncestorOpen(n.path, openDirs),
    );
  }, [allNodes, openDirs, search]);

  const stats = useMemo(
    () => (repo ? countNodes(repo) : { files: 0, dirs: 0 }),
    [repo],
  );
  const selectedNode = visibleNodes[selectedIdx] ?? null;

  // ── Layout: adaptive tree height ────────────────────────────────────
  //
  //   Total rows  = termRows
  //   Fixed rows  = header(3) + searchbar(3) + keyhints(1) + legend(1) + status(1) = 9
  //   Tree height = min(visibleNodes.length, termRows - 9)
  //   But never less than 5

  const FIXED_ROWS = 9;
  const SIDEBAR_W = Math.max(32, Math.min(52, Math.floor(termCols * 0.4)));
  const DETAIL_W = termCols - SIDEBAR_W - 1; // -1 for border
  const TREE_H = Math.max(
    5,
    Math.min(visibleNodes.length, termRows - FIXED_ROWS),
  );

  // ── Keep cursor in bounds ────────────────────────────────────────────

  useEffect(() => {
    if (visibleNodes.length > 0 && selectedIdx >= visibleNodes.length) {
      setSelectedIdx(visibleNodes.length - 1);
    }
  }, [visibleNodes.length, selectedIdx]);

  // ── Scroll window tracking ───────────────────────────────────────────

  useEffect(() => {
    if (selectedIdx < scrollOffset) {
      setScrollOffset(selectedIdx);
    } else if (selectedIdx >= scrollOffset + TREE_H) {
      setScrollOffset(selectedIdx - TREE_H + 1);
    }
  }, [selectedIdx, TREE_H, scrollOffset]);

  // ── Keyboard ─────────────────────────────────────────────────────────

  useInput((input, key) => {
    // ── Search mode ──
    if (searching) {
      if (key.escape) {
        setSearching(false);
        setSearch('');
        setSelectedIdx(0);
        return;
      }
      if (key.return) {
        setSearching(false);
        return;
      }
      if (key.backspace || key.delete) {
        setSearch((s) => s.slice(0, -1));
        setSelectedIdx(0);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearch((s) => s + input);
        setSelectedIdx(0);
        return;
      }
      return;
    }

    // ── Normal mode ──

    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    if (input === '/') {
      setSearching(true);
      return;
    }

    // Clear search with Esc
    if (key.escape && search) {
      setSearch('');
      setSelectedIdx(0);
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx((i) => Math.min(visibleNodes.length - 1, i + 1));
      return;
    }
    if (key.pageUp) {
      setSelectedIdx((i) => Math.max(0, i - TREE_H));
      return;
    }
    if (key.pageDown) {
      setSelectedIdx((i) => Math.min(visibleNodes.length - 1, i + TREE_H));
      return;
    }
    if (input === 'g') {
      setSelectedIdx(0);
      return;
    }
    if (input === 'G') {
      setSelectedIdx(visibleNodes.length - 1);
      return;
    }

    // Expand with → or l or Enter
    if (
      (key.rightArrow || input === 'l' || key.return) &&
      selectedNode?.type === 'dir' &&
      !openDirs.has(selectedNode.path)
    ) {
      setOpenDirs((prev) => new Set([...prev, selectedNode.path]));
      return;
    }

    // Collapse with ← or h
    if ((key.leftArrow || input === 'h') && selectedNode?.type === 'dir') {
      setOpenDirs((prev) => {
        const next = new Set(prev);
        next.delete(selectedNode.path);
        return next;
      });
      return;
    }

    // Toggle with Space
    if (input === ' ' && selectedNode?.type === 'dir') {
      const p = selectedNode.path;
      setOpenDirs((prev) => {
        const next = new Set(prev);
        next.has(p) ? next.delete(p) : next.add(p);
        return next;
      });
      return;
    }

    // Expand / collapse all
    if (input === 'e') {
      setOpenDirs(new Set(dirPaths));
      return;
    }
    if (input === 'c') {
      if (repo) setOpenDirs(new Set([repo.name]));
      return;
    }
  });

  // ── Windowed slice ───────────────────────────────────────────────────

  const windowedNodes = visibleNodes.slice(scrollOffset, scrollOffset + TREE_H);

  // ── Scroll indicator ─────────────────────────────────────────────────

  const scrollPct =
    visibleNodes.length > TREE_H
      ? Math.round((scrollOffset / (visibleNodes.length - TREE_H)) * 100)
      : 100;

  // ── Guards ───────────────────────────────────────────────────────────

  if (loading)
    return (
      <Box
        height={termRows}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="blue" bold>
          ◌ scanning repository…
        </Text>
        <Box marginTop={1}>
          <Text dimColor>{repoPath}</Text>
        </Box>
      </Box>
    );

  if (error || !repo)
    return (
      <Box
        height={termRows}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="red" bold>
          ✖ Failed to load repository
        </Text>
        <Box marginTop={1}>
          <Text color="red" dimColor>
            {error ?? 'Unknown error'}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press q to quit</Text>
        </Box>
      </Box>
    );

  // ── Full render ──────────────────────────────────────────────────────

  return (
    <Box flexDirection="column">
      {/* ══ HEADER ══════════════════════════════════════════════════════ */}
      <Box justifyContent="space-between" paddingX={1} flexShrink={0}>
        <Box gap={2} alignItems="center">
          <Text color="blueBright" bold>
            ◈ {repo.name}
          </Text>
          <Text color="greenBright">●</Text>
          <Text dimColor>repository visualizer</Text>
        </Box>
        <Box gap={3} alignItems="center">
          <Text>
            <Text color="cyanBright" bold>
              {stats.files}
            </Text>
            <Text dimColor> files </Text>
            <Text color="cyanBright" bold>
              {stats.dirs}
            </Text>
            <Text dimColor> dirs</Text>
          </Text>
          {repo.meta?.commits && (
            <Text>
              <Text color="cyanBright" bold>
                {repo.meta.commits}
              </Text>
              <Text dimColor> commits</Text>
            </Text>
          )}
        </Box>
      </Box>

      <Divider width={termCols} color="gray" />

      {/* ══ SEARCH BAR ══════════════════════════════════════════════════ */}
      <SearchBar
        value={search}
        active={searching}
        resultCount={visibleNodes.length}
        totalFiles={fileNodes.length}
        width={termCols}
      />

      {/* ══ BODY ════════════════════════════════════════════════════════ */}
      <Box flexDirection="row" flexShrink={0}>
        {/* ── TREE SIDEBAR ── */}
        <Box
          flexDirection="column"
          width={SIDEBAR_W}
          flexShrink={0}
          overflow="hidden"
          borderStyle="round"
          borderColor="gray"
        >
          {/* Column header */}
          <Box
            paddingX={1}
            justifyContent="space-between"
            borderStyle="single"
            borderColor="gray"
            flexShrink={0}
          >
            <Text dimColor bold>
              NAME
            </Text>
            <Text dimColor bold>
              SIZE
            </Text>
          </Box>

          {/* Tree rows */}
          {windowedNodes.map((node, i) => (
            <TreeRow
              key={node.id}
              node={node}
              isSelected={scrollOffset + i === selectedIdx}
              isOpen={openDirs.has(node.path)}
              isFiltered={search.trim().length > 0}
              width={SIDEBAR_W - 2}
            />
          ))}

          {/* Pad empty rows to keep height stable */}
          {Array.from({
            length: Math.max(0, TREE_H - windowedNodes.length),
          }).map((_, i) => (
            <Box key={`pad-${i}`}>
              <Text> </Text>
            </Box>
          ))}

          {/* Scroll indicator */}
          <Box
            justifyContent="space-between"
            paddingX={1}
            flexShrink={0}
            borderStyle="single"
            borderColor="gray"
          >
            <Text dimColor>
              {selectedIdx + 1}/{visibleNodes.length}
            </Text>
            <Text dimColor>
              {visibleNodes.length > TREE_H ? `${scrollPct}%` : 'END'}
            </Text>
          </Box>
        </Box>

        {/* ── DETAIL PANEL ── */}
        <Box
          flexDirection="column"
          width={DETAIL_W}
          flexShrink={0}
          overflow="hidden"
          borderStyle="round"
          borderColor="gray"
        >
          {/* Panel header */}
          <Box
            paddingX={1}
            borderStyle="single"
            borderColor="gray"
            flexShrink={0}
          >
            <Text dimColor bold>
              {selectedNode
                ? selectedNode.type === 'dir'
                  ? '📁 DIRECTORY'
                  : '📄 FILE'
                : 'DETAILS'}
            </Text>
          </Box>

          {selectedNode ? (
            <DetailPanel node={selectedNode} width={DETAIL_W} />
          ) : (
            <Box
              flexGrow={1}
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
              gap={1}
            >
              <Text dimColor bold>
                No selection
              </Text>
              <Text dimColor>Use ↑↓ or j/k to navigate the tree</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* ══ LANG LEGEND ═════════════════════════════════════════════════ */}
      <Divider width={termCols} color="gray" />
      <LangLegend nodes={allNodes} />

      {/* ══ KEYBINDING HINT BAR ═════════════════════════════════════════ */}
      <Divider width={termCols} color="gray" />
      <KeyHelp searching={searching} hasSearch={search.length > 0} />

      {/* ══ STATUS BAR ══════════════════════════════════════════════════ */}
      <Divider width={termCols} color="gray" />
      <Box paddingX={1} gap={3} flexShrink={0}>
        <Box gap={1}>
          <Text color="greenBright">●</Text>
          <Text dimColor>{visibleNodes.length} visible</Text>
        </Box>
        <Box gap={1}>
          <Text color="blueBright">●</Text>
          <Text dimColor>{openDirs.size} expanded</Text>
        </Box>
        {search && (
          <Box gap={1}>
            <Text color="yellow">●</Text>
            <Text dimColor>
              {'no matches for "'}
              {search}
              {'"'}
            </Text>
          </Box>
        )}
        {selectedNode && (
          <Box gap={1} flexShrink={1} overflow="hidden">
            <Text color="magenta">●</Text>
            <Text dimColor wrap="truncate">
              {truncate(selectedNode.path, termCols - 40)}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export { RepoVisualizer };
