/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import type { Theme } from '../types.js';
import { buildHtmlPreview } from './template.js';

export interface HtmlRenderOptions {
  theme?: Theme;
  widthPx?: number;
}

function getLaunchArgs(): string[] {
  const args: string[] = [];

  if (process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  return args;
}

async function launchBrowser(): Promise<
  Awaited<ReturnType<typeof puppeteer.launch>>
> {
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
 * Renders HTML/CSS (and optionally Tailwind) to a PNG Buffer using Puppeteer.
 */
export async function renderHtmlToPng(
  htmlContent: string,
  options: HtmlRenderOptions = {},
): Promise<Buffer> {
  const theme = options.theme ?? 'dark';
  const widthPx = options.widthPx ?? 800;

  const html = buildHtmlPreview(htmlContent, theme, widthPx);

  const browser = await launchBrowser();

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
