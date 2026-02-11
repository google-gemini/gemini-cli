/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

export type VisualizationKind = 'bar' | 'line' | 'pie' | 'table' | 'diagram';

type PrimitiveCell = string | number | boolean;

export interface VisualizationPoint {
  label: string;
  value: number;
}

export interface VisualizationSeries {
  name: string;
  points: VisualizationPoint[];
}

export interface VisualizationResult {
  type: 'visualization';
  kind: VisualizationKind;
  title?: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  unit?: string;
  data: Record<string, unknown>;
  meta?: {
    truncated: boolean;
    originalItemCount: number;
    validationWarnings?: string[];
  };
}

interface VisualizationResultDisplayProps {
  visualization: VisualizationResult;
  width: number;
}

interface DiagramNode {
  id: string;
  label: string;
  type?: string;
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

interface RenderLine {
  text: string;
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
}

interface VisualizationColorSet {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  palette: string[];
}

const UNICODE_SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const ASCII_SPARK_CHARS = ['.', ':', '-', '=', '+', '*', '#', '@'];

function truncateText(value: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return '';
  }
  if (value.length <= maxWidth) {
    return value;
  }
  if (maxWidth <= 1) {
    return value.slice(0, maxWidth);
  }
  return `${value.slice(0, maxWidth - 1)}…`;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) {
    return value;
  }
  return value + ' '.repeat(width - value.length);
}

function formatValue(value: number, unit?: string): string {
  const rendered = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return unit ? `${rendered}${unit}` : rendered;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function getNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/,/g, ''));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeCell(value: unknown): PrimitiveCell {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return JSON.stringify(value);
}

function makeBar(value: number, max: number, width: number): string {
  const safeMax = max <= 0 ? 1 : max;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const filled = Math.max(0, Math.round(ratio * width));
  const empty = Math.max(0, width - filled);
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
}

function asSeries(data: Record<string, unknown>): VisualizationSeries[] {
  const rawSeries = data['series'];
  if (!Array.isArray(rawSeries)) {
    return [];
  }

  return rawSeries
    .map((raw, idx) => {
      if (!isRecord(raw) || !Array.isArray(raw['points'])) {
        return null;
      }

      const points = raw['points']
        .map((point): VisualizationPoint | null => {
          if (!isRecord(point)) {
            return null;
          }
          if (typeof point['label'] !== 'string') {
            return null;
          }
          if (typeof point['value'] !== 'number') {
            return null;
          }
          return {
            label: point['label'],
            value: point['value'],
          };
        })
        .filter((point): point is VisualizationPoint => point !== null);

      return {
        name:
          typeof raw['name'] === 'string' && raw['name'].trim().length > 0
            ? raw['name']
            : `Series ${idx + 1}`,
        points,
      };
    })
    .filter(
      (series): series is VisualizationSeries =>
        series !== null && series.points.length > 0,
    );
}

function asSlices(
  data: Record<string, unknown>,
): Array<{ label: string; value: number }> {
  const rawSlices = Array.isArray(data['slices']) ? data['slices'] : [];
  return rawSlices
    .map((slice) => {
      if (!isRecord(slice)) {
        return null;
      }
      if (
        typeof slice['label'] !== 'string' ||
        typeof slice['value'] !== 'number'
      ) {
        return null;
      }
      return {
        label: slice['label'],
        value: slice['value'],
      };
    })
    .filter(
      (slice): slice is { label: string; value: number } => slice !== null,
    );
}

