/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface ChartDataPoint {
  [key: string]: string | number | boolean | undefined;
}

interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'candlestick' | 'pie' | 'scatter';
  title: string;
  data: ChartDataPoint[];
  xKey: string;
  yKey?: string;
  yKeys?: string[];
  options?: {
    width?: number;
    height?: number;
    colors?: string[];
    showGrid?: boolean;
    showTooltip?: boolean;
    showLegend?: boolean;
    strokeWidth?: number;
    fillOpacity?: number;
  };
}

interface ChartRendererProps {
  charts: ChartConfig[];
}

interface CandlestickDataPoint extends ChartDataPoint {
  datetime: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface TransformedCandlestickData {
  [key: string]: string | number | boolean | [number, number] | undefined;
  datetime: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  highLow: [number, number];
  openClose: [number, number];
  isPositive: boolean;
}

// Custom Candlestick Chart Component
const CandlestickChart: React.FC<{ data: CandlestickDataPoint[]; height: number; title: string }> = ({ data, height }) => {
  // Transform data for candlestick visualization
  const transformedData: TransformedCandlestickData[] = data.map(item => ({
    ...item,
    highLow: [item.low, item.high] as [number, number],
    openClose: [Math.min(item.open, item.close), Math.max(item.open, item.close)] as [number, number],
    isPositive: item.close >= item.open,
  }));

  interface CustomCandlestickProps {
    payload?: TransformedCandlestickData;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }

  const CustomCandlestick = (props: CustomCandlestickProps) => {
    const { payload, x, y, width, height } = props;
    if (!payload || x === undefined || y === undefined || width === undefined || height === undefined) return null;

    const { open, close, isPositive } = payload;
    const color = isPositive ? '#10B981' : '#EF4444'; // Green for up, red for down

    // Calculate positions
    const centerX = x + width / 2;
    const bodyHeight = Math.abs(close - open);
    const bodyY = y + (height - bodyHeight) / 2;

    return (
      <g>
        {/* High-Low line */}
        <line
          x1={centerX}
          y1={y}
          x2={centerX}
          y2={y + height}
          stroke={color}
          strokeWidth={1}
        />
        {/* Open-Close body */}
        <rect
          x={x + width * 0.2}
          y={bodyY}
          width={width * 0.6}
          height={bodyHeight}
          fill={isPositive ? color : 'transparent'}
          stroke={color}
          strokeWidth={2}
        />
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={transformedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="datetime"
          tickFormatter={(value: string | number) => new Date(value).toLocaleDateString()}
        />
        <YAxis domain={['dataMin - 1', 'dataMax + 1']} />
        <Tooltip
          labelFormatter={(value: string | number) => new Date(value).toLocaleString()}
          formatter={(value: string | number | [number, number], name: string) => {
            if (name === 'highLow' && Array.isArray(value)) return [`${value[0]} - ${value[1]}`, 'High-Low'];
            if (name === 'openClose' && Array.isArray(value)) return [`${value[0]} - ${value[1]}`, 'Open-Close'];
            return [value, name];
          }}
        />
        <Bar
          dataKey="highLow"
          fill="transparent"
          shape={<CustomCandlestick />}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export const ChartRenderer: React.FC<ChartRendererProps> = ({ charts }) => {
  if (!charts || charts.length === 0) {
    return null;
  }

  const renderChart = (chart: ChartConfig, index: number) => {
    const {
      type,
      title,
      data,
      xKey,
      yKey,
      yKeys,
      options = {}
    } = chart;

    const {
      height = 300,
      colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
      showGrid = true,
      showTooltip = true,
      showLegend = true,
      strokeWidth = 2,
      fillOpacity = 0.3,
    } = options;

    if (!data || data.length === 0) {
      return (
        <div key={index} className="p-4 border border-border rounded-lg bg-muted/20">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
          <p className="text-xs text-muted-foreground">No data available for this chart</p>
        </div>
      );
    }

    const chartElement = (() => {
      switch (type) {
        case 'line':
          return (
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey={xKey} />
                <YAxis />
                {showTooltip && <Tooltip />}
                {showLegend && <Legend />}
                {yKeys ? (
                  yKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={colors[i % colors.length]}
                      strokeWidth={strokeWidth}
                      dot={{ r: 3 }}
                    />
                  ))
                ) : yKey ? (
                  <Line
                    type="monotone"
                    dataKey={yKey}
                    stroke={colors[0]}
                    strokeWidth={strokeWidth}
                    dot={{ r: 3 }}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          );

        case 'bar':
          return (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey={xKey} />
                <YAxis />
                {showTooltip && <Tooltip />}
                {showLegend && <Legend />}
                <ReferenceLine y={0} stroke="#666" strokeDasharray="2 2" />
                {yKeys ? (
                  yKeys.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      fill={colors[i % colors.length]}
                    />
                  ))
                ) : yKey ? (
                  <Bar
                    dataKey={yKey}
                    fill={colors[0]}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          );

        case 'area':
          return (
            <ResponsiveContainer width="100%" height={height}>
              <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey={xKey} />
                <YAxis />
                {showTooltip && <Tooltip />}
                {showLegend && <Legend />}
                {yKeys ? (
                  yKeys.map((key, i) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stackId="1"
                      stroke={colors[i % colors.length]}
                      fill={colors[i % colors.length]}
                      fillOpacity={fillOpacity}
                    />
                  ))
                ) : yKey ? (
                  <Area
                    type="monotone"
                    dataKey={yKey}
                    stroke={colors[0]}
                    fill={colors[0]}
                    fillOpacity={fillOpacity}
                  />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
          );

        case 'candlestick':
          return <CandlestickChart data={data as CandlestickDataPoint[]} height={height} title={title} />;

        case 'pie':
          return (
            <ResponsiveContainer width="100%" height={height}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey={yKey || 'value'}
                >
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                {showTooltip && <Tooltip />}
                {showLegend && <Legend />}
              </PieChart>
            </ResponsiveContainer>
          );

        case 'scatter':
          return (
            <ResponsiveContainer width="100%" height={height}>
              <ScatterChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                {showGrid && <CartesianGrid />}
                <XAxis dataKey={xKey} />
                <YAxis dataKey={yKey} />
                {showTooltip && <Tooltip cursor={{ strokeDasharray: '3 3' }} />}
                {showLegend && <Legend />}
                <Scatter fill={colors[0]} />
              </ScatterChart>
            </ResponsiveContainer>
          );

        default:
          return <div>Unsupported chart type: {type}</div>;
      }
    })();

    return (
      <div key={index} className="mb-6 p-4 border border-border rounded-lg bg-card">
        <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
        {chartElement}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {charts.map(renderChart)}
    </div>
  );
};