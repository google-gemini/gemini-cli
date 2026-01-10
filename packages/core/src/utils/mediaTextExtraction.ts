/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { debugLogger } from './debugLogger.js';

const MAX_OUTPUT_BUFFER = 20 * 1024 * 1024;
const OCR_MAX_PAGES = 20;
const OCR_DPI = 150;
const commandCache = new Map<string, boolean>();

export interface MediaTextExtractionResult {
  text: string;
  method: 'pdftotext' | 'tesseract';
}

async function commandExists(command: string): Promise<boolean> {
  const cached = commandCache.get(command);
  if (cached !== undefined) {
    return cached;
  }

  const pathEnv = process.env['PATH'] ?? '';
  if (!pathEnv) {
    commandCache.set(command, false);
    return false;
  }

  const pathEntries = pathEnv.split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === 'win32'
      ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT;.COM').split(';')
      : [''];
  const accessMode =
    process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK;

  for (const entry of pathEntries) {
    for (const ext of extensions) {
      const candidate = path.join(entry, `${command}${ext}`);
      try {
        await fsPromises.access(candidate, accessMode);
        commandCache.set(command, true);
        return true;
      } catch {
        // Continue searching
      }
    }
  }

  commandCache.set(command, false);
  return false;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', maxBuffer: MAX_OUTPUT_BUFFER },
      (error, stdout) => {
        if (error) {
          debugLogger.warn(
            `Failed to run ${command} ${args.join(' ')}`,
            error instanceof Error ? error.message : String(error),
          );
          resolve(null);
          return;
        }
        if (typeof stdout === 'string') {
          resolve(stdout);
          return;
        }
        resolve(stdout.toString('utf8'));
      },
    );
  });
}

async function extractPdfTextWithPdftotext(
  filePath: string,
): Promise<string | null> {
  if (!(await commandExists('pdftotext'))) {
    return null;
  }

  const output = await runCommand('pdftotext', [
    '-q',
    '-layout',
    filePath,
    '-',
  ]);
  if (output === null) {
    return null;
  }
  const cleaned = output.trim();
  return cleaned.length > 0 ? cleaned : null;
}

async function extractImageTextWithTesseract(
  filePath: string,
): Promise<string | null> {
  if (!(await commandExists('tesseract'))) {
    return null;
  }

  const output = await runCommand('tesseract', [
    filePath,
    'stdout',
    '-l',
    'eng',
    '--psm',
    '6',
  ]);
  if (output === null) {
    return null;
  }
  const cleaned = output.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function sortPageImages(entries: string[]): string[] {
  return entries.sort((a, b) => {
    const aMatch = a.match(/-(\d+)\.png$/);
    const bMatch = b.match(/-(\d+)\.png$/);
    const aNum = aMatch ? Number(aMatch[1]) : Number.POSITIVE_INFINITY;
    const bNum = bMatch ? Number(bMatch[1]) : Number.POSITIVE_INFINITY;
    return aNum - bNum;
  });
}

async function extractPdfTextWithTesseract(
  filePath: string,
): Promise<string | null> {
  const hasPdftoppm = await commandExists('pdftoppm');
  const hasTesseract = await commandExists('tesseract');
  if (!hasPdftoppm || !hasTesseract) {
    return null;
  }

  const tempDir = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'gemini-cli-ocr-'),
  );
  const prefix = path.join(tempDir, 'page');
  try {
    const renderResult = await runCommand('pdftoppm', [
      '-r',
      String(OCR_DPI),
      '-png',
      '-f',
      '1',
      '-l',
      String(OCR_MAX_PAGES),
      filePath,
      prefix,
    ]);
    if (renderResult === null) {
      return null;
    }

    const entries = await fsPromises.readdir(tempDir);
    const images = sortPageImages(
      entries.filter(
        (entry) => entry.startsWith('page-') && entry.endsWith('.png'),
      ),
    );
    if (images.length === 0) {
      return null;
    }

    const chunks: string[] = [];
    for (const image of images) {
      const imagePath = path.join(tempDir, image);
      const text = await extractImageTextWithTesseract(imagePath);
      if (text) {
        chunks.push(text);
      }
    }

    const joined = chunks.join('\n\n=== PAGE BREAK ===\n\n').trim();
    return joined.length > 0 ? joined : null;
  } finally {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      debugLogger.warn(
        `Failed to remove OCR temp directory: ${tempDir}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

export async function extractMediaText(
  filePath: string,
  mimeType: string,
): Promise<MediaTextExtractionResult | null> {
  if (mimeType === 'application/pdf') {
    const text = await extractPdfTextWithPdftotext(filePath);
    if (text) {
      return { text, method: 'pdftotext' };
    }

    const ocrText = await extractPdfTextWithTesseract(filePath);
    if (ocrText) {
      return { text: ocrText, method: 'tesseract' };
    }
    return null;
  }

  if (mimeType.startsWith('image/')) {
    const ocrText = await extractImageTextWithTesseract(filePath);
    if (ocrText) {
      return { text: ocrText, method: 'tesseract' };
    }
  }

  return null;
}
