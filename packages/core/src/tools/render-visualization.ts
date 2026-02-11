/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  DIAGRAM_KINDS,
  Kind,
  VISUALIZATION_KINDS,
  type DiagramEdge,
  type DiagramNode,
  type ToolInvocation,
  type ToolResult,
  type VisualizationData,
  type VisualizationDisplay,
  type VisualizationKind,
  type VisualizationPoint,
  type VisualizationSeries,
} from './tools.js';
import { RENDER_VISUALIZATION_TOOL_NAME } from './tool-names.js';

const DEFAULT_MAX_ITEMS = 30;
const MAX_ALLOWED_ITEMS = 200;

const SORT_OPTIONS = ['none', 'asc', 'desc'] as const;
type SortMode = (typeof SORT_OPTIONS)[number];

type PrimitiveCell = string | number | boolean;

export interface RenderVisualizationToolParams {
  visualizationKind: VisualizationKind;
  title?: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  unit?: string;
  data: unknown;
  sourceContext?: string;
  sort?: SortMode;
  maxItems?: number;
}

interface NormalizedVisualization {
  data: VisualizationData;
  truncated: boolean;
  originalItemCount: number;
  validationWarnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(message);
  }
  return value;
}

function parseNumericValue(value: unknown, fieldName: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(`Invalid numeric value for field "${fieldName}".`);
    }
    const normalized = trimmed.replace(/,/g, '');
    const asNumber = Number(normalized);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  throw new Error(`Invalid numeric value for field "${fieldName}".`);
}

function getString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function getBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return false;
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

function applySort(
  points: VisualizationPoint[],
  sort: SortMode,
): VisualizationPoint[] {
  if (sort === 'none') {
    return points;
  }

  const comparator =
    sort === 'asc'
      ? (a: VisualizationPoint, b: VisualizationPoint) => a.value - b.value
      : (a: VisualizationPoint, b: VisualizationPoint) => b.value - a.value;
  return [...points].sort(comparator);
}

function truncateItems<T>(
  items: T[],
  maxItems: number,
): {
  items: T[];
  truncated: boolean;
  originalItemCount: number;
} {
  const originalItemCount = items.length;
  const truncatedItems = items.slice(0, maxItems);
  return {
    items: truncatedItems,
    truncated: originalItemCount > truncatedItems.length,
    originalItemCount,
  };
}

function downsampleLine(
  points: VisualizationPoint[],
  maxItems: number,
): VisualizationPoint[] {
  if (points.length <= maxItems) {
    return points;
  }
  if (maxItems <= 2) {
    return [points[0], points[points.length - 1]].slice(0, maxItems);
  }

  const result: VisualizationPoint[] = [points[0]];
  const interval = (points.length - 1) / (maxItems - 1);
  for (let i = 1; i < maxItems - 1; i += 1) {
    result.push(points[Math.round(i * interval)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

function tryParseNumericValue(value: unknown): number | undefined {
  try {
    return parseNumericValue(value, 'value');
  } catch {
    return undefined;
  }
}

function parsePointRecord(
  value: unknown,
  index: number,
  fieldPrefix: string,
): VisualizationPoint {
  const pointRecord = ensureRecord(
    value,
    `${fieldPrefix}[${index}] must be an object.`,
  );
  const label =
    (typeof pointRecord['label'] === 'string' &&
    pointRecord['label'].trim().length > 0
      ? pointRecord['label']
      : undefined) ??
    (typeof pointRecord['x'] === 'string' && pointRecord['x'].trim().length > 0
      ? pointRecord['x']
      : undefined) ??
    (typeof pointRecord['name'] === 'string' &&
    pointRecord['name'].trim().length > 0
      ? pointRecord['name']
      : undefined) ??
    (typeof pointRecord['key'] === 'string' &&
    pointRecord['key'].trim().length > 0
      ? pointRecord['key']
      : undefined) ??
    (typeof pointRecord['category'] === 'string' &&
    pointRecord['category'].trim().length > 0
      ? pointRecord['category']
      : undefined) ??
    `Item ${index + 1}`;

  const rawValue =
    pointRecord['value'] ??
    pointRecord['y'] ??
    pointRecord['amount'] ??
    pointRecord['count'] ??
    pointRecord['total'];
  const numericValue = parseNumericValue(
    rawValue,
    `${fieldPrefix}[${index}].value`,
  );

  return {
    label: getString(label, `Item ${index + 1}`),
    value: numericValue,
  };
}

function pointsFromArray(
  values: unknown,
  fieldPrefix: string,
): VisualizationPoint[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  return values.map((value, index) =>
    parsePointRecord(value, index, fieldPrefix),
  );
}

function pointsFromNumericMap(
  values: Record<string, unknown>,
  reservedKeys: Set<string>,
): VisualizationPoint[] {
  return Object.entries(values)
    .filter(([key]) => !reservedKeys.has(key))
    .map(([key, rawValue]) => {
      const numericValue = tryParseNumericValue(rawValue);
      if (numericValue === undefined) {
        return null;
      }
      return {
        label: key,
        value: numericValue,
      };
    })
    .filter((point): point is VisualizationPoint => point !== null);
}

function normalizeSeriesArray(
  data: Record<string, unknown>,
  allowMultiSeries: boolean,
): { series: VisualizationSeries[]; warnings: string[] } {
  const warnings: string[] = [];
  const rawSeries = data['series'];

  if (Array.isArray(rawSeries) && rawSeries.length > 0) {
    // Accept shorthand: data.series is a points array rather than series array.
    const looksLikePointList = rawSeries.every((entry) => {
      if (!isRecord(entry)) {
        return false;
      }
      return entry['points'] === undefined && entry['value'] !== undefined;
    });

    if (looksLikePointList) {
      const points = pointsFromArray(rawSeries, 'series');
      if (points.length === 0) {
        throw new Error('series shorthand must contain non-empty points.');
      }
      return {
        series: [{ name: 'Series 1', points }],
        warnings: [
          'Converted shorthand `data.series` point list into one series.',
        ],
      };
    }

    const series = rawSeries.map((raw, seriesIndex) => {
      const seriesRecord = ensureRecord(
        raw,
        '`data.series` items must be objects.',
      );
      const name = getString(seriesRecord['name'], `Series ${seriesIndex + 1}`);

      let points = pointsFromArray(
        seriesRecord['points'] ?? seriesRecord['data'],
        `series[${seriesIndex}].points`,
      );
      if (points.length === 0 && isRecord(seriesRecord['values'])) {
        points = pointsFromNumericMap(
          seriesRecord['values'],
          new Set(['title', 'name']),
        );
        if (points.length > 0) {
          warnings.push(
            `Converted series[${seriesIndex}].values key/value map into points.`,
          );
        }
      }

      if (points.length === 0) {
        throw new Error('Each series must have non-empty `points`.');
      }

      return { name, points };
    });

    if (!allowMultiSeries && series.length > 1) {
      throw new Error('bar supports exactly one series.');
    }

    return { series, warnings };
  }

  const rawPoints = data['points'] ?? data['data'];
  if (Array.isArray(rawPoints) && rawPoints.length > 0) {
    return {
      series: [
        { name: 'Series 1', points: pointsFromArray(rawPoints, 'points') },
      ],
      warnings: ['Converted shorthand `data.points` into one series.'],
    };
  }

  if (isRecord(data['values'])) {
    const points = pointsFromNumericMap(
      data['values'],
      new Set(['title', 'name']),
    );
    if (points.length > 0) {
      return {
        series: [{ name: 'Series 1', points }],
        warnings: [
          'Converted shorthand `data.values` key/value map into points.',
        ],
      };
    }
  }

  const rootPoints = pointsFromNumericMap(
    data,
    new Set([
      'series',
      'points',
      'data',
      'values',
      'title',
      'subtitle',
      'xLabel',
      'yLabel',
      'unit',
      'sort',
      'maxItems',
      'sourceContext',
    ]),
  );
  if (rootPoints.length > 0) {
    return {
      series: [{ name: 'Series 1', points: rootPoints }],
      warnings: ['Converted root key/value map into one series.'],
    };
  }

  throw new Error(
    'bar/line requires series data. Accepted forms: data.series[].points[], data.points[], data.values{}, or root key/value map.',
  );
}

function normalizeBar(
  data: Record<string, unknown>,
  sort: SortMode,
  maxItems: number,
): NormalizedVisualization {
  const normalized = normalizeSeriesArray(data, false);
  const series = normalized.series;

  let points = series[0].points;
  const negative = points.find((point) => point.value < 0);
  if (negative) {
    throw new Error(
      `bar does not support negative values (label: "${negative.label}").`,
    );
  }

  points = applySort(points, sort);
  const truncated = truncateItems(points, maxItems);

  return {
    data: {
      series: [{ name: series[0].name, points: truncated.items }],
    },
    truncated: truncated.truncated,
    originalItemCount: truncated.originalItemCount,
    validationWarnings: normalized.warnings,
  };
}

function normalizeLine(
  data: Record<string, unknown>,
  maxItems: number,
): NormalizedVisualization {
  const normalized = normalizeSeriesArray(data, true);
  const series = normalized.series;
  let truncated = false;
  let originalItemCount = 0;

  const normalizedSeries = series.map((item) => {
    originalItemCount += item.points.length;
    if (item.points.length > maxItems) {
      truncated = true;
      return {
        name: item.name,
        points: downsampleLine(item.points, maxItems),
      };
    }

    return item;
  });

  return {
    data: {
      series: normalizedSeries,
    },
    truncated,
    originalItemCount,
    validationWarnings: normalized.warnings,
  };
}

function normalizePie(
  data: Record<string, unknown>,
  sort: SortMode,
  maxItems: number,
): NormalizedVisualization {
  const warnings: string[] = [];

  let slices = pointsFromArray(data['slices'], 'slices').map((point) => ({
    label: point.label,
    value: point.value,
  }));

  if (slices.length === 0) {
    try {
      const normalizedSeries = normalizeSeriesArray(data, true);
      const firstSeries = normalizedSeries.series[0];
      if (firstSeries && firstSeries.points.length > 0) {
        slices = firstSeries.points.map((point) => ({
          label: point.label,
          value: point.value,
        }));
        warnings.push(
          'Converted series-based payload to pie slices using the first series.',
        );
        warnings.push(...normalizedSeries.warnings);
      }
    } catch {
      // Fall through to other shorthand formats below.
    }
  }

  if (slices.length === 0) {
    slices = pointsFromNumericMap(
      data,
      new Set([
        'series',
        'points',
        'data',
        'slices',
        'values',
        'title',
        'subtitle',
        'xLabel',
        'yLabel',
        'unit',
        'sort',
        'maxItems',
      ]),
    ).map((point) => ({
      label: point.label,
      value: point.value,
    }));

    if (slices.length > 0) {
      warnings.push('Converted root key/value map to pie slices.');
    }
  }

  if (slices.length === 0) {
    throw new Error(
      'pie requires data.slices[] (or shorthand key/value map). Each item needs label + value.',
    );
  }

  for (const slice of slices) {
    if (slice.value < 0) {
      throw new Error('pie slices cannot be negative.');
    }
  }

  if (sort !== 'none') {
    slices.sort((a, b) =>
      sort === 'asc' ? a.value - b.value : b.value - a.value,
    );
  }

  const truncated = truncateItems(slices, maxItems);
  const total = truncated.items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    throw new Error('pie requires total value > 0.');
  }

  return {
    data: {
      slices: truncated.items,
    },
    truncated: truncated.truncated,
    originalItemCount: truncated.originalItemCount,
    validationWarnings: warnings,
  };
}

function treeToTable(root: Record<string, unknown>): {
  columns: string[];
  rows: PrimitiveCell[][];
} {
  const rows: PrimitiveCell[][] = [];
  const visit = (node: Record<string, unknown>, parent: string) => {
    const label = getString(node['label'], '(node)');
    const impact =
      typeof node['impact'] === 'string' && node['impact'].trim().length > 0
        ? node['impact'].trim()
        : '';
    rows.push([label, parent, impact]);
    const children = Array.isArray(node['children'])
      ? node['children'].filter(isRecord)
      : [];
    children.forEach((child) => visit(child, label));
  };

  visit(root, '');
  return {
    columns: ['Node', 'Parent', 'Impact'],
    rows,
  };
}

function normalizeTable(
  data: Record<string, unknown>,
  maxItems: number,
): NormalizedVisualization {
  const warnings: string[] = [];

  // Legacy dashboard payloads: convert to generic table.
  if (Array.isArray(data['failures'])) {
    const rows = data['failures']
      .filter(isRecord)
      .map((item) => [
        getString(item['status'], 'failed'),
        getString(item['testName'], '(test)'),
        parseNumericValue(item['durationMs'] ?? 0, 'durationMs'),
        getString(item['file'], '(file)'),
        getBoolean(item['isNew']),
      ]);
    const truncated = truncateItems(rows, maxItems);
    warnings.push('Converted legacy test_dashboard payload to table.');
    return {
      data: {
        columns: ['Status', 'Test', 'DurationMs', 'File', 'IsNew'],
        rows: truncated.items,
        metricColumns: [2],
      },
      truncated: truncated.truncated,
      originalItemCount: truncated.originalItemCount,
      validationWarnings: warnings,
    };
  }

  if (Array.isArray(data['runs'])) {
    const rows = data['runs']
      .filter(isRecord)
      .map((item) => [
        getString(item['label'], '(run)'),
        parseNumericValue(item['totalMs'] ?? 0, 'totalMs'),
        getString(item['status'], 'unknown'),
        getString(item['failedStep'], ''),
      ]);
    const truncated = truncateItems(rows, maxItems);
    warnings.push('Converted legacy build_timeline payload to table.');
    return {
      data: {
        columns: ['Run', 'TotalMs', 'Status', 'FailedStep'],
        rows: truncated.items,
        metricColumns: [1],
      },
      truncated: truncated.truncated,
      originalItemCount: truncated.originalItemCount,
      validationWarnings: warnings,
    };
  }

  if (Array.isArray(data['steps'])) {
    const rows = data['steps']
      .filter(isRecord)
      .map((item) => [
        getString(item['phase'], '(phase)'),
        getString(item['tool'], '(tool)'),
        parseNumericValue(item['durationMs'] ?? 0, 'durationMs'),
        getString(item['status'], 'ok'),
      ]);
    const truncated = truncateItems(rows, maxItems);
    warnings.push('Converted legacy agent_trace payload to table.');
    return {
      data: {
        columns: ['Phase', 'Tool', 'DurationMs', 'Status'],
        rows: truncated.items,
        metricColumns: [2],
      },
      truncated: truncated.truncated,
      originalItemCount: truncated.originalItemCount,
      validationWarnings: warnings,
    };
  }

  if (Array.isArray(data['files'])) {
    const first = data['files'][0];
    if (isRecord(first)) {
      const keys = Object.keys(first);
      const rows = data['files']
        .filter(isRecord)
        .map((item) => keys.map((key) => normalizeCell(item[key])));
      const truncated = truncateItems(rows, maxItems);
      const metricColumns = keys
        .map((key, index) => ({ key, index }))
        .filter((item) =>
          [
            'score',
            'linesChanged',
            'changedLines',
            'beforePct',
            'afterPct',
            'deltaPct',
            'touches',
            'errors',
            'failedTests',
            'calls',
            'totalMs',
          ].includes(item.key),
        )
        .map((item) => item.index);
      warnings.push('Converted legacy files payload to table.');
      return {
        data: {
          columns: keys,
          rows: truncated.items,
          metricColumns: metricColumns.length > 0 ? metricColumns : undefined,
        },
        truncated: truncated.truncated,
        originalItemCount: truncated.originalItemCount,
        validationWarnings: warnings,
      };
    }
  }

  if (isRecord(data['summary']) && Array.isArray(data['byTool'])) {
    const summary = ensureRecord(data['summary'], 'summary must be an object.');
    const summaryRows: PrimitiveCell[][] = [
      [
        'inputTokens',
        parseNumericValue(summary['inputTokens'] ?? 0, 'inputTokens'),
      ],
      [
        'outputTokens',
        parseNumericValue(summary['outputTokens'] ?? 0, 'outputTokens'),
      ],
      ['toolCalls', parseNumericValue(summary['toolCalls'] ?? 0, 'toolCalls')],
      ['elapsedMs', parseNumericValue(summary['elapsedMs'] ?? 0, 'elapsedMs')],
    ];

    const byToolRows = data['byTool']
      .filter(isRecord)
      .map((item) => [
        getString(item['tool'], '(tool)'),
        parseNumericValue(item['calls'] ?? 0, 'calls'),
        item['totalMs'] === undefined
          ? 0
          : parseNumericValue(item['totalMs'], 'totalMs'),
      ]);

    const rows = [...summaryRows, ...byToolRows];
    const truncated = truncateItems(rows, maxItems);
    warnings.push('Converted legacy cost_meter payload to table.');
    return {
      data: {
        columns: ['Metric/Tool', 'Value/Calls', 'DurationMs'],
        rows: truncated.items,
        metricColumns: [1, 2],
      },
      truncated: truncated.truncated,
      originalItemCount: truncated.originalItemCount,
      validationWarnings: warnings,
    };
  }

  if (isRecord(data['root'])) {
    const tree = treeToTable(data['root']);
    const truncated = truncateItems(tree.rows, maxItems);
    warnings.push('Converted legacy impact_graph payload to table.');
    return {
      data: {
        columns: tree.columns,
        rows: truncated.items,
      },
      truncated: truncated.truncated,
      originalItemCount: truncated.originalItemCount,
      validationWarnings: warnings,
    };
  }

  const rawRows = Array.isArray(data['rows'])
    ? data['rows']
    : Array.isArray(data['data'])
      ? data['data']
      : undefined;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    const keyValueRows = pointsFromNumericMap(
      data,
      new Set([
        'columns',
        'headers',
        'rows',
        'data',
        'metricColumns',
        'title',
        'subtitle',
        'sourceContext',
      ]),
    ).map((point) => [point.label, point.value]);
    if (keyValueRows.length > 0) {
      const truncated = truncateItems(keyValueRows, maxItems);
      warnings.push('Converted root key/value map into two-column table.');
      return {
        data: {
          columns: ['Key', 'Value'],
          rows: truncated.items,
          metricColumns: [1],
        },
        truncated: truncated.truncated,
        originalItemCount: truncated.originalItemCount,
        validationWarnings: warnings,
      };
    }

    throw new Error(
      'table requires rows as a non-empty array. Accepted: data.rows or data.data with optional columns/headers.',
    );
  }

  let columns = Array.isArray(data['columns'])
    ? data['columns'].map((column, idx) =>
        getString(column, `Column ${idx + 1}`),
      )
    : Array.isArray(data['headers'])
      ? data['headers'].map((column, idx) =>
          getString(column, `Column ${idx + 1}`),
        )
      : [];
  if (!Array.isArray(data['columns']) && Array.isArray(data['headers'])) {
    warnings.push('Converted `headers` to `columns`.');
  }

  const firstRow = rawRows.find((row) => Array.isArray(row) || isRecord(row));
  if (columns.length === 0 && isRecord(firstRow)) {
    columns = Object.keys(firstRow);
  }

  const rows = rawRows.map((rawRow, rowIndex) => {
    if (Array.isArray(rawRow)) {
      return rawRow.map((cell) => normalizeCell(cell));
    }

    if (isRecord(rawRow)) {
      if (columns.length === 0) {
        columns = Object.keys(rawRow);
      }
      return columns.map((column) => normalizeCell(rawRow[column]));
    }

    throw new Error(`table row ${rowIndex} must be an array or object.`);
  });

  if (columns.length === 0) {
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    columns = Array.from({ length: maxCols }, (_, idx) => `Column ${idx + 1}`);
  }

  const metricColumns = Array.isArray(data['metricColumns'])
    ? data['metricColumns']
        .map((value) => parseNumericValue(value, 'metricColumns[]'))
        .filter(
          (value) =>
            Number.isInteger(value) && value >= 0 && value < columns.length,
        )
    : undefined;

  const truncated = truncateItems(rows, maxItems);

  return {
    data: {
      columns,
      rows: truncated.items,
      metricColumns:
        metricColumns && metricColumns.length > 0 ? metricColumns : undefined,
    },
    truncated: truncated.truncated,
    originalItemCount: truncated.originalItemCount,
    validationWarnings: warnings,
  };
}

function normalizeDiagram(
  data: Record<string, unknown>,
  maxItems: number,
): NormalizedVisualization {
  let diagramKind: 'architecture' | 'flowchart' = 'architecture';
  const diagramKindCandidate = getString(data['diagramKind'], 'architecture');
  if (diagramKindCandidate === 'flowchart') {
    diagramKind = 'flowchart';
  } else if (diagramKindCandidate !== 'architecture') {
    throw new Error(`diagramKind must be one of: ${DIAGRAM_KINDS.join(', ')}`);
  }

  const directionCandidate = getString(data['direction'], 'LR').toUpperCase();
  const direction =
    directionCandidate === 'TB' ||
    directionCandidate === 'TOP-BOTTOM' ||
    directionCandidate === 'TOP_TO_BOTTOM' ||
    directionCandidate === 'VERTICAL'
      ? 'TB'
      : 'LR';

  let nodesInput = data['nodes'] ?? data['boxes'];
  let edgesInput = data['edges'] ?? data['links'] ?? data['connections'];

  const warnings: string[] = [];
  const slugify = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'node';

  // Accept legacy impact tree payload for diagrams.
  if (
    (!Array.isArray(nodesInput) || !Array.isArray(edgesInput)) &&
    isRecord(data['root'])
  ) {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];
    const seen = new Set<string>();

    const visit = (node: Record<string, unknown>, parentId?: string) => {
      const label = getString(node['label'], '(node)');
      let id = slugify(label);
      let suffix = 2;
      while (seen.has(id)) {
        id = `${slugify(label)}-${suffix}`;
        suffix += 1;
      }
      seen.add(id);
      nodes.push({
        id,
        label,
        type: getString(node['impact'], '') || undefined,
      });
      if (parentId) {
        edges.push({ from: parentId, to: id });
      }

      const children = Array.isArray(node['children'])
        ? node['children'].filter(isRecord)
        : [];
      children.forEach((child) => visit(child, id));
    };

    visit(data['root']);
    nodesInput = nodes;
    edgesInput = edges;
    diagramKind = 'flowchart';
    warnings.push(
      'Converted tree-style root payload into diagram nodes/edges.',
    );
  }

  if (!Array.isArray(nodesInput) || nodesInput.length === 0) {
    throw new Error('diagram requires non-empty `data.nodes`.');
  }
  if (!Array.isArray(edgesInput)) {
    throw new Error('diagram requires `data.edges` array.');
  }

  const ids = new Set<string>();
  let convertedStringNodes = false;
  const nodes = nodesInput.map((rawNode, index) => {
    if (typeof rawNode === 'string') {
      const label = getString(rawNode, `Node ${index + 1}`);
      let id = slugify(label);
      let suffix = 2;
      while (ids.has(id)) {
        id = `${slugify(label)}-${suffix}`;
        suffix += 1;
      }
      ids.add(id);
      convertedStringNodes = true;
      return { id, label };
    }

    const node = ensureRecord(rawNode, `nodes[${index}] must be an object.`);
    const idCandidate =
      (typeof node['id'] === 'string' && node['id'].trim().length > 0
        ? node['id']
        : undefined) ??
      (typeof node['key'] === 'string' && node['key'].trim().length > 0
        ? node['key']
        : undefined) ??
      (typeof node['name'] === 'string' && node['name'].trim().length > 0
        ? slugify(node['name'])
        : undefined) ??
      (typeof node['label'] === 'string' && node['label'].trim().length > 0
        ? slugify(node['label'])
        : undefined);
    const id = getString(idCandidate, '');
    if (id.length === 0) {
      throw new Error(`nodes[${index}].id must be a non-empty string.`);
    }
    if (ids.has(id)) {
      throw new Error(`Duplicate node id detected: "${id}".`);
    }
    ids.add(id);

    return {
      id,
      label: getString(node['label'], id),
      type:
        typeof node['type'] === 'string' && node['type'].trim().length > 0
          ? node['type'].trim()
          : undefined,
    };
  });
  if (convertedStringNodes) {
    warnings.push('Converted string nodes into {id,label} nodes.');
  }

  const idByAlias = new Map<string, string>();
  for (const node of nodes) {
    idByAlias.set(node.id.toLowerCase(), node.id);
    idByAlias.set(slugify(node.id).toLowerCase(), node.id);
    idByAlias.set(node.label.toLowerCase(), node.id);
    idByAlias.set(slugify(node.label).toLowerCase(), node.id);
  }
  const resolveNodeId = (candidate: string): string => {
    if (ids.has(candidate)) {
      return candidate;
    }
    const normalized = candidate.trim().toLowerCase();
    return idByAlias.get(normalized) ?? candidate;
  };

  const edges = edgesInput.map((rawEdge, index) => {
    const edge = ensureRecord(rawEdge, `edges[${index}] must be an object.`);
    const from = resolveNodeId(
      getString(
        edge['from'] ?? edge['source'] ?? edge['fromId'] ?? edge['start'],
        '',
      ),
    );
    const to = resolveNodeId(
      getString(
        edge['to'] ?? edge['target'] ?? edge['toId'] ?? edge['end'],
        '',
      ),
    );
    if (!from || !to) {
      throw new Error(`edges[${index}] requires non-empty from/to.`);
    }
    if (!ids.has(from)) {
      throw new Error(
        `edges[${index}].from references unknown node id "${from}".`,
      );
    }
    if (!ids.has(to)) {
      throw new Error(`edges[${index}].to references unknown node id "${to}".`);
    }

    return {
      from,
      to,
      label:
        typeof (edge['label'] ?? edge['name']) === 'string' &&
        String(edge['label'] ?? edge['name']).trim().length > 0
          ? String(edge['label'] ?? edge['name']).trim()
          : undefined,
    };
  });

  if (diagramKind === 'flowchart' && edges.length === 0) {
    throw new Error('flowchart requires at least one edge.');
  }

  const originalNodeCount = nodes.length;
  const originalEdgeCount = edges.length;
  const truncatedNodes = nodes.slice(0, maxItems);
  const allowedIds = new Set(truncatedNodes.map((node) => node.id));
  const truncatedEdges = edges.filter(
    (edge) => allowedIds.has(edge.from) && allowedIds.has(edge.to),
  );

  return {
    data: {
      diagramKind,
      direction,
      nodes: truncatedNodes,
      edges: truncatedEdges,
    },
    truncated:
      truncatedNodes.length < originalNodeCount ||
      truncatedEdges.length < originalEdgeCount,
    originalItemCount: originalNodeCount,
    validationWarnings: warnings,
  };
}

function normalizeByKind(
  kind: VisualizationKind,
  data: unknown,
  sort: SortMode,
  maxItems: number,
): NormalizedVisualization {
  const payload = ensureRecord(data, '`data` must be an object.');

  switch (kind) {
    case 'bar':
      return normalizeBar(payload, sort, maxItems);
    case 'line':
      return normalizeLine(payload, maxItems);
    case 'pie':
      return normalizePie(payload, sort, maxItems);
    case 'table':
      return normalizeTable(payload, maxItems);
    case 'diagram':
      return normalizeDiagram(payload, maxItems);
    default:
      throw new Error(`Unsupported visualization kind: ${kind as string}`);
  }
}

class RenderVisualizationToolInvocation extends BaseToolInvocation<
  RenderVisualizationToolParams,
  ToolResult
> {
  getDescription(): string {
    return `Render a ${this.params.visualizationKind} visualization.`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const sort = this.params.sort ?? 'none';
    const maxItems = Math.max(
      1,
      Math.min(this.params.maxItems ?? DEFAULT_MAX_ITEMS, MAX_ALLOWED_ITEMS),
    );

    const normalized = normalizeByKind(
      this.params.visualizationKind,
      this.params.data,
      sort,
      maxItems,
    );

    const returnDisplay: VisualizationDisplay = {
      type: 'visualization',
      kind: this.params.visualizationKind,
      title: this.params.title,
      subtitle: this.params.subtitle,
      xLabel: this.params.xLabel,
      yLabel: this.params.yLabel,
      unit: this.params.unit,
      data: normalized.data,
      meta: {
        truncated: normalized.truncated,
        originalItemCount: normalized.originalItemCount,
        validationWarnings:
          normalized.validationWarnings.length > 0
            ? normalized.validationWarnings
            : undefined,
      },
    };

    const llmContent = [
      `Visualization rendered: ${this.params.visualizationKind}`,
      this.params.title ? `Title: ${this.params.title}` : '',
      `Items rendered: ${normalized.originalItemCount}`,
      normalized.truncated
        ? `Data was truncated to maxItems=${maxItems} (original items: ${normalized.originalItemCount}).`
        : '',
      this.params.sourceContext
        ? `Source context: ${this.params.sourceContext}`
        : '',
    ]
      .filter((line) => line.length > 0)
      .join('\n');

    return {
      llmContent,
      returnDisplay,
    };
  }
}

export const RENDER_VISUALIZATION_DESCRIPTION = `Render compact terminal visualizations.

Use one tool with five kinds:
- chart: bar, line, pie
- structured view: table
- graph/uml-like view: diagram

Canonical payloads:
- bar/line: \`data.series=[{name, points:[{label,value}]}]\`
- pie: \`data.slices=[{label,value}]\`
- table: \`data.columns + data.rows\`
- diagram: \`data.nodes + data.edges\` (+ optional \`direction: "LR"|"TB"\`)

Accepted shorthand (auto-normalized):
- bar/line can use \`data.points\`, \`data.values\`, or a root key/value map like \`{North: 320, South: 580}\`
- pie can use slices, series points, or key/value map
- table can use \`headers\` as alias of \`columns\`
- diagram accepts \`links\`/\`connections\`, edge keys \`source/target\`, and string nodes

When users ask for engineering dashboards (tests, builds, risk, trace, coverage, cost), prefer \`table\` and encode metrics in rows/columns.
When users ask for architecture/flow/UML-like diagrams, use \`diagram\` with nodes/edges and set \`direction\`.`;

export class RenderVisualizationTool extends BaseDeclarativeTool<
  RenderVisualizationToolParams,
  ToolResult
> {
  static readonly Name = RENDER_VISUALIZATION_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      RenderVisualizationTool.Name,
      'RenderVisualization',
      RENDER_VISUALIZATION_DESCRIPTION,
      Kind.Other,
      {
        type: 'object',
        properties: {
          visualizationKind: {
            type: 'string',
            enum: VISUALIZATION_KINDS,
            description: 'Visualization kind to render.',
          },
          title: {
            type: 'string',
            description: 'Optional visualization title.',
          },
          subtitle: {
            type: 'string',
            description: 'Optional visualization subtitle.',
          },
          xLabel: {
            type: 'string',
            description: 'Optional x-axis label.',
          },
          yLabel: {
            type: 'string',
            description: 'Optional y-axis label.',
          },
          unit: {
            type: 'string',
            description: 'Optional unit label for values.',
          },
          data: {
            type: 'object',
            description:
              'Payload for the chosen kind. Canonical: bar/line series->points(label,value), pie slices(label,value), table columns+rows, diagram nodes+edges. Shorthand maps/aliases are accepted.',
            additionalProperties: true,
          },
          sourceContext: {
            type: 'string',
            description: 'Optional provenance summary for the data.',
          },
          sort: {
            type: 'string',
            enum: SORT_OPTIONS,
            description: 'Optional sort mode for bar/pie visualizations.',
          },
          maxItems: {
            type: 'number',
            description: `Maximum items to render (default ${DEFAULT_MAX_ITEMS}, max ${MAX_ALLOWED_ITEMS}).`,
          },
        },
        required: ['visualizationKind', 'data'],
        additionalProperties: false,
      },
      messageBus,
      false,
      false,
    );
  }

  protected override validateToolParamValues(
    params: RenderVisualizationToolParams,
  ): string | null {
    if (!VISUALIZATION_KINDS.includes(params.visualizationKind)) {
      return `visualizationKind must be one of: ${VISUALIZATION_KINDS.join(', ')}`;
    }

    if (!isRecord(params.data)) {
      return 'data must be an object.';
    }

    if (params.sort && !SORT_OPTIONS.includes(params.sort)) {
      return `sort must be one of: ${SORT_OPTIONS.join(', ')}`;
    }

    if (params.maxItems !== undefined) {
      if (!Number.isFinite(params.maxItems) || params.maxItems < 1) {
        return 'maxItems must be a positive number.';
      }
      if (params.maxItems > MAX_ALLOWED_ITEMS) {
        return `maxItems cannot exceed ${MAX_ALLOWED_ITEMS}.`;
      }
    }

    return null;
  }

  protected createInvocation(
    params: RenderVisualizationToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<RenderVisualizationToolParams, ToolResult> {
    return new RenderVisualizationToolInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

// Exported for targeted unit tests.
export const renderVisualizationTestUtils = {
  parseNumericValue,
  normalizeByKind,
};
