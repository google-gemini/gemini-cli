/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vision tool for Gemini Cowork.
 *
 * Captures screenshots from three sources:
 *   - `url`     : Navigate to a URL with Puppeteer and take a full-viewport shot.
 *   - `desktop` : Capture the primary display via OS utilities (scrot / screencapture).
 *   - `file`    : Load an existing image from disk.
 *
 * The captured image is then sent to Gemini 2.0 as an inline multimodal part
 * so the model can "see" the UI and provide layout / CSS analysis.
 *
 * Prerequisites
 * ─────────────
 *   GEMINI_API_KEY  – required for all vision calls
 *   puppeteer       – optional; only needed for `url` source
 *                     npm install puppeteer --workspace @google/gemini-cowork
 */

import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import type { ScreenshotAnalyzeInput } from './definitions.js';
import type { ToolResult } from './executor.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type SupportedMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

interface ImageCapture {
  data: Buffer;
  mimeType: SupportedMime;
}

// ---------------------------------------------------------------------------
// Screenshot helpers
// ---------------------------------------------------------------------------

/**
 * Capture a URL screenshot using Puppeteer.
 *
 * Puppeteer is an optional peer dependency. We dynamic-import it so the rest
 * of the tool works even when it is not installed.
 */
async function captureUrl(url: string): Promise<ImageCapture> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let puppeteer: any;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error(
      'puppeteer is required for URL screenshots.\n' +
        'Install it inside the cowork package:\n' +
        '  npm install puppeteer --workspace @google/gemini-cowork',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const page = await browser.newPage();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await page.setViewport({ width: 1280, height: 800 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const data: Buffer = await page.screenshot({ type: 'png', fullPage: false });
    return { data, mimeType: 'image/png' };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await browser.close();
  }
}

/**
 * Capture the primary display using OS-specific utilities.
 *
 * | Platform | Tool used              |
 * |----------|------------------------|
 * | Linux    | scrot                  |
 * | macOS    | screencapture          |
 * | Windows  | PowerShell + WinForms  |
 */
async function captureDesktop(): Promise<ImageCapture> {
  const outPath = join(tmpdir(), `cowork-screenshot-${Date.now()}.png`);

  const cmds: Record<string, string[]> = {
    linux: ['scrot', '--silent', outPath],
    darwin: ['screencapture', '-x', '-t', 'png', outPath],
    win32: [
      'powershell',
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ` +
        `$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
        `$bmp=New-Object System.Drawing.Bitmap($s.Width,$s.Height); ` +
        `$g=[System.Drawing.Graphics]::FromImage($bmp); ` +
        `$g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size); ` +
        `$bmp.Save('${outPath.replace(/'/g, "''")}')`,
    ],
  };

  const cmdArgs = cmds[process.platform as string] ?? cmds['linux'];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmdArgs[0], cmdArgs.slice(1), { stdio: 'pipe' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`Desktop screenshot command exited with code ${String(code)}`),
        );
    });
    child.on('error', reject);
  });

  const data = await readFile(outPath);
  return { data, mimeType: 'image/png' };
}

/** Load and validate an image from an existing file path. */
async function loadImageFile(filePath: string): Promise<ImageCapture> {
  const data = await readFile(filePath);
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  const mimeMap: Record<string, SupportedMime> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  const mimeType = mimeMap[ext] ?? 'image/png';
  return { data, mimeType };
}

// ---------------------------------------------------------------------------
// Gemini Vision
// ---------------------------------------------------------------------------

/**
 * Submit a captured image with a text prompt to Gemini and return the analysis.
 *
 * Uses the `@google/genai` SDK's `generateContent` API with an `inlineData`
 * part — the same pattern used internally by `@google/gemini-cli-core`.
 */
async function analyzeWithGemini(
  capture: ImageCapture,
  prompt: string,
  model: string,
): Promise<string> {
  const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Vision analysis requires a Gemini API key.\n' +
        'Export it with:  export GEMINI_API_KEY=your_key_here',
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64 = capture.data.toString('base64');

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: capture.mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
  });

  return response.text ?? '(Gemini returned no text for this image)';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute the `screenshot_and_analyze` tool.
 *
 * Orchestrates:  capture → encode → Gemini 2.0 vision call → ToolResult.
 */
export async function executeScreenshotAndAnalyze(
  input: ScreenshotAnalyzeInput,
): Promise<ToolResult> {
  let capture: ImageCapture;

  switch (input.source.type) {
    case 'url':
      capture = await captureUrl(input.source.url);
      break;
    case 'desktop':
      capture = await captureDesktop();
      break;
    case 'file':
      capture = await loadImageFile(input.source.path);
      break;
  }

  const analysis = await analyzeWithGemini(capture, input.prompt, input.model);
  return { output: analysis };
}