function asTable(data: Record<string, unknown>): {
  columns: string[];
  rows: PrimitiveCell[][];
  metricColumns: number[];
} {
  const rawRows = Array.isArray(data['rows']) ? data['rows'] : [];
  const rawColumns = Array.isArray(data['columns']) ? data['columns'] : [];

  const columns = rawColumns.map((column, idx) =>
    getString(column, `Column ${idx + 1}`),
  );
  const rows = rawRows
    .filter((row) => Array.isArray(row) || isRecord(row))
    .map((row) => {
      if (Array.isArray(row)) {
        return row.map((cell) => normalizeCell(cell));
      }

      const record = row;
      const keys = columns.length > 0 ? columns : Object.keys(record);
      return keys.map((key) => normalizeCell(record[key]));
    });

  const inferredColumns =
    columns.length > 0
      ? columns
      : Array.from(
          { length: rows.reduce((max, row) => Math.max(max, row.length), 0) },
          (_, idx) => `Column ${idx + 1}`,
        );

  const explicitMetricColumns = Array.isArray(data['metricColumns'])
    ? data['metricColumns']
        .map((value) => getNumber(value, -1))
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value >= 0 &&
            value < inferredColumns.length,
        )
    : [];

  const autoMetricColumns =
    explicitMetricColumns.length > 0
      ? explicitMetricColumns
      : inferredColumns
          .map((_, index) => index)
          .filter((index) =>
            rows.some((row) => typeof row[index] === 'number'),
          );

  return {
    columns: inferredColumns,
    rows,
    metricColumns: autoMetricColumns,
  };
}

function asDiagram(data: Record<string, unknown>): {
  diagramKind: 'architecture' | 'flowchart';
  direction: 'LR' | 'TB';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
} {
  const diagramKindRaw = getString(data['diagramKind'], 'architecture');
  const diagramKind =
    diagramKindRaw === 'flowchart' ? 'flowchart' : 'architecture';
  const directionRaw = getString(data['direction'], 'LR');
  const direction = directionRaw === 'TB' ? 'TB' : 'LR';

  const rawNodes = Array.isArray(data['nodes']) ? data['nodes'] : [];
  const rawEdges = Array.isArray(data['edges']) ? data['edges'] : [];

  const nodes = rawNodes
    .filter(isRecord)
    .map((node) => ({
      id: getString(node['id'], ''),
      label: getString(node['label'], '(node)'),
      type:
        typeof node['type'] === 'string' && node['type'].trim().length > 0
          ? node['type'].trim()
          : undefined,
    }))
    .filter((node) => node.id.length > 0);

  const edges = rawEdges
    .filter(isRecord)
    .map((edge) => ({
      from: getString(edge['from'], ''),
      to: getString(edge['to'], ''),
      label:
        typeof edge['label'] === 'string' && edge['label'].trim().length > 0
          ? edge['label'].trim()
          : undefined,
    }))
    .filter((edge) => edge.from.length > 0 && edge.to.length > 0);

  return {
    diagramKind,
    direction,
    nodes,
    edges,
  };
}

function uniqueColors(values: string[]): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const value of values) {
    const color = value.trim();
    if (color.length === 0 || seen.has(color)) {
      continue;
    }
    seen.add(color);
    colors.push(color);
  }
  return colors;
}

function buildColorSet(): VisualizationColorSet {
  const gradient =
    Array.isArray(theme.ui.gradient) && theme.ui.gradient.length > 0
      ? theme.ui.gradient
      : [];
  const palette = uniqueColors([
    ...gradient,
    theme.text.link,
    theme.text.accent,
    theme.status.success,
    theme.status.warning,
    theme.status.error,
  ]);

  return {
    primary: theme.text.primary,
    secondary: theme.text.secondary,
    accent: theme.text.accent,
    success: theme.status.success,
    warning: theme.status.warning,
    error: theme.status.error,
    palette: palette.length > 0 ? palette : [theme.text.link],
  };
}

function colorAtPalette(
  palette: string[],
  index: number,
  fallback: string,
): string {
  if (palette.length === 0) {
    return fallback;
  }
  return palette[index % palette.length] ?? fallback;
}

function noDataLine(colors: VisualizationColorSet): RenderLine[] {
  return [{ text: '(no data)', color: colors.secondary, dimColor: true }];
}

