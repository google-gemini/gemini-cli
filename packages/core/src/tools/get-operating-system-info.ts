/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parameters for the GetOperatingSystemInfo tool.
 */
export interface GetOperatingSystemInfoToolParams {
  /**
   * Optional: Specifies the category of information to retrieve.
   * If not provided, general OS information (like OS type, release) will be returned.
   *
   * Possible values:
   *  - 'cpu': Detailed CPU information (architecture, cores, usage).
   *  - 'memory': Detailed memory information (total, free, used).
   *  - 'disk': Detailed disk space information (for relevant partitions).
   *  - 'network': Basic network interface information (IP addresses).
   *  - 'all': Returns all available information categories.
   */
  detail?: 'cpu' | 'memory' | 'disk' | 'network' | 'all';
}

/**
 * Structure for CPU information.
 */
export interface CpuInfo {
  architecture: string;
  model: string;
  cores: number;
  speed?: string; // e.g., "2.8 GHz"
  // Potentially add load average or per-core usage if feasible and secure
}

/**
 * Structure for Memory information.
 */
export interface MemoryInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  // Potentially swap usage
}

/**
 * Structure for Disk information.
 */
export interface DiskInfo {
  filesystem: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  mountpoint: string;
}

/**
 * Structure for Network interface information.
 */
export interface NetworkInterfaceInfo {
  name: string;
  ip4Address?: string;
  ip6Address?: string;
  macAddress?: string;
}

/**
 * The result structure for the GetOperatingSystemInfo tool.
 * The exact fields returned will depend on the 'detail' parameter.
 */
export interface GetOperatingSystemInfoToolResult {
  osType: string; // e.g., 'Linux', 'Darwin', 'Windows_NT'
  osRelease: string; // e.g., kernel version or OS build number
  hostname: string;
  uptimeSeconds?: number; // System uptime

  cpuInfo?: CpuInfo;
  memoryInfo?: MemoryInfo;
  diskInfo?: DiskInfo[]; // Array because there can be multiple disks/partitions
  networkInfo?: NetworkInterfaceInfo[]; // Array for multiple network interfaces
}

// --- Tool Implementation Starts Here ---

import * as os from 'os';
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';

export class GetOperatingSystemInfoTool extends BaseTool<
  GetOperatingSystemInfoToolParams,
  ToolResult // Using generic ToolResult for now, will refine if specific display needed
> {
  static readonly Name = 'get_operating_system_info';

  constructor() {
    super(
      GetOperatingSystemInfoTool.Name,
      'Get OS Info',
      'Retrieves information about the operating system and hardware environment of the device where the agent is running. Can provide general OS details or specific information about CPU, memory, disk, or network.',
      {
        type: 'object',
        properties: {
          detail: {
            type: 'string',
            enum: ['cpu', 'memory', 'disk', 'network', 'all'],
            description:
              "Optional: Specifies the category of information to retrieve (e.g., 'cpu', 'memory', 'disk', 'network', 'all'). If not provided, general OS information is returned.",
          },
        },
      },
      true, // isOutputMarkdown (tool output will be formatted as markdown for LLM)
      false, // canUpdateOutput
    );
  }

  validateToolParams(
    params: GetOperatingSystemInfoToolParams,
  ): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    return null;
  }

  getDescription(params: GetOperatingSystemInfoToolParams): string {
    if (params.detail) {
      return `Get ${params.detail} information for the current operating system.`;
    }
    return 'Get general information for the current operating system.';
  }

  private async _getCpuInfo(): Promise<CpuInfo> {
    const cpus = os.cpus();
    const firstCpu = cpus[0];
    return {
      architecture: os.arch(),
      model: firstCpu?.model || 'N/A',
      cores: cpus.length,
      speed: firstCpu?.speed ? `${firstCpu.speed} MHz` : undefined,
    };
  }

  private async _getMemoryInfo(): Promise<MemoryInfo> {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    return {
      totalBytes,
      freeBytes,
      usedBytes: totalBytes - freeBytes,
    };
  }

  // NOTE: Disk info is platform-dependent and might require external libraries
  // or shell commands for a comprehensive implementation.
  // This will be a simplified version using available Node.js info or placeholders.
  private async _getDiskInfo(): Promise<DiskInfo[]> {
    // Placeholder: Node.js 'os' module doesn't directly provide disk space info.
    // A real implementation might use 'child_process' to call 'df' (on Unix)
    // or 'wmic' (on Windows), or use a library like 'check-disk-space'.
    // For now, we'll return a simplified or empty array.
    return [
      {
        filesystem: 'N/A (Detail requires platform-specific implementation)',
        sizeBytes: 0,
        usedBytes: 0,
        availableBytes: 0,
        mountpoint: os.homedir(), // Example: show homedir as a relevant path
      },
    ];
  }

  private async _getNetworkInfo(): Promise<NetworkInterfaceInfo[]> {
    const interfaces = os.networkInterfaces();
    const results: NetworkInterfaceInfo[] = [];
    for (const name of Object.keys(interfaces)) {
      const netInterface = interfaces[name];
      if (netInterface) {
        const ip4 = netInterface.find((details) => details.family === 'IPv4' && !details.internal);
        const ip6 = netInterface.find((details) => details.family === 'IPv6' && !details.internal);
        results.push({
          name,
          ip4Address: ip4?.address,
          ip6Address: ip6?.address,
          macAddress: ip4?.mac || netInterface[0]?.mac, // Fallback to first MAC if IPv4 not found
        });
      }
    }
    return results;
  }

  async execute(
    params: GetOperatingSystemInfoToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters. ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      const result: GetOperatingSystemInfoToolResult = {
        osType: os.type(),
        osRelease: os.release(),
        hostname: os.hostname(),
        uptimeSeconds: os.uptime(),
      };

      const detail = params.detail;

      if (detail === 'cpu' || detail === 'all') {
        result.cpuInfo = await this._getCpuInfo();
      }
      if (detail === 'memory' || detail === 'all') {
        result.memoryInfo = await this._getMemoryInfo();
      }
      if (detail === 'disk' || detail === 'all') {
        result.diskInfo = await this._getDiskInfo();
      }
      if (detail === 'network' || detail === 'all') {
        result.networkInfo = await this._getNetworkInfo();
      }

      // For LLM, stringify the JSON result.
      // For display, we can also use the stringified JSON or a more formatted string.
      const llmContent = JSON.stringify(result, null, 2);
      // A more user-friendly display could be generated here if needed,
      // but for now, the raw JSON is fine for an agent-focused tool.
      // Example: `OS: ${result.osType} ${result.osRelease}, CPU: ${result.cpuInfo?.cores} cores`
      const returnDisplay = "```json\n" + llmContent + "\n```";


      return {
        llmContent,
        returnDisplay,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'An unknown error occurred';
      console.error(`Error in GetOperatingSystemInfoTool: ${errorMsg}`, error);
      return {
        llmContent: `Error retrieving OS information: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}
