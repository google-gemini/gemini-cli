/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChartRenderer } from './ChartRenderer';
import type { VisualizationData, ChartConfig } from '@/types';

// Type definitions for market data (matching backend)
interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  pe_ratio?: number;
  timestamp: string;
  source?: string;
}

interface BarData {
  symbol: string;
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
}

interface TechnicalIndicatorData {
  date: string;
  value: number;
  indicator: string;
  symbol: string;
}

interface ScreenerResultData {
  symbol: string;
  description: string;
  price: number;
  change_percent: number;
  volume: number;
  market_cap: number;
  sector: string;
}

interface SignalData {
  symbol: string;
  signal: string;
  strength: number;
  indicators: Record<string, number>;
}

interface SmartVisualizationProps {
  visualizations: VisualizationData[];
}

export const SmartVisualization: React.FC<SmartVisualizationProps> = ({ visualizations }) => {
  const generateChartConfigs = (visualizations: VisualizationData[]): ChartConfig[] => {
    const charts: ChartConfig[] = [];

    visualizations.forEach(viz => {
      switch (viz.type) {
        case 'quotes': {
          const quoteData = viz.data as unknown as QuoteData[];

          // Stock price bar chart
          charts.push({
            type: 'bar',
            title: `${viz.title} - Prices`,
            data: quoteData.map(item => ({
              symbol: item.symbol,
              price: item.price,
              change_percent: item.change_percent
            })),
            xKey: 'symbol',
            yKey: 'price',
            options: {
              height: 300,
              colors: ['#3B82F6'],
              showGrid: true,
              showTooltip: true,
              showLegend: false
            }
          });

          // Price change percentage chart with conditional colors
          if (quoteData.length > 1) {
            charts.push({
              type: 'bar',
              title: `${viz.title} - Change %`,
              data: quoteData.map(item => ({
                symbol: item.symbol,
                change_percent: item.change_percent
              })),
              xKey: 'symbol',
              yKey: 'change_percent',
              options: {
                height: 250,
                colors: quoteData.map(item => item.change_percent >= 0 ? '#10B981' : '#EF4444'),
                showGrid: true,
                showTooltip: true,
                showLegend: false
              }
            });
          }
          break;
        }

        case 'ohlc_bars': {
          const ohlcData = viz.data as unknown as BarData[];

          // Group by symbol for separate charts
          const symbolGroups = ohlcData.reduce((groups: Record<string, BarData[]>, bar: BarData) => {
            const symbol = bar.symbol;
            if (!groups[symbol]) groups[symbol] = [];
            groups[symbol].push(bar);
            return groups;
          }, {});

          Object.entries(symbolGroups).forEach(([symbol, bars]) => {
            // Candlestick chart
            charts.push({
              type: 'candlestick',
              title: `${symbol} - OHLC Chart`,
              data: bars.map(bar => ({
                datetime: new Date(bar.datetime).getTime(),
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume
              })),
              xKey: 'datetime',
              yKeys: ['open', 'high', 'low', 'close'],
              options: {
                height: 400,
                showGrid: true,
                showTooltip: true,
                showLegend: true
              }
            });

            // Volume chart
            charts.push({
              type: 'bar',
              title: `${symbol} - Volume`,
              data: bars.map(bar => ({
                datetime: new Date(bar.datetime).toLocaleDateString(),
                volume: bar.volume
              })),
              xKey: 'datetime',
              yKey: 'volume',
              options: {
                height: 200,
                colors: ['#6366F1'],
                showGrid: true,
                showTooltip: true,
                showLegend: false
              }
            });
          });
          break;
        }

        case 'technical_indicators': {
          const indicatorData = viz.data as unknown as TechnicalIndicatorData[];

          // Group by indicator type
          const indicatorGroups = indicatorData.reduce((groups: Record<string, TechnicalIndicatorData[]>, item: TechnicalIndicatorData) => {
            const indicator = item.indicator;
            if (!groups[indicator]) groups[indicator] = [];
            groups[indicator].push(item);
            return groups;
          }, {});

          Object.entries(indicatorGroups).forEach(([indicator, data]) => {
            charts.push({
              type: 'line',
              title: `${viz.metadata?.symbols?.[0] || 'Chart'} - ${indicator}`,
              data: data.map(item => ({
                date: new Date(item.date).toLocaleDateString(),
                value: item.value,
                timestamp: new Date(item.date).getTime()
              })).sort((a, b) => a.timestamp - b.timestamp),
              xKey: 'date',
              yKey: 'value',
              options: {
                height: 250,
                colors: [getIndicatorColor(indicator)],
                showGrid: true,
                showTooltip: true,
                showLegend: false,
                strokeWidth: 2
              }
            });
          });
          break;
        }

        case 'screener_results': {
          const screenerData = viz.data as unknown as ScreenerResultData[];

          if (screenerData.length > 0) {
            // Market cap distribution pie chart
            charts.push({
              type: 'pie',
              title: 'Market Cap Distribution',
              data: screenerData.slice(0, 10).map(item => ({
                name: item.symbol,
                value: item.market_cap || 0
              })).filter(item => item.value > 0),
              xKey: 'name',
              yKey: 'value',
              options: {
                height: 300,
                colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],
                showTooltip: true,
                showLegend: true
              }
            });

            // Price change scatter plot
            charts.push({
              type: 'scatter',
              title: 'Price vs Change %',
              data: screenerData.map(item => ({
                price: item.price,
                change_percent: item.change_percent,
                symbol: item.symbol
              })),
              xKey: 'price',
              yKey: 'change_percent',
              options: {
                height: 300,
                colors: ['#3B82F6'],
                showGrid: true,
                showTooltip: true,
                showLegend: false
              }
            });
          }
          break;
        }

        case 'signals': {
          const signalData = viz.data as unknown as SignalData[];

          // Signal strength distribution
          if (signalData.length > 0) {
            charts.push({
              type: 'bar',
              title: 'Signal Strength Distribution',
              data: signalData.map(item => ({
                symbol: item.symbol,
                strength: item.strength,
                signal: item.signal
              })),
              xKey: 'symbol',
              yKey: 'strength',
              options: {
                height: 250,
                colors: signalData.map(item => getSignalColor(item.signal)),
                showGrid: true,
                showTooltip: true,
                showLegend: false
              }
            });
          }
          break;
        }

        default:
          // Generic data visualization - try to find numeric columns
          if (viz.data.length > 0) {
            const firstItem = viz.data[0];
            const numericKeys = Object.keys(firstItem).filter(key =>
              typeof firstItem[key] === 'number'
            );

            if (numericKeys.length > 0) {
              charts.push({
                type: 'line',
                title: viz.title,
                data: viz.data,
                xKey: Object.keys(firstItem)[0], // Use first key as X
                yKey: numericKeys[0], // Use first numeric key as Y
                options: {
                  height: 300,
                  colors: ['#3B82F6'],
                  showGrid: true,
                  showTooltip: true,
                  showLegend: false
                }
              });
            }
          }
          break;
      }
    });

    return charts;
  };

  const getIndicatorColor = (indicator: string): string => {
    const colorMap: Record<string, string> = {
      'SMA': '#3B82F6',    // Blue
      'EMA': '#10B981',    // Green
      'WMA': '#8B5CF6',    // Purple
      'RSI': '#F59E0B',    // Orange
      'MACD': '#EF4444',   // Red
      'MACD_Signal': '#EC4899', // Pink
      'BOLL_Upper': '#6366F1', // Indigo
      'BOLL_Middle': '#8B5CF6', // Purple
      'BOLL_Lower': '#06B6D4', // Cyan
      'KDJ_K': '#F59E0B',   // Orange
      'KDJ_D': '#10B981',   // Green
      'KDJ_J': '#EF4444',   // Red
      'STOCH_K': '#8B5CF6', // Purple
      'STOCH_D': '#06B6D4', // Cyan
      'CCI': '#F97316',     // Orange-600
      'ADX': '#84CC16',     // Lime
      'ATR': '#6366F1',     // Indigo
      'FIBONACCI': '#EC4899' // Pink
    };

    const baseName = indicator.split('_')[0];
    return colorMap[indicator] || colorMap[baseName] || '#6B7280';
  };

  const getSignalColor = (signal: string): string => {
    const colorMap: Record<string, string> = {
      'buy': '#10B981',
      'strong_buy': '#059669',
      'sell': '#EF4444',
      'strong_sell': '#DC2626',
      'neutral': '#6B7280'
    };
    return colorMap[signal] || '#6B7280';
  };

  if (!visualizations || visualizations.length === 0) {
    return null;
  }

  const chartConfigs = generateChartConfigs(visualizations);

  if (chartConfigs.length === 0) {
    return null;
  }

  return <ChartRenderer charts={chartConfigs} />;
};