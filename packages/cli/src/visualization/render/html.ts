/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer from 'puppeteer';
import type { Theme } from '../types.js';
import { buildHtmlPreview } from './template.js';

export interface HtmlRenderOptions {
  theme?: Theme;
  widthPx?: number;
}

/**
 * Renders HTML/CSS (and optionally Tailwind) to a PNG Buffer using Puppeteer.
 */
export async function renderHtmlToPng(
  htmlContent: string,
  options: HtmlRenderOptions = {},
): Promise<Buffer> {
  const theme = options.theme ?? 'dark';
  const widthPx = options.widthPx ?? 800;

  const html = buildHtmlPreview(htmlContent, theme, widthPx);

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
    await page.setViewport({
      width: widthPx,
      height: 1200,
      deviceScaleFactor: 2,
    });

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });

    // Wait for preview to be ready
    await page.waitForFunction(
      () =>
        (window as Window & { __previewDone?: boolean }).__previewDone === true,
      { timeout: 10_000 },
    );

    // Give Tailwind a moment to inject styles if it needs it
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));

    const dimensions = await page.evaluate(() => {
      const el = document.querySelector('#container');
      const container = el instanceof HTMLElement ? el : null;
      if (!container) return null;
      return {
        x: 0,
        y: 0,
        width: Math.ceil(container.offsetWidth),
        height: Math.ceil(container.offsetHeight),
      };
    });

    const screenshotBuffer = await page.screenshot({
      type: 'png',
      clip: dimensions || undefined,
      omitBackground: theme !== 'default',
    });

    return Buffer.from(screenshotBuffer);
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
}