function styleTableLines(
  lines: string[],
  colors: VisualizationColorSet,
): RenderLine[] {
  if (lines.length === 1 && lines[0] === '(no data)') {
    return noDataLine(colors);
  }

  return lines.map((text, index) => {
    if (index === 0) {
      return { text, color: colors.accent, bold: true };
    }
    if (index === 1) {
      return { text, color: colors.secondary };
    }
    return {
      text,
      color: colorAtPalette(colors.palette, index - 2, colors.primary),
    };
  });
}

function styleDiagramLines(
  lines: string[],
  colors: VisualizationColorSet,
): RenderLine[] {
  if (lines.length === 1 && lines[0] === '(no data)') {
    return noDataLine(colors);
  }

  let accentIndex = 0;
  return lines.map((text, index) => {
    if (text === 'Notes:') {
      return { text, color: colors.accent, bold: true };
    }
    if (text.startsWith('Kind:')) {
      return { text, color: colors.secondary };
    }
    if (text.includes('->') && text.includes(':')) {
      return { text, color: colors.warning };
    }
    if (text.trim().length === 0) {
      return { text };
    }
    if (
      text.includes('┌') ||
      text.includes('┐') ||
      text.includes('└') ||
      text.includes('┘') ||
      text.includes('│') ||
      text.includes('─') ||
      text.includes('┼') ||
      text.includes('>') ||
      text.includes('v')
    ) {
      return {
        text,
        color: colorAtPalette(colors.palette, accentIndex++, colors.primary),
      };
    }
    return {
      text,
      color: colorAtPalette(colors.palette, index, colors.primary),
    };
  });
}

function renderBarLines(
  series: VisualizationSeries,
  width: number,
  unit?: string,
): string[] {
  const points = series.points;
  if (points.length === 0) {
    return ['(no data)'];
  }

  const labelWidth = Math.max(
    6,
    Math.min(
      Math.floor(width * 0.35),
      points.reduce((m, p) => Math.max(m, p.label.length), 0),
    ),
  );
  const values = points.map((point) => formatValue(point.value, unit));
  const valueWidth = values.reduce(
    (acc, value) => Math.max(acc, value.length),
    0,
  );
  const barWidth = Math.max(6, width - labelWidth - valueWidth - 4);
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return points.map((point, index) => {
    const bar = makeBar(point.value, maxValue, barWidth);
    const label = padRight(truncateText(point.label, labelWidth), labelWidth);
    const value = padRight(values[index], valueWidth);
    return `${label} | ${bar} ${value}`;
  });
}

