/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../../utils/debugLogger.js';
import type { Config } from '../../config/config.js';
import module from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { Storage } from '../../config/storage.js';
import type { McpClient } from '../../tools/mcp-client.js';

type Browser = import('playwright').Browser;
type Page = import('playwright').Page;

import { getFreePort } from '../../utils/net.js';

export class BrowserManager {
  private mcpClient: McpClient | undefined;
  private browser: Browser | undefined;
  private page: Page | undefined;
  private remoteDebuggingPort: number | undefined;

  constructor(private config: Config) {}

  async getMcpClient(): Promise<McpClient> {
    // Always ensure our own dedicated browser connection
    if (this.mcpClient && this.mcpClient.getStatus() === 'connected') {
      return this.mcpClient;
    }
    await this.ensureConnection();
    if (!this.mcpClient) {
      throw new Error('Failed to initialize chrome-devtools MCP client');
    }
    return this.mcpClient;
  }

  async getPage(printOutput?: (message: string) => void): Promise<Page> {
    // Always ensure we have a Playwright page for visual operations
    if (!this.page) {
      await this.ensureBrowserLaunched(printOutput);
    }
    if (!this.page) {
      throw new Error('Browser page not available');
    }
    return this.page;
  }

  async ensureConnection() {
    // Always launch our own browser and connect MCP to it
    await this.ensureBrowserLaunched();
  }

  private async ensureBrowserLaunched(printOutput?: (message: string) => void) {
    // Get a free port if we haven't already
    if (!this.remoteDebuggingPort) {
      this.remoteDebuggingPort = await getFreePort();
    }
    const port = this.remoteDebuggingPort;

    // Launch Browser via Playwright (if not running)
    if (!this.browser || !this.browser.isConnected()) {
      await this.launchBrowser(port, printOutput);
    }

    // Connect MCP Client (if not connected)
    if (!this.mcpClient || this.mcpClient.getStatus() !== 'connected') {
      await this.connectMcp(port);
    }
  }

