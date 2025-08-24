/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TextUnit } from './types.js';
import { DEFAULT_MAX_TEXT_CHARS, DEFAULT_MERGE_THRESHOLD } from './constants.js';

export class TextProcessor {
  private readonly maxTextChars: number;
  private readonly mergeThreshold: number;

  constructor(
    maxTextChars: number = DEFAULT_MAX_TEXT_CHARS,
    mergeThreshold: number = DEFAULT_MERGE_THRESHOLD
  ) {
    this.maxTextChars = maxTextChars;
    this.mergeThreshold = mergeThreshold;
  }

  async processFile(filePath: string, baseDir: string): Promise<TextUnit[]> {
    try {
      const text = await this.readFileText(filePath);
      if (!text) {
        return [];
      }

      const units = this.splitIntoUnits(text, filePath, baseDir);
      return units;
    } catch (error) {
      console.warn(`Error processing file ${filePath}:`, error);
      return [];
    }
  }

  private async readFileText(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      try {
        const buffer = await fs.readFile(filePath);
        return buffer.toString('latin1');
      } catch {
        return null;
      }
    }
  }

  private splitIntoUnits(text: string, filePath: string, baseDir: string): TextUnit[] {
    const units: TextUnit[] = [];
    const relpath = path.relative(baseDir, filePath).replace(/\\/g, '/');
    
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText.split('\n');
    
    let charOffset = 0;
    let buffer: string[] = [];
    let bufferStartLine: number | null = 1;
    let bufferStartChar: number | null = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const strippedLine = line.trim();

      if (strippedLine === '') {
        if (buffer.length > 0 && bufferStartLine !== null && bufferStartChar !== null) {
          const mergedText = this.mergeBuffer(buffer);
          units.push(this.createTextUnit(mergedText, relpath, bufferStartLine, bufferStartChar));
          buffer = [];
          bufferStartLine = null;
          bufferStartChar = null;
        }
      } else {
        if (buffer.length === 0) {
          bufferStartLine = lineNumber;
          bufferStartChar = charOffset;
        }

        if (strippedLine.length < this.mergeThreshold) {
          buffer.push(strippedLine);
        } else {
          if (buffer.length > 0 && bufferStartLine !== null && bufferStartChar !== null) {
            buffer.push(strippedLine);
            const mergedText = this.mergeBuffer(buffer);
            units.push(this.createTextUnit(mergedText, relpath, bufferStartLine, bufferStartChar));
            buffer = [];
            bufferStartLine = null;
            bufferStartChar = null;
          } else {
            units.push(this.createTextUnit(strippedLine, relpath, lineNumber, charOffset));
          }
        }
      }

      charOffset += line.length + 1;
    }

    if (buffer.length > 0 && bufferStartLine !== null && bufferStartChar !== null) {
      const mergedText = this.mergeBuffer(buffer);
      units.push(this.createTextUnit(mergedText, relpath, bufferStartLine, bufferStartChar));
    }

    return units;
  }

  private mergeBuffer(buffer: string[]): string {
    const merged = buffer.join(' ');
    return merged.length > this.maxTextChars ? merged.substring(0, this.maxTextChars) : merged;
  }

  private createTextUnit(text: string, relpath: string, lineno: number, startChar: number): TextUnit {
    return {
      id: uuidv4(),
      relpath,
      lineno,
      start_char: startChar,
      text: text.length > this.maxTextChars ? text.substring(0, this.maxTextChars) : text
    };
  }
}
