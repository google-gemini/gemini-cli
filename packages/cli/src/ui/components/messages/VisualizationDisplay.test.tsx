/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import {
  VisualizationResultDisplay,
  type VisualizationResult as VisualizationDisplay,
} from './VisualizationDisplay.js';

describe('VisualizationResultDisplay', () => {
  const render = (ui: React.ReactElement) => renderWithProviders(ui);

  it('renders bar visualization', () => {
    const visualization: VisualizationDisplay = {
      type: 'visualization',
      kind: 'bar',
      title: 'BMW 0-60',
      unit: 's',
      data: {
        series: [
          {
            name: 'BMW',
            points: [
              { label: 'M5 CS', value: 2.9 },
              { label: 'M8', value: 3.0 },
            ],
          },
        ],
      },
      meta: {
        truncated: false,
        originalItemCount: 2,
      },
    };

    const { lastFrame } = render(
      <VisualizationResultDisplay visualization={visualization} width={80} />,
    );

    expect(lastFrame()).toContain('BMW 0-60');
    expect(lastFrame()).toContain('M5 CS');
    expect(lastFrame()).toContain('2.90s');
  });

  it('renders line and pie visualizations', () => {
    const line: VisualizationDisplay = {
      type: 'visualization',
      kind: 'line',
      title: 'BMW models by year',
      xLabel: 'Year',
      yLabel: 'Models',
      data: {
        series: [
          {
            name: 'Total',
            points: [
              { label: '2021', value: 15 },
              { label: '2022', value: 16 },
              { label: '2023', value: 17 },
            ],
          },
        ],
      },
      meta: {
        truncated: false,
        originalItemCount: 3,
      },
    };

    const pie: VisualizationDisplay = {
      type: 'visualization',
      kind: 'pie',
      data: {
        slices: [
          { label: 'M', value: 40 },
          { label: 'X', value: 60 },
        ],
      },
      meta: {
        truncated: false,
        originalItemCount: 2,
      },
    };

    const lineFrame = render(
      <VisualizationResultDisplay visualization={line} width={70} />,
    ).lastFrame();
    const pieFrame = render(
      <VisualizationResultDisplay visualization={pie} width={70} />,
    ).lastFrame();

    expect(lineFrame).toContain('Total:');
    expect(lineFrame).toContain('x: Year | y: Models');
    expect(pieFrame).toContain('Slice');
    expect(pieFrame).toContain('Share');
  });

  it('renders rich table visualization with metric bars', () => {
    const visualization: VisualizationDisplay = {
      type: 'visualization',
      kind: 'table',
      title: 'Risk Table',
      data: {
        columns: ['Path', 'Score', 'Lines'],
        rows: [
          ['src/core.ts', 95, 210],
          ['src/ui.tsx', 45, 80],
        ],
        metricColumns: [1],
      },
      meta: {
        truncated: true,
        originalItemCount: 8,
      },
    };

    const { lastFrame } = render(
      <VisualizationResultDisplay visualization={visualization} width={90} />,
    );

    const frame = lastFrame();
    expect(frame).toContain('Risk Table');
    expect(frame).toContain('Path');
    expect(frame).toContain('Showing truncated data (8 original items)');
  });

  it('renders diagram visualization with UML-like nodes', () => {
    const visualization: VisualizationDisplay = {
      type: 'visualization',
      kind: 'diagram',
      title: 'Service Architecture',
      data: {
        diagramKind: 'architecture',
        direction: 'LR',
        nodes: [
          { id: 'ui', label: 'Web UI', type: 'frontend' },
          { id: 'api', label: 'API', type: 'service' },
        ],
        edges: [{ from: 'ui', to: 'api', label: 'HTTPS' }],
      },
      meta: {
        truncated: false,
        originalItemCount: 2,
      },
    };

    const { lastFrame } = render(
      <VisualizationResultDisplay visualization={visualization} width={90} />,
    );

    const frame = lastFrame();
    expect(frame).toContain('Service Architecture');
    expect(frame).toContain('┌');
    expect(frame).toContain('>');
    expect(frame).toContain('Notes:');
    expect(frame).toContain('Web UI -> API: HTTPS');
  });
});