  private async launchBrowser(
    port: number,
    printOutput?: (message: string) => void,
  ) {
    let chromium;
    try {
      const playwright = await import('playwright');
      chromium = playwright.chromium || playwright.default?.chromium;
    } catch (_e) {
      try {
        const requireUser = module.createRequire(
          path.join(process.cwd(), 'package.json'),
        );
        const playwrightPath = requireUser.resolve('playwright');
        const playwright = await import(playwrightPath);
        chromium = playwright.chromium || playwright.default?.chromium;
      } catch (_e2) {
        // Fallback: Managed installation in ~/.gemini/dependencies
        chromium = await this.ensureManagedPlaywrightAvailable(printOutput);
      }
    }
    debugLogger.log('Launching Chrome via Playwright...');
    const settings = this.config.browserAgentSettings;
    const headless = settings?.headless ?? false;

    // Launch with remote debugging for MCP to attach
    // Use fixed 1024x1024 window to provide consistent viewport
    try {
      this.browser = await chromium.launch({
        headless,
        args: [`--remote-debugging-port=${port}`, '--window-size=1024,1024'],
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const msg = `Failed to launch browser: ${errorMessage}. Executable path: ${chromium.executablePath()}`;
      debugLogger.error(msg);
      throw error;
    }
    const context = await this.browser!.newContext({
      viewport: null, // Let window size dictate viewport. Fallback handles dimension retrieval.
    });
    this.page = await context.newPage();

    debugLogger.log(`Browser launched successfully on port ${port}.`);
  }

  private async connectMcp(port: number) {
    const mcpManager = this.config.getMcpClientManager();
    if (!mcpManager) {
      throw new Error('MCP Client Manager not available in config');
    }

    // Use unique client name based on port to avoid conflicts
    // Each browser agent instance gets its own MCP client
    const clientName = `chrome-devtools-${port}`;
    let client = mcpManager.getClient(clientName);

    if (!client) {
      debugLogger.log(
        `Registering chrome-devtools-mcp server (${clientName}) dynamically...`,
      );

      // Use --browser-url to connect to the Playwright-launched browser
      // instead of launching a new one
      const browserUrl = `http://127.0.0.1:${port}`;
      const args = [
        '-y',
        'chrome-devtools-mcp@0.12.1',
        '--browser-url',
        browserUrl,
      ];

      await mcpManager.maybeDiscoverMcpServer(clientName, {
        command: 'npx',
        args,
      });

      client = mcpManager.getClient(clientName);
    }

    if (!client) {
      throw new Error('Failed to initialize chrome-devtools MCP client');
    }

    if (client.getStatus() !== 'connected') {
      await client.connect();
    }

    this.mcpClient = client;
  }

  private async installPlaywright(
    cwd: string,
    log?: (message: string) => void,
  ): Promise<void> {
    // We use spawn to inherit stdio so user sees progress
    const { spawn } = await import('node:child_process');

    // Pre-flight check for npm
    await new Promise<void>((resolve, reject) => {
      const check = spawn('npm', ['--version'], {
        stdio: 'ignore',
        shell: true,
      });
      check.on('close', (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              'npm is required to install the browser agent components, but it was not found in your PATH.',
            ),
          );
      });
      check.on('error', () =>
        reject(
          new Error(
            'npm is required to install the browser agent components, but it was not found in your PATH.',
          ),
        ),
      );
    });

    const installPackage = () =>
      new Promise<void>((resolve, reject) => {
        const npm = spawn('npm', ['install', 'playwright'], {
          cwd,
          stdio: 'inherit',
          shell: true,
        });
        npm.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(`npm install playwright exited with code ${code}`),
            );
          }
        });
        npm.on('error', reject);
      });

    const installBrowsers = () =>
      new Promise<void>((resolve, reject) => {
        const npx = spawn('npx', ['playwright', 'install', 'chromium'], {
          cwd,
          stdio: 'inherit',
          shell: true,
        });
        npx.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `npx playwright install chromium exited with code ${code}`,
              ),
            );
          }
        });
        npx.on('error', reject);
      });

    let message =
      'Playwright is required for the Browser Agent. Installing to ' +
      cwd +
      '...\n';
    if (log) log(message);
    else debugLogger.log(message);

    await installPackage();

    message += 'Installing Chromium browser...\n';
    if (log) log(message);
    else debugLogger.log('Installing Chromium browser...');

    await installBrowsers();

    message += 'Playwright installation complete.\n';
    if (log) log(message);
    else debugLogger.log('Playwright installation complete.');
  }

  private async ensureManagedPlaywrightAvailable(
    log?: (message: string) => void,
  ): Promise<unknown> {
    const depDir = Storage.getGlobalDependenciesDir();
    const depPkgJson = path.join(depDir, 'package.json');

    if (!fs.existsSync(depDir)) {
      fs.mkdirSync(depDir, { recursive: true });
    }
    if (!fs.existsSync(depPkgJson)) {
      fs.writeFileSync(depPkgJson, '{}');
    }

    const requireGlobal = module.createRequire(depPkgJson);
    try {
      const playwrightPath = requireGlobal.resolve('playwright');
      const playwright = await import(playwrightPath);
      return playwright.chromium || playwright.default?.chromium;
    } catch (_e3) {
      debugLogger.log('Playwright not found globally. Installing...');
      try {
        await this.installPlaywright(depDir, log);

        const playwrightPath = requireGlobal.resolve('playwright');
        const playwright = await import(playwrightPath);
        return playwright.chromium || playwright.default?.chromium;
      } catch (installError: unknown) {
        const errorMessage =
          installError instanceof Error
            ? installError.message
            : String(installError);
        throw new Error(
          `Failed to install Playwright in ${depDir}: ${errorMessage}`,
        );
      }
    }
  }
}
