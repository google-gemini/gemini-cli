/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetOperatingSystemInfoTool, GetOperatingSystemInfoToolParams, GetOperatingSystemInfoToolResult } from './get-operating-system-info';
import * as os from 'os';

// Mock the 'os' module
vi.mock('os', async (importOriginal) => {
  const originalOs = await importOriginal<typeof os>();
  return {
    ...originalOs, // Import and spread all original exports
    type: vi.fn(),
    release: vi.fn(),
    hostname: vi.fn(),
    uptime: vi.fn(),
    arch: vi.fn(),
    cpus: vi.fn(),
    totalmem: vi.fn(),
    freemem: vi.fn(),
    networkInterfaces: vi.fn(),
    homedir: vi.fn(() => '/mock/home'), // Mock homedir for disk info placeholder
  };
});

const mockedOs = vi.mocked(os);

describe('GetOperatingSystemInfoTool', () => {
  let tool: GetOperatingSystemInfoTool;

  beforeEach(() => {
    tool = new GetOperatingSystemInfoTool();

    // Reset mocks before each test
    mockedOs.type.mockReturnValue('MockOS');
    mockedOs.release.mockReturnValue('1.0.0');
    mockedOs.hostname.mockReturnValue('mockhost');
    mockedOs.uptime.mockReturnValue(12345);
    mockedOs.arch.mockReturnValue('mock-arch');
    mockedOs.cpus.mockReturnValue([
      { model: 'Mock CPU Model', speed: 2500, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
      { model: 'Mock CPU Model', speed: 2500, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
    ] as os.CpuInfo[]);
    mockedOs.totalmem.mockReturnValue(8 * 1024 * 1024 * 1024); // 8 GB
    mockedOs.freemem.mockReturnValue(4 * 1024 * 1024 * 1024); // 4 GB
    mockedOs.networkInterfaces.mockReturnValue({
      lo0: [
        { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true },
        { address: '::1', netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', family: 'IPv6', mac: '00:00:00:00:00:00', internal: true },
      ],
      eth0: [
        { address: '192.168.1.100', netmask: '255.255.255.0', family: 'IPv4', mac: '01:23:45:67:89:ab', internal: false },
        { address: 'fe80::123:45ff:fe67:89ab', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '01:23:45:67:89:ab', internal: false },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct name, description, and schema', () => {
    expect(tool.name).toBe('get_operating_system_info');
    expect(tool.displayName).toBe('Get OS Info');
    expect(tool.description).toBeDefined();
    expect(tool.schema).toBeDefined();
    // Access parameters through tool.schema.parameters.properties
    expect(tool.schema.parameters?.properties?.detail?.enum).toEqual(['cpu', 'memory', 'disk', 'network', 'all']);
  });

  it('should validate parameters correctly', () => {
    expect(tool.validateToolParams({})).toBeNull();
    expect(tool.validateToolParams({ detail: 'cpu' })).toBeNull();
    // Ensure the schema validator is actually catching this.
    // The schema is defined with an enum, so invalid_detail should fail.
    const validationResult = tool.validateToolParams({ detail: 'invalid_detail' } as GetOperatingSystemInfoToolParams);
    expect(validationResult).toMatch(/Parameters failed schema validation./);
  });

  it('should return general OS info by default', async () => {
    const result = await tool.execute({} as GetOperatingSystemInfoToolParams, new AbortController().signal);
    const parsedResult: GetOperatingSystemInfoToolResult = JSON.parse(result.llmContent as string);

    expect(parsedResult.osType).toBe('MockOS');
    expect(parsedResult.osRelease).toBe('1.0.0');
    expect(parsedResult.hostname).toBe('mockhost');
    expect(parsedResult.uptimeSeconds).toBe(12345);
    expect(parsedResult.cpuInfo).toBeUndefined();
    expect(parsedResult.memoryInfo).toBeUndefined();
    expect(parsedResult.diskInfo).toBeUndefined();
    expect(parsedResult.networkInfo).toBeUndefined();
    expect(result.returnDisplay).toContain('"osType": "MockOS"');
  });

  it('should return CPU info when detail is "cpu"', async () => {
    const result = await tool.execute({ detail: 'cpu' }, new AbortController().signal);
    const parsedResult: GetOperatingSystemInfoToolResult = JSON.parse(result.llmContent as string);

    expect(parsedResult.cpuInfo).toBeDefined();
    expect(parsedResult.cpuInfo?.architecture).toBe('mock-arch');
    expect(parsedResult.cpuInfo?.model).toBe('Mock CPU Model');
    expect(parsedResult.cpuInfo?.cores).toBe(2);
    expect(parsedResult.cpuInfo?.speed).toBe('2500 MHz');
    expect(result.returnDisplay).toContain('"architecture": "mock-arch"');
  });

  it('should return Memory info when detail is "memory"', async () => {
    const result = await tool.execute({ detail: 'memory' }, new AbortController().signal);
    const parsedResult: GetOperatingSystemInfoToolResult = JSON.parse(result.llmContent as string);

    expect(parsedResult.memoryInfo).toBeDefined();
    expect(parsedResult.memoryInfo?.totalBytes).toBe(8 * 1024 * 1024 * 1024);
    expect(parsedResult.memoryInfo?.freeBytes).toBe(4 * 1024 * 1024 * 1024);
    expect(parsedResult.memoryInfo?.usedBytes).toBe(4 * 1024 * 1024 * 1024);
    expect(result.returnDisplay).toContain('"totalBytes": 8589934592');
  });

  it('should return Disk info (placeholder) when detail is "disk"', async () => {
    const result = await tool.execute({ detail: 'disk' }, new AbortController().signal);
    const parsedResult: GetOperatingSystemInfoToolResult = JSON.parse(result.llmContent as string);

    expect(parsedResult.diskInfo).toBeDefined();
    expect(parsedResult.diskInfo?.length).toBeGreaterThanOrEqual(1);
    expect(parsedResult.diskInfo?.[0].filesystem).toContain('N/A');
    expect(parsedResult.diskInfo?.[0].mountpoint).toBe('/mock/home');
    expect(result.returnDisplay).toContain('"filesystem": "N/A');
  });

  it('should return Network info when detail is "network"', async () => {
    const result = await tool.execute({ detail: 'network' }, new AbortController().signal);
    const parsedResult: GetOperatingSystemInfoToolResult = JSON.parse(result.llmContent as string);

    expect(parsedResult.networkInfo).toBeDefined();
    expect(parsedResult.networkInfo?.length).toBeGreaterThanOrEqual(1);
    const eth0 = parsedResult.networkInfo?.find(iface => iface.name === 'eth0');
    expect(eth0).toBeDefined();
    expect(eth0?.ip4Address).toBe('192.168.1.100');
    expect(eth0?.ip6Address).toBe('fe80::123:45ff:fe67:89ab');
    expect(eth0?.macAddress).toBe('01:23:45:67:89:ab');
    expect(result.returnDisplay).toContain('"name": "eth0"');
  });

  it('should return all info when detail is "all"', async () => {
    const result = await tool.execute({ detail: 'all' }, new AbortController().signal);
    const parsedResult: GetOperatingSystemInfoToolResult = JSON.parse(result.llmContent as string);

    expect(parsedResult.osType).toBe('MockOS');
    expect(parsedResult.cpuInfo).toBeDefined();
    expect(parsedResult.memoryInfo).toBeDefined();
    expect(parsedResult.diskInfo).toBeDefined();
    expect(parsedResult.networkInfo).toBeDefined();
    expect(result.returnDisplay).toContain('"architecture": "mock-arch"');
    expect(result.returnDisplay).toContain('"totalBytes": 8589934592');
  });

  it('should return correct description', () => {
    expect(tool.getDescription({})).toBe('Get general information for the current operating system.');
    expect(tool.getDescription({ detail: 'cpu' })).toBe('Get cpu information for the current operating system.');
    expect(tool.getDescription({ detail: 'all' })).toBe('Get all information for the current operating system.');
  });

  it('should handle errors during os calls gracefully', async () => {
    mockedOs.type.mockImplementation(() => { throw new Error('OS type error'); });
    const result = await tool.execute({}, new AbortController().signal);
    expect(result.llmContent).toContain('Error retrieving OS information: OS type error');
    expect(result.returnDisplay).toContain('Error: OS type error');
  });
});
