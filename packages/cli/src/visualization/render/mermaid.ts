/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
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

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env['PUPPETEER_EXECUTABLE_PATH'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  });

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
