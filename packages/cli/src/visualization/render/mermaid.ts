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

interface MermaidRenderPageStatus {
  mermaidError: string;
  hasSvg: boolean;
  errorText: string;
}

function getLaunchArgs(): string[] {
  const args: string[] = [];

  // Sandbox flags are needed on Linux CI/containers but can destabilize some local setups.
  if (process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
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
          headless: true,
          executablePath: envPath,
          args: launchArgs,
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
      label: 'bundled chromium (headless=true)',
      useEnvExecutablePath: false,
      options: {
        headless: true,
        args: launchArgs,
      },
    },
    {
      label: 'bundled chromium (headless=new)',
      useEnvExecutablePath: false,
      options: {
        headless: 'new',
        args: launchArgs,
      },
    },
    {
      label: 'system chrome channel (headless=true)',
      useEnvExecutablePath: false,
      options: {
        headless: true,
        channel: 'chrome',
        args: launchArgs,
      },
    },
    {
      label: 'system chrome channel (headless=new)',
      useEnvExecutablePath: false,
      options: {
        headless: 'new',
        channel: 'chrome',
        args: launchArgs,
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
      height: 12000,
      deviceScaleFactor: 2,
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

    const renderStatus = await page.evaluate((): MermaidRenderPageStatus => {
      const win = window as Window & { __mermaidError?: unknown };
      const rawError =
        typeof win.__mermaidError === 'string'
          ? win.__mermaidError.trim()
          : win.__mermaidError != null
            ? String(win.__mermaidError)
            : '';

      const errorNode =
        document.querySelector('.error-text') ??
        document.querySelector('.error-icon') ??
        document.querySelector('[class*="error"]');

      const errorText =
        errorNode instanceof HTMLElement
          ? (errorNode.textContent ?? '').trim()
          : '';

      return {
        mermaidError: rawError,
        hasSvg: document.querySelector('.mermaid svg') !== null,
        errorText,
      };
    });

    if (renderStatus.mermaidError.length > 0) {
      throw new Error(`Mermaid syntax error: ${renderStatus.mermaidError}`);
    }

    if (!renderStatus.hasSvg) {
      throw new Error('Mermaid render failed: no SVG output was produced.');
    }

    if (renderStatus.errorText.length > 0) {
      throw new Error(`Mermaid syntax error: ${renderStatus.errorText}`);
    }

    if (pageErrors.length > 0) {
      throw new Error(`Mermaid page error: ${pageErrors.join(' | ')}`);
    }

    // Give it a VERY substantial beat for layout, fonts, and SVG settling
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));

    // MEASURE THE ACTUAL SCROLL DIMENSIONS
    const dimensions = await page.evaluate(() => {
      const clipFromRect = (rect: DOMRect, padding: number) => {
        let x = Math.floor(rect.left - padding);
        let y = Math.floor(rect.top - padding);
        let width = Math.ceil(rect.width + padding * 2);
        let height = Math.ceil(rect.height + padding * 2);

        const maxWidth = Math.floor(window.innerWidth);
        const maxHeight = Math.floor(window.innerHeight);

        if (x < 0) {
          width += x;
          x = 0;
        }
        if (y < 0) {
          height += y;
          y = 0;
        }

        if (x + width > maxWidth) {
          width = maxWidth - x;
        }
        if (y + height > maxHeight) {
          height = maxHeight - y;
        }

        if (width <= 0 || height <= 0) {
          return null;
        }

        return { x, y, width, height };
      };

      // Prefer the SVG bounds so the diagram fills the screenshot region.
      const svg = document.querySelector('.mermaid svg');
      if (svg instanceof SVGSVGElement) {
        const svgRect = svg.getBoundingClientRect();
        const svgClip = clipFromRect(svgRect, 12);
        if (svgClip) {
          return svgClip;
        }
      }

      // Fallback to container bounds if SVG bounds are unavailable.
      const container = document.querySelector('#container');
      if (container instanceof HTMLElement) {
        const containerRect = container.getBoundingClientRect();
        return clipFromRect(containerRect, 8);
      }

      return null;
    });

    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      throw new Error('Mermaid render failed: invalid screenshot dimensions.');
    }

    // Use clip to capture exactly what we measured
    const screenshotBuffer = await page.screenshot({
      type: 'png',
      clip: dimensions,
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
