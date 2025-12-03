/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ToolInvocation,
} from './tools.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

export interface SystemInfoParams {}

export class SystemInfoToolInvocation extends BaseToolInvocation<
  SystemInfoParams,
  ToolResult
> {
  constructor(
    params: SystemInfoParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return 'Get system information';
  }

  async execute(
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const info = {
      platform: os.platform(),
      release: os.release(),
      type: os.type(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GiB`,
      freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GiB`,
      uptime: `${(os.uptime() / 3600).toFixed(2)} hours`,
      loadavg: os.loadavg(),
      hostname: os.hostname(),
    };

    const llmContent = JSON.stringify(info, null, 2);

    return {
      llmContent,
      returnDisplay: llmContent,
    };
  }
}

export class SystemInfoTool extends BaseDeclarativeTool<
  SystemInfoParams,
  ToolResult
> {
  static readonly Name = 'system_info';

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      SystemInfoTool.Name,
      'System Info',
      'Get detailed system information including OS, memory, CPU, and uptime.',
      Kind.Read,
      {
        type: 'object',
        properties: {},
      },
      false, // output is not markdown
      false, // output can be updated
      messageBus,
    );
  }

  protected createInvocation(
    params: SystemInfoParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<SystemInfoParams, ToolResult> {
    return new SystemInfoToolInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
