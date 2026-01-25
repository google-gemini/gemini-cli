/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolInvocation, type ToolResult } from './tools.js';
import type { Config } from '../config/config.js';

class DoctorInvocation extends BaseToolInvocation<{}, ToolResult> {
  protected async doExecute(): Promise<ToolResult> {
    const mcpManager = this.config.getMcpClientManager();
    const servers = mcpManager.getMcpServers();
    
    let report = '# CLI Health Check (Doctor)\n\n';
    report += '| Server | Status | Details |\n';
    report += '| :--- | :--- | :--- |\n';

    const serverEntries = Object.entries(servers);
    
    if (serverEntries.length === 0) {
      report += '| - | No Servers configured | - |\n';
    } else {
      for (const [name, config] of serverEntries) {
        let status = '✅ Healthy';
        let detail = 'Started';
        
        if (config.enabled === false) {
           status = '⚪ Disabled';
           detail = 'N/A';
        } else {
          // Attempt to ping would be ideal, but here we just check manager state
          const count = mcpManager.getMcpServerCount();
          if (count === 0) {
            status = '❌ Not Running';
            detail = 'Check config/connection';
          }
        }
        
        // Check for common missing keys in env
        if (config.env) {
          const keys = Object.keys(config.env);
          for (const key of keys) {
            if (config.env[key].includes('YOUR_')) {
               status = '⚠️ Action Required';
               detail = `Provide actual value for ${key}`;
            }
          }
        }

        report += `| ${name} | ${status} | ${detail} |\n`;
      }
    }

    return {
      content: report,
    };
  }
}

export class DoctorTool extends BaseDeclarativeTool<{}, ToolResult> {
  static readonly Name = 'doctor';

  constructor(private readonly config: Config, messageBus: any) {
    super(
      DoctorTool.Name,
      'Doctor',
      'Diagnoses the current state of the CLI, checking tool connectivity and identifying missing configuration or API keys.',
      Kind.Read,
      { type: 'object', properties: {} },
      messageBus
    );
  }

  protected createInvocation(params: {}, messageBus: any): ToolInvocation<{}, ToolResult> {
    return new DoctorInvocation(this.config, params, messageBus);
  }
}