function downsamplePoints(
  points: VisualizationPoint[],
  targetSize: number,
): VisualizationPoint[] {
  if (points.length <= targetSize || targetSize <= 2) {
    return points;
  }

  const sampled: VisualizationPoint[] = [points[0]];
  const interval = (points.length - 1) / (targetSize - 1);
  for (let i = 1; i < targetSize - 1; i += 1) {
    sampled.push(points[Math.round(i * interval)]);
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

function renderSparkline(
  points: VisualizationPoint[],
  width: number,
  useAscii: boolean,
): string {
  if (points.length === 0) {
    return '';
  }

  const chars = useAscii ? ASCII_SPARK_CHARS : UNICODE_SPARK_CHARS;
  const chartWidth = Math.max(6, width);
  const sampled = downsamplePoints(points, chartWidth);
  const min = Math.min(...sampled.map((point) => point.value));
  const max = Math.max(...sampled.map((point) => point.value));
  const range = max - min;

  return sampled
    .map((point) => {
      if (range === 0) {
        return chars[Math.floor(chars.length / 2)];
      }
      const normalized = (point.value - min) / range;
      const index = Math.round(normalized * (chars.length - 1));
      return chars[index];
    })
    .join('');
}

function renderLineLines(
  series: VisualizationSeries[],
  width: number,
  unit?: string,
): string[] {
  const lines: string[] = [];
  const useAscii = width < 48;

  for (const [index, currentSeries] of series.entries()) {
    const name = currentSeries.name?.trim() || `Series ${index + 1}`;
    const sparklineWidth = Math.max(12, width - name.length - 3);
    const sparkline = renderSparkline(
      currentSeries.points,
      sparklineWidth,
      useAscii,
    );

    const first = currentSeries.points[0];
    const last = currentSeries.points[currentSeries.points.length - 1];
    const summary =
      first && last
        ? ` (${first.label}: ${formatValue(first.value, unit)} -> ${last.label}: ${formatValue(last.value, unit)})`
        : '';

    lines.push(`${name}: ${sparkline}${summary}`);
  }

  return lines;
}

function renderTableLines(
  table: {
    columns: string[];
    rows: PrimitiveCell[][];
    metricColumns: number[];
  },
  width: number,
): string[] {
  if (table.columns.length === 0 || table.rows.length === 0) {
    return ['(no data)'];
  }

  const maxColumns = Math.min(4, table.columns.length);
  const visibleColumns = table.columns.slice(0, maxColumns);
  const barColumn = table.metricColumns.find((index) => index < maxColumns);

  const colWidth = Math.max(
    8,
    Math.floor((width - (maxColumns - 1) * 3) / maxColumns),
  );

  const header = visibleColumns
    .map((column) => padRight(truncateText(column, colWidth), colWidth))
    .join(' | ');
  const separator = '-'.repeat(Math.min(width, header.length));

  let maxMetric = 1;
  if (barColumn !== undefined) {
    maxMetric = Math.max(
      1,
      ...table.rows
        .map((row) =>
          typeof row[barColumn] === 'number' ? Number(row[barColumn]) : 0,
        )
        .filter((value) => Number.isFinite(value)),
    );
  }

  const body = table.rows.map((row) => {
    const cells = visibleColumns.map((_, index) => {
      const raw = row[index];
      return padRight(truncateText(String(raw ?? ''), colWidth), colWidth);
    });

    if (barColumn !== undefined && typeof row[barColumn] === 'number') {
      const metricBar = makeBar(
        Number(row[barColumn]),
        maxMetric,
        Math.max(8, Math.floor(width * 0.18)),
      );
      return `${cells.join(' | ')}  ${metricBar}`;
    }

    return cells.join(' | ');
  });

  return [header, separator, ...body];
}

interface DiagramPlacement {
  node: DiagramNode;
  x: number;
  y: number;
}

function drawCanvasChar(
  canvas: string[][],
  x: number,
  y: number,
  char: string,
): void {
  if (y < 0 || y >= canvas.length || x < 0 || x >= canvas[0].length) {
    return;
  }

  const existing = canvas[y][x];
  if (existing === ' ' || existing === char) {
    canvas[y][x] = char;
    return;
  }

  if (
    (existing === '─' && char === '│') ||
    (existing === '│' && char === '─')
  ) {
    canvas[y][x] = '┼';
    return;
  }

  if (char === '>' || char === 'v') {
    canvas[y][x] = char;
  }
}

function drawHorizontal(
  canvas: string[][],
  y: number,
  startX: number,
  endX: number,
): void {
  const from = Math.min(startX, endX);
  const to = Math.max(startX, endX);
  for (let x = from; x <= to; x += 1) {
    drawCanvasChar(canvas, x, y, '─');
  }
}

function drawVertical(
  canvas: string[][],
  x: number,
  startY: number,
  endY: number,
): void {
  const from = Math.min(startY, endY);
  const to = Math.max(startY, endY);
  for (let y = from; y <= to; y += 1) {
    drawCanvasChar(canvas, x, y, '│');
  }
}

function drawBox(
  canvas: string[][],
  x: number,
  y: number,
  width: number,
  label: string,
): void {
  drawCanvasChar(canvas, x, y, '┌');
  drawCanvasChar(canvas, x + width - 1, y, '┐');
  drawCanvasChar(canvas, x, y + 2, '└');
  drawCanvasChar(canvas, x + width - 1, y + 2, '┘');

  for (let i = 1; i < width - 1; i += 1) {
    drawCanvasChar(canvas, x + i, y, '─');
    drawCanvasChar(canvas, x + i, y + 2, '─');
  }

  drawCanvasChar(canvas, x, y + 1, '│');
  drawCanvasChar(canvas, x + width - 1, y + 1, '│');

  const text = truncateText(label, width - 4);
  const padded = padRight(text, width - 4);
  for (let i = 0; i < padded.length; i += 1) {
    drawCanvasChar(canvas, x + 2 + i, y + 1, padded[i]);
  }
}

function computeNodeRanks(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Map<string, number> {
  const rank = new Map<string, number>();
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of nodes) {
    rank.set(node.id, 0);
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) {
      continue;
    }
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue: string[] = [];
  for (const [id, count] of indegree.entries()) {
    if (count === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) {
      break;
    }
    const baseRank = rank.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, baseRank + 1));
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
      }
    }
  }

  return rank;
}

function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: 'LR' | 'TB',
  widthLimit: number,
): { placements: Map<string, DiagramPlacement>; boxWidth: number } | null {
  const rankByNode = computeNodeRanks(nodes, edges);
  const groups = new Map<number, DiagramNode[]>();
  for (const node of nodes) {
    const rank = rankByNode.get(node.id) ?? 0;
    const group = groups.get(rank) ?? [];
    group.push(node);
    groups.set(rank, group);
  }

  const ranks = Array.from(groups.keys()).sort((a, b) => a - b);
  if (ranks.length === 0) {
    return null;
  }

  const maxLabel = Math.max(...nodes.map((node) => node.label.length), 8);
  const rankCount = ranks.length;
  const maxPerRank = Math.max(
    ...ranks.map((rank) => groups.get(rank)?.length ?? 0),
    1,
  );

  let boxWidth = Math.max(12, Math.min(26, maxLabel + 4));
  let hGap = 6;
  const vGap = 2;
  const boxHeight = 3;

  const estimatedWidth = () => {
    if (direction === 'LR') {
      return rankCount * boxWidth + (rankCount - 1) * hGap;
    }
    return maxPerRank * boxWidth + (maxPerRank - 1) * hGap;
  };

  while (estimatedWidth() > widthLimit && (boxWidth > 10 || hGap > 2)) {
    if (hGap > 2) {
      hGap -= 1;
    } else {
      boxWidth -= 1;
    }
  }

  if (estimatedWidth() > widthLimit) {
    return null;
  }

  const placements = new Map<string, DiagramPlacement>();
  if (direction === 'LR') {
    const maxColumnHeight = Math.max(
      ...ranks.map((rank) => {
        const count = groups.get(rank)?.length ?? 0;
        return count * boxHeight + Math.max(0, count - 1) * vGap;
      }),
    );

    for (const [column, rank] of ranks.entries()) {
      const group = groups.get(rank) ?? [];
      const columnHeight =
        group.length * boxHeight + Math.max(0, group.length - 1) * vGap;
      const startY = Math.floor((maxColumnHeight - columnHeight) / 2);
      for (const [row, node] of group.entries()) {
        placements.set(node.id, {
          node,
          x: column * (boxWidth + hGap),
          y: startY + row * (boxHeight + vGap),
        });
      }
    }
  } else {
    const maxRowWidth = Math.max(
      ...ranks.map((rank) => {
        const count = groups.get(rank)?.length ?? 0;
        return count * boxWidth + Math.max(0, count - 1) * hGap;
      }),
    );

    for (const [rowIndex, rank] of ranks.entries()) {
      const group = groups.get(rank) ?? [];
      const rowWidth =
        group.length * boxWidth + Math.max(0, group.length - 1) * hGap;
      const startX = Math.floor((maxRowWidth - rowWidth) / 2);
      for (const [column, node] of group.entries()) {
        placements.set(node.id, {
          node,
          x: startX + column * (boxWidth + hGap),
          y: rowIndex * (boxHeight + vGap),
        });
      }
    }
  }

  return { placements, boxWidth };
}

