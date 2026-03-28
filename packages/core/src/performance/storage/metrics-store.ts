/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { PerformanceData, RegressionReport } from '../types.js';

// ----- Escaping utilities for safe output -----
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCsv(str: string): string {
  // If the string contains commas, quotes, or newlines, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export class MetricsStore {
  private storageDir: string;

  constructor() {
    this.storageDir = path.join(os.homedir(), '.gemini', 'metrics');
  }

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 });

      // Enforce permissions if directory already exists
      try {
        await fs.chmod(this.storageDir, 0o700);
      } catch {
        // Ignore chmod errors (e.g., Windows)
      }
    } catch (_error) {
      // Ignore if directory exists or cannot be created
    }
  }

  async saveMetrics(metrics: PerformanceData): Promise<string> {
    await this.init();
    const filename = `metrics-${metrics.version}-${Date.now()}.json`;
    const filepath = path.join(this.storageDir, filename);
    await fs.writeFile(filepath, JSON.stringify(metrics, null, 2), {
      mode: 0o600,
    });
    return filepath;
  }

  async saveReport(
    report: RegressionReport,
    customPath?: string,
  ): Promise<string> {
    await this.init();
    const filename = customPath || `regression-report-${Date.now()}.json`;
    const filepath = path.join(this.storageDir, filename);
    await fs.writeFile(filepath, JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
    return filepath;
  }

  async loadRecentMetrics(limit = 10): Promise<PerformanceData[]> {
    await this.init();
    const files = await fs.readdir(this.storageDir);
    const jsonFiles = files
      .filter((f) => f.startsWith('metrics-') && f.endsWith('.json'))
      .map((f) => path.join(this.storageDir, f))
      .sort()
      .reverse()
      .slice(0, limit);

    const metrics: PerformanceData[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        metrics.push(JSON.parse(content));
      } catch (_error) {
        // Skip invalid files
      }
    }
    return metrics;
  }

  async exportMetrics(
    format: 'json' | 'csv' | 'html',
    metrics: PerformanceData,
    customPath?: string,
  ): Promise<string> {
    await this.init();

    let filename: string;
    let content: string;

    switch (format) {
      case 'json':
        filename = customPath || `export-${Date.now()}.json`;
        content = JSON.stringify(metrics, null, 2);
        break;

      case 'csv':
        filename = customPath || `export-${Date.now()}.csv`;
        content = this.convertToCSV(metrics);
        break;

      case 'html':
        filename = customPath || `export-${Date.now()}.html`;
        content = this.convertToHTML(metrics);
        break;

      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    const filepath = path.join(this.storageDir, filename);
    // Secure file permissions: only owner can read/write
    await fs.writeFile(filepath, content, { mode: 0o600 });
    return filepath;
  }

  private convertToCSV(metrics: PerformanceData): string {
    const rows: string[] = ['timestamp,metric,category,value,unit'];
    const timestamp = metrics.timestamp;

    // Memory metrics
    rows.push(
      `${timestamp},heap_used,memory,${metrics.memory.current.heapUsed},bytes`,
    );
    rows.push(
      `${timestamp},heap_total,memory,${metrics.memory.current.heapTotal},bytes`,
    );
    rows.push(`${timestamp},rss,memory,${metrics.memory.current.rss},bytes`);

    // Startup phases
    metrics.startup.phases.forEach((phase) => {
      // phase.name is user-controlled (could contain commas, quotes)
      const escapedName = escapeCsv(phase.name);
      rows.push(
        `${timestamp},startup_${escapedName},startup,${phase.duration},ms`,
      );
    });

    // Tool stats
    Object.entries(metrics.tools.stats).forEach(([tool, stats]) => {
      const escapedTool = escapeCsv(tool);
      rows.push(
        `${timestamp},tool_${escapedTool}_calls,tool,${stats.callCount},count`,
      );
      rows.push(
        `${timestamp},tool_${escapedTool}_avg_time,tool,${stats.avgTime},ms`,
      );
      rows.push(
        `${timestamp},tool_${escapedTool}_success_rate,tool,${stats.successRate},percent`,
      );
    });

    // Session stats
    rows.push(
      `${timestamp},session_duration,session,${metrics.session.current.duration},seconds`,
    );
    rows.push(
      `${timestamp},session_tokens,session,${metrics.session.current.tokens.total},tokens`,
    );
    rows.push(
      `${timestamp},session_files,session,${metrics.session.current.filesModified},count`,
    );

    return rows.join('\n');
  }

  private convertToHTML(metrics: PerformanceData): string {
    const formatBytes = (bytes: number) => {
      const mb = bytes / (1024 * 1024);
      return mb.toFixed(2) + ' MB';
    };

    // Tool rows: escape tool names and numeric values (numbers are safe, but we escape anyway)
    const toolRows = Object.entries(metrics.tools.stats)
      .map(
        ([tool, stats]) => `
         <tr>
           <td>${escapeHtml(tool)}</td>
           <td>${stats.callCount}</td>
           <td>${stats.avgTime.toFixed(0)} ms</td>
           <td>${stats.successRate.toFixed(1)}%</td>
         </tr>
      `,
      )
      .join('');

    // Startup phases rows
    const phaseRows = metrics.startup.phases
      .map(
        (phase) => `
         <tr>
           <td>${escapeHtml(phase.name)}</td>
           <td>${phase.duration}ms</td>
           <td>${phase.percentage.toFixed(1)}%</td>
         </tr>
      `,
      )
      .join('');

    // Suggestions list
    const suggestionsHtml =
      metrics.startup.suggestions.length > 0
        ? `
        <h3>💡 Optimization Suggestions</h3>
        <ul>
          ${metrics.startup.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      `
        : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none';">
  <title>Gemini CLI Performance Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 30px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; }
    .section { background: white; margin: 20px 0; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
    .metric-card { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #1a73e8; }
    .metric-value { font-size: 24px; font-weight: bold; color: #1a73e8; }
    .metric-label { color: #5f6368; font-size: 14px; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th { background: #1a73e8; color: white; padding: 10px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #e0e0e0; }
    tr:hover { background: #f5f5f5; }
    .warning { color: #ea4335; }
    .success { color: #34a853; }
    .footer { margin-top: 30px; color: #5f6368; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Gemini CLI Performance Report</h1>
    <p>Generated: ${escapeHtml(new Date(metrics.timestamp).toLocaleString())}</p>
    <p>Version: ${escapeHtml(metrics.version)}</p>

    <div class="section">
      <h2>📊 System Information</h2>
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-value">${escapeHtml(process.version)}</div>
          <div class="metric-label">Node Version</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${escapeHtml(process.platform)}</div>
          <div class="metric-label">Platform</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${escapeHtml(String(process.pid))}</div>
          <div class="metric-label">Process ID</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${escapeHtml(String(Math.floor(process.uptime() / 60)))}m</div>
          <div class="metric-label">Uptime</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>💾 Memory Usage</h2>
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-value">${escapeHtml(formatBytes(metrics.memory.current.heapUsed))}</div>
          <div class="metric-label">Heap Used</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${escapeHtml(formatBytes(metrics.memory.current.heapTotal))}</div>
          <div class="metric-label">Heap Total</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${escapeHtml(((metrics.memory.current.heapUsed / metrics.memory.current.heapTotal) * 100).toFixed(1))}%</div>
          <div class="metric-label">Heap Usage</div>
        </div>
        <div class="metric-card">
          <div class="metric-value ${metrics.memory.trend.direction === 'increasing' ? 'warning' : 'success'}">
            ${escapeHtml(metrics.memory.trend.direction)}
          </div>
          <div class="metric-label">Trend</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>🚀 Startup Time</h2>
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-value">${metrics.startup.total}ms</div>
          <div class="metric-label">Total Startup Time</div>
        </div>
      </div>
      
      <h3>Startup Phases</h3>
      <table>
        <thead>
          <tr>
            <th>Phase</th>
            <th>Duration</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${phaseRows}
        </tbody>
      </table>

      ${suggestionsHtml}
    </div>

    <div class="section">
      <h2>🔧 Tool Execution</h2>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Calls</th>
            <th>Avg Time</th>
            <th>Success Rate</th>
          </tr>
        </thead>
        <tbody>
          ${toolRows}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>📝 Session Statistics</h2>
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-value">${metrics.session.current.duration}s</div>
          <div class="metric-label">Session Duration</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.session.current.tokens.total}</div>
          <div class="metric-label">Total Tokens</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.session.current.toolsCalled.length}</div>
          <div class="metric-label">Tools Used</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${metrics.session.current.filesModified}</div>
          <div class="metric-label">Files Modified</div>
        </div>
      </div>
    </div>

    <div class="footer">
      Report generated by Gemini CLI Performance Dashboard
    </div>
  </div>
</body>
</html>
    `;
  }
}
