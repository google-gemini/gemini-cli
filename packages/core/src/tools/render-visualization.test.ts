/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  RenderVisualizationTool,
  type RenderVisualizationToolParams,
  renderVisualizationTestUtils,
} from './render-visualization.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

const signal = new AbortController().signal;

describe('RenderVisualizationTool', () => {
  const tool = new RenderVisualizationTool(createMockMessageBus());

  it('renders bar visualization', async () => {
    const params: RenderVisualizationToolParams = {
      visualizationKind: 'bar',
      title: 'BMW 0-60',
      unit: 's',
      sort: 'asc',
      data: {
        series: [
          {
            name: 'BMW',
            points: [
              { label: 'M5 CS', value: 2.9 },
              { label: 'M8 Competition', value: 3.0 },
              { label: 'XM Label Red', value: 3.7 },
            ],
          },
        ],
      },
    };

    const result = await tool.buildAndExecute(params, signal);

    expect(result.llmContent).toContain('Visualization rendered: bar');
    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'bar',
      title: 'BMW 0-60',
    });
  });

  it('renders line visualization with multiple series', async () => {
    const params: RenderVisualizationToolParams = {
      visualizationKind: 'line',
      data: {
        series: [
          {
            name: 'Sedan',
            points: [
              { label: '2021', value: 5 },
              { label: '2022', value: 6 },
              { label: '2023', value: 7 },
            ],
          },
          {
            name: 'SUV',
            points: [
              { label: '2021', value: 4 },
              { label: '2022', value: 5 },
              { label: '2023', value: 6 },
            ],
          },
        ],
      },
    };

    const result = await tool.buildAndExecute(params, signal);
    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'line',
    });
  });

  it('accepts shorthand bar payloads from root key/value maps', async () => {
    const result = await tool.buildAndExecute(
      {
        visualizationKind: 'bar',
        data: {
          North: 320,
          South: 580,
          East: 450,
          West: 490,
        },
      },
      signal,
    );

    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'bar',
    });
    const display = result.returnDisplay as {
      data: {
        series: Array<{ points: Array<{ label: string; value: number }> }>;
      };
    };
    expect(display.data.series[0]?.points).toEqual(
      expect.arrayContaining([
        { label: 'North', value: 320 },
        { label: 'South', value: 580 },
        { label: 'East', value: 450 },
        { label: 'West', value: 490 },
      ]),
    );
  });

  it('renders pie visualization', async () => {
    const params: RenderVisualizationToolParams = {
      visualizationKind: 'pie',
      data: {
        slices: [
          { label: 'M', value: 40 },
          { label: 'X', value: 35 },
          { label: 'i', value: 25 },
        ],
      },
    };

    const result = await tool.buildAndExecute(params, signal);
    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'pie',
    });
  });

  it('accepts shorthand pie payloads from series points', async () => {
    const result = await tool.buildAndExecute(
      {
        visualizationKind: 'pie',
        data: {
          series: [
            {
              name: 'Browsers',
              points: [
                { label: 'Chrome', value: 65 },
                { label: 'Safari', value: 18 },
              ],
            },
          ],
        },
      },
      signal,
    );

    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'pie',
      data: {
        slices: [
          { label: 'Chrome', value: 65 },
          { label: 'Safari', value: 18 },
        ],
      },
    });
  });

  it('renders rich table visualization', async () => {
    const params: RenderVisualizationToolParams = {
      visualizationKind: 'table',
      data: {
        columns: ['Path', 'Score', 'Lines'],
        rows: [
          ['src/core.ts', 90, 220],
          ['src/ui.tsx', 45, 80],
        ],
        metricColumns: [1, 2],
      },
    };

    const result = await tool.buildAndExecute(params, signal);
    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'table',
    });
  });

  it('accepts table headers alias', async () => {
    const result = await tool.buildAndExecute(
      {
        visualizationKind: 'table',
        data: {
          headers: ['Name', 'Score'],
          rows: [
            ['alpha', 90],
            ['beta', 75],
          ],
        },
      },
      signal,
    );

    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'table',
      data: {
        columns: ['Name', 'Score'],
      },
    });
  });

  it('renders diagram visualization', async () => {
    const params: RenderVisualizationToolParams = {
      visualizationKind: 'diagram',
      data: {
        diagramKind: 'architecture',
        direction: 'LR',
        nodes: [
          { id: 'ui', label: 'Web UI', type: 'frontend' },
          { id: 'api', label: 'API', type: 'service' },
          { id: 'db', label: 'Postgres', type: 'database' },
        ],
        edges: [
          { from: 'ui', to: 'api', label: 'HTTPS' },
          { from: 'api', to: 'db', label: 'SQL' },
        ],
      },
    };

    const result = await tool.buildAndExecute(params, signal);
    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'diagram',
    });
  });

  it('accepts shorthand diagram payload aliases', async () => {
    const result = await tool.buildAndExecute(
      {
        visualizationKind: 'diagram',
        data: {
          diagramKind: 'flowchart',
          direction: 'top-bottom',
          nodes: ['Start', 'Validate', 'Done'],
          links: [
            { source: 'start', target: 'validate', label: 'ok' },
            { source: 'validate', target: 'done' },
          ],
        },
      },
      signal,
    );

    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'diagram',
      data: {
        direction: 'TB',
      },
    });
  });

  it('converts legacy dashboard payloads into table', async () => {
    const params: RenderVisualizationToolParams = {
      visualizationKind: 'table',
      data: {
        failures: [
          {
            testName: 'should compile',
            file: 'src/a.test.ts',
            durationMs: 120,
            status: 'failed',
            isNew: true,
          },
        ],
      },
    };

    const result = await tool.buildAndExecute(params, signal);
    expect(result.returnDisplay).toMatchObject({
      type: 'visualization',
      kind: 'table',
      data: {
        columns: ['Status', 'Test', 'DurationMs', 'File', 'IsNew'],
      },
    });
  });

  it('rejects invalid payloads', async () => {
    await expect(
      tool.buildAndExecute(
        {
          visualizationKind: 'bar',
          data: {
            series: [
              {
                name: 'BMW',
                points: [{ label: 'M5', value: -1 }],
              },
            ],
          },
        },
        signal,
      ),
    ).rejects.toThrow('bar does not support negative values');

    await expect(
      tool.buildAndExecute(
        {
          visualizationKind: 'diagram',
          data: {
            diagramKind: 'flowchart',
            nodes: [{ id: 'start', label: 'Start' }],
            edges: [],
          },
        },
        signal,
      ),
    ).rejects.toThrow('flowchart requires at least one edge');
  });

  it('exposes normalization helper for tests', () => {
    const normalized = renderVisualizationTestUtils.normalizeByKind(
      'table',
      {
        columns: ['Name', 'Score'],
        rows: [
          ['A', 10],
          ['B', 20],
        ],
      },
      'none',
      10,
    );

    expect(normalized.originalItemCount).toBe(2);
    expect(normalized.truncated).toBe(false);
    expect(normalized.data).toMatchObject({
      columns: ['Name', 'Score'],
    });
  });
});