function drawDiagramEdge(
  canvas: string[][],
  source: DiagramPlacement,
  target: DiagramPlacement,
  direction: 'LR' | 'TB',
  boxWidth: number,
): void {
  const boxHeight = 3;

  if (direction === 'LR') {
    const sx = source.x + boxWidth;
    const sy = source.y + 1;
    const tx = target.x - 1;
    const ty = target.y + 1;

    const bendX = Math.max(sx + 1, Math.floor((sx + tx) / 2));
    drawHorizontal(canvas, sy, sx, bendX);
    drawVertical(canvas, bendX, sy, ty);
    drawHorizontal(canvas, ty, bendX, tx);
    drawCanvasChar(canvas, tx, ty, '>');
    return;
  }

  const sx = source.x + Math.floor(boxWidth / 2);
  const sy = source.y + boxHeight;
  const tx = target.x + Math.floor(boxWidth / 2);
  const ty = target.y - 1;

  const bendY = Math.max(sy + 1, Math.floor((sy + ty) / 2));
  drawVertical(canvas, sx, sy, bendY);
  drawHorizontal(canvas, bendY, sx, tx);
  drawVertical(canvas, tx, bendY, ty);
  drawCanvasChar(canvas, tx, ty, 'v');
}

function canvasToLines(canvas: string[][]): string[] {
  const rendered = canvas.map((row) => row.join('').replace(/\s+$/g, ''));
  while (rendered.length > 0 && rendered[0].trim().length === 0) {
    rendered.shift();
  }
  while (
    rendered.length > 0 &&
    rendered[rendered.length - 1].trim().length === 0
  ) {
    rendered.pop();
  }
  return rendered.length > 0 ? rendered : ['(no data)'];
}

function renderDiagramLines(
  diagram: {
    diagramKind: 'architecture' | 'flowchart';
    direction: 'LR' | 'TB';
    nodes: DiagramNode[];
    edges: DiagramEdge[];
  },
  width: number,
): string[] {
  if (diagram.nodes.length === 0) {
    return ['(no data)'];
  }

  const layout = layoutDiagram(
    diagram.nodes,
    diagram.edges,
    diagram.direction,
    Math.max(30, width - 1),
  );
  if (!layout) {
    const nodeMap = new Map(diagram.nodes.map((node) => [node.id, node]));
    const fallbackEdges =
      diagram.edges.length === 0
        ? ['(no connections)']
        : diagram.edges.map((edge) => {
            const from = nodeMap.get(edge.from)?.label ?? edge.from;
            const to = nodeMap.get(edge.to)?.label ?? edge.to;
            return `[${from}] -> [${to}]${edge.label ? ` (${edge.label})` : ''}`;
          });
    return [
      ...fallbackEdges,
      `Kind: ${diagram.diagramKind} | Direction: ${diagram.direction} | Layout: fallback`,
    ];
  }

  const placements = Array.from(layout.placements.values());
  const canvasWidth =
    Math.max(...placements.map((item) => item.x + layout.boxWidth)) + 2;
  const canvasHeight = Math.max(...placements.map((item) => item.y + 3)) + 2;
  const canvas = Array.from({ length: canvasHeight }, () =>
    Array.from({ length: canvasWidth }, () => ' '),
  );

  for (const placement of placements) {
    const descriptor = placement.node.type
      ? `${placement.node.label} «${placement.node.type}»`
      : placement.node.label;
    drawBox(canvas, placement.x, placement.y, layout.boxWidth, descriptor);
  }

  for (const edge of diagram.edges) {
    const source = layout.placements.get(edge.from);
    const target = layout.placements.get(edge.to);
    if (!source || !target) {
      continue;
    }
    drawDiagramEdge(canvas, source, target, diagram.direction, layout.boxWidth);
  }

  const lines: string[] = canvasToLines(canvas);
  const labeledEdges = diagram.edges.filter((edge) => edge.label);
  if (labeledEdges.length > 0) {
    const nodeMap = new Map(diagram.nodes.map((node) => [node.id, node]));
    lines.push('Notes:');
    for (const edge of labeledEdges) {
      const from = nodeMap.get(edge.from)?.label ?? edge.from;
      const to = nodeMap.get(edge.to)?.label ?? edge.to;
      lines.push(`${from} -> ${to}: ${edge.label}`);
    }
  }

  lines.push(`Kind: ${diagram.diagramKind} | Direction: ${diagram.direction}`);
  return lines;
}

function buildKindLines(
  visualization: VisualizationResult,
  width: number,
  colors: VisualizationColorSet,
): RenderLine[] {
  if (!isRecord(visualization.data)) {
    return [{ text: '(invalid visualization data)', color: colors.error }];
  }

  switch (visualization.kind) {
    case 'bar': {
      const series = asSeries(visualization.data);
      if (series.length === 0) {
        return noDataLine(colors);
      }
      return renderBarLines(series[0], width, visualization.unit).map(
        (text, index) => ({
          text,
          color: colorAtPalette(colors.palette, index, colors.primary),
        }),
      );
    }
    case 'line': {
      const series = asSeries(visualization.data);
      if (series.length === 0) {
        return noDataLine(colors);
      }
      return renderLineLines(series, width, visualization.unit).map(
        (text, index) => ({
          text,
          color: colorAtPalette(colors.palette, index, colors.primary),
        }),
      );
    }
    case 'pie': {
      const slices = asSlices(visualization.data);
      if (slices.length === 0) {
        return noDataLine(colors);
      }
      const total = slices.reduce((sum, slice) => sum + slice.value, 0);
      const rows = slices.map((slice) => {
        const pct =
          total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
        return [
          slice.label,
          `${formatValue(slice.value, visualization.unit)} (${pct}%)`,
        ];
      });
      return styleTableLines(
        renderTableLines(
          { columns: ['Slice', 'Share'], rows, metricColumns: [] },
          width,
        ),
        colors,
      );
    }
    case 'table': {
      return styleTableLines(
        renderTableLines(asTable(visualization.data), width),
        colors,
      );
    }
    case 'diagram': {
      return styleDiagramLines(
        renderDiagramLines(asDiagram(visualization.data), width),
        colors,
      );
    }
    default:
      return [{ text: 'Unsupported visualization kind', color: colors.error }];
  }
}

export const VisualizationResultDisplay = ({
  visualization,
  width,
}: VisualizationResultDisplayProps) => {
  const chartWidth = Math.max(20, width);
  const colors = buildColorSet();
  const lines = buildKindLines(visualization, chartWidth, colors);

  return (
    <Box flexDirection="column" width={chartWidth}>
      {visualization.title && (
        <Text bold color={colorAtPalette(colors.palette, 0, theme.text.link)}>
          {visualization.title}
        </Text>
      )}
      {visualization.subtitle && (
        <Text color={colors.secondary}>{visualization.subtitle}</Text>
      )}
      {lines.map((line, index) => (
        <Text
          key={`${index}-${line.text.slice(0, 24)}`}
          color={line.color ?? colors.primary}
          bold={line.bold}
          dimColor={line.dimColor}
        >
          {line.text}
        </Text>
      ))}
      {(visualization.xLabel || visualization.yLabel) && (
        <Text dimColor>
          {visualization.xLabel ? `x: ${visualization.xLabel}` : ''}
          {visualization.xLabel && visualization.yLabel ? ' | ' : ''}
          {visualization.yLabel ? `y: ${visualization.yLabel}` : ''}
        </Text>
      )}
      {visualization.meta?.truncated && (
        <Text dimColor>
          Showing truncated data ({visualization.meta.originalItemCount}{' '}
          original items)
        </Text>
      )}
      {Array.isArray(visualization.meta?.validationWarnings) &&
        visualization.meta.validationWarnings.length > 0 && (
          <Text dimColor>
            Warnings: {visualization.meta.validationWarnings.join('; ')}
          </Text>
        )}
    </Box>
  );
};
