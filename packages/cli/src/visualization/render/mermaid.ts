/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import type { Theme } from '../types.js';
import { buildMermaidHtml } from './template.js';

// ---------------------------------------------------------------------------
// Mermaid → PNG renderer (Puppeteer-based)
// ---------------------------------------------------------------------------

export interface MermaidRenderOptions {
  theme?: Theme;
  widthPx?: number;
  backgroundColor?: string;
}

function getLaunchArgs(): string[] {
  const args = [
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
  ];

  // Sandbox flags are needed on Linux CI/containers but can destabilize some local setups.
  if (process.platform === 'linux') {
    args.unshift('--no-sandbox', '--disable-setuid-sandbox');
  }

  return args;
}

async function launchBrowser(): Promise<Awaited<ReturnType<typeof puppeteer.launch>>> {
  const launchArgs = getLaunchArgs();
  const launchErrors: string[] = [];
  const candidates: Array<{
    label: string;
    useEnvExecutablePath: boolean;
    options: Parameters<typeof puppeteer.launch>[0];
  }> = [];

  const rawEnvPath = process.env['PUPPETEER_EXECUTABLE_PATH']?.trim();
  const envPath =
    rawEnvPath && rawEnvPath.length > 1
      ? rawEnvPath.replace(/^"(.*)"$/, '$1')
      : rawEnvPath;

  if (envPath) {
    if (existsSync(envPath)) {
      candidates.push({
        label: `env executable (${envPath})`,
        useEnvExecutablePath: true,
        options: {
          headless: 'new',
          executablePath: envPath,
          args: launchArgs,
          pipe: true,
          protocolTimeout: 60_000,
        },
      });
    } else {
      launchErrors.push(
        `PUPPETEER_EXECUTABLE_PATH is set but does not exist: ${envPath}`,
      );
    }
  }

  candidates.push(
    {
      label: 'bundled chromium (headless=new)',
      useEnvExecutablePath: false,
      options: {
        headless: 'new',
        args: launchArgs,
        pipe: true,
        protocolTimeout: 60_000,
      },
    },
    {
      label: 'bundled chromium (headless=true)',
      useEnvExecutablePath: false,
      options: {
        headless: true,
        args: launchArgs,
        pipe: true,
        protocolTimeout: 60_000,
      },
    },
  );

  const originalEnvExecutablePath = process.env['PUPPETEER_EXECUTABLE_PATH'];

  for (const candidate of candidates) {
    try {
      if (candidate.useEnvExecutablePath) {
        if (originalEnvExecutablePath !== undefined) {
          process.env['PUPPETEER_EXECUTABLE_PATH'] = originalEnvExecutablePath;
        }
      } else {
        delete process.env['PUPPETEER_EXECUTABLE_PATH'];
      }

      return await puppeteer.launch(candidate.options);
    } catch (error) {
      launchErrors.push(
        `${candidate.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      if (originalEnvExecutablePath === undefined) {
        delete process.env['PUPPETEER_EXECUTABLE_PATH'];
      } else {
        process.env['PUPPETEER_EXECUTABLE_PATH'] = originalEnvExecutablePath;
      }
    }
  }

  throw new Error(`Puppeteer launch failed. ${launchErrors.join(' | ')}`);
}

/**
 * Renders a Mermaid diagram spec to a PNG Buffer using Puppeteer.
 *
 * Strategy:
 * 1. Launch headless Chromium
 * 2. Load an inline HTML page with Mermaid CDN
 * 3. Inject the diagram source, wait for SVG to appear
 * 4. Screenshot the SVG element's bounding box → PNG
 */
export async function renderMermaidToPng(
  spec: string,
  options: MermaidRenderOptions = {},
): Promise<Buffer> {
  const theme = options.theme ?? 'dark';
  const widthPx = options.widthPx ?? 1200;

  const html = buildMermaidHtml(spec, theme, widthPx);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    // Set viewport wide enough for the diagram
    await page.setViewport({
      width: widthPx + 200,
      height: 4000,
      deviceScaleFactor: 1,
    });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });

    // Wait for Mermaid to set our completion flag
    await page.waitForFunction(
      () =>
        (window as Window & { __mermaidDone?: boolean }).__mermaidDone === true,
      { timeout: 20_000 },
    );

    if (pageErrors.length > 0) {
      throw new Error(`Mermaid page error: ${pageErrors.join(' | ')}`);
    }

    // Give it a VERY substantial beat for layout, fonts, and SVG settling
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));

    // MEASURE THE ACTUAL SCROLL DIMENSIONS
    const dimensions = await page.evaluate(() => {
      const el = document.querySelector('#container');
      const container = el instanceof HTMLElement ? el : null;
      if (!container) return null;

      return {
        x: 0,
        y: 0,
        width:
          Math.ceil(Math.max(container.scrollWidth, container.offsetWidth)) +
          20,
        height:
          Math.ceil(Math.max(container.scrollHeight, container.offsetHeight)) +
          20,
      };
    });

    // Use clip to capture exactly what we measured
    const screenshotBuffer = await page.screenshot({
      type: 'png',
      clip: dimensions || undefined,
      omitBackground: theme !== 'default',
    });

    return Buffer.from(screenshotBuffer);
  } finally {
    // Swallow close errors — a crashed/disconnected browser throws on close,
    // which would otherwise overwrite the real error in the catch chain.
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
}
