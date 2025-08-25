/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

/**
 * Essential VS Code environment variables for TMUX
 */
const ESSENTIAL_VSCODE_VARS = [
  'GEMINI_CLI_IDE_SERVER_PORT',
  'GEMINI_CLI_IDE_WORKSPACE_PATH',
  'VSCODE_GIT_ASKPASS_NODE',
  'VSCODE_GIT_ASKPASS_MAIN',
  'VSCODE_GIT_IPC_HANDLE',
];

/**
 * Syncs VS Code environment to TMUX with debugging (will remove once approved)
 */
export function syncVsCodeEnvironmentToTmux(): void {
  if (!process.env['TMUX']) return;

  for (const envVar of ESSENTIAL_VSCODE_VARS) {
    const value = process.env[envVar];
    if (value) {
      try {
        execSync(`tmux set-environment -g ${envVar} "${value}"`, {
          timeout: 2000,
          stdio: 'ignore',
        });
      } catch {
        // Skip failed syncs
      }
    }
  }
}

/**
 * Detects VS Code port - always use active discovery in TMUX to avoid stale ports
 */
export function detectCurrentVsCodePort(): string | undefined {
  if (!process.env['TMUX']) {
    return process.env['GEMINI_CLI_IDE_SERVER_PORT'];
  }

  // In TMUX, always do active port discovery to avoid stale cached ports
  return discoverActiveVsCodePort();
}

/**
 * Uses process-based detection and dynamic port discovery
 */
function discoverActiveVsCodePort(): string | undefined {
  // Method 1: Find VS Code processes and their listening ports
  const portFromProcess = findVsCodeProcessPort();
  if (portFromProcess) {
    return portFromProcess;
  }

  // Method 2: Test all listening ports for MCP endpoint
  const portFromMcp = findMcpEndpointPort();
  if (portFromMcp) {
    return portFromMcp;
  }

  return undefined;
}

/**
 * Find VS Code processes and extract their listening ports
 */
function findVsCodeProcessPort(): string | undefined {
  try {
    // Find all VS Code-related processes with their network connections
    const vsCodeProcs = execSync(
      'lsof -iTCP -sTCP:LISTEN -c Code -c code -c cursor -c Cursor',
      {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );

    if (vsCodeProcs.trim()) {
      // Extract ports from VS Code processes
      const portMatches = vsCodeProcs.match(/:(\d+)/g);
      if (portMatches) {
        for (const match of portMatches) {
          const port = match.substring(1);
          if (testMcpEndpoint(port)) {
            return port;
          }
        }
      }
    }
  } catch {
    // VS Code process detection failed
  }

  return undefined;
}

/**
 * Find MCP endpoint by testing all listening ports
 */
function findMcpEndpointPort(): string | undefined {
  try {
    // Get all listening TCP ports
    const allPorts = execSync('lsof -iTCP -sTCP:LISTEN -n -P', {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // Extract all unique ports
    const portMatches = allPorts.match(/:(\d+)/g);
    if (portMatches) {
      const uniquePorts = [
        ...new Set(portMatches.map((match) => match.substring(1))),
      ];

      // Test ports in smart order: higher ports first (VS Code tends to use higher ports)
      const sortedPorts = uniquePorts
        .map((p) => parseInt(p, 10))
        .filter((p) => p > 1024) // Skip system ports
        .sort((a, b) => b - a) // Higher ports first
        .slice(0, 20); // Limit to first 20 to avoid excessive testing

      for (const port of sortedPorts) {
        if (testMcpEndpoint(port.toString())) {
          return port.toString();
        }
      }
    }
  } catch {
    // Port discovery failed
  }

  return undefined;
}

/**
 * Test if a port responds to MCP endpoint
 */
function testMcpEndpoint(port: string): boolean {
  try {
    execSync(`curl -s --connect-timeout 1 http://localhost:${port}/mcp`, {
      timeout: 2000,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}
