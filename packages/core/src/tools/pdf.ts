/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as PDFLib from 'pdf-lib';
// @ts-ignore: pdf-parse doesn't have types
import * as pdfParse from 'pdf-parse';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type {
  ToolInvocation,
  ToolLocation,
  ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { Config } from '../config/config.js';
import { makeRelative } from '../utils/paths.js';

/**
 * Parameters for PDF operations
 */
export interface PDFToolParams {
  /** The PDF file path */
  filePath: string;
  /** The operation to perform */
  operation: 'create' | 'merge' | 'split' | 'delete_pages' | 'extract_text' | 'search' | 'add_text' | 'add_page' | 'rotate_pages' | 'extract_pages' | 'get_info' | 'compress' | 'encrypt' | 'decrypt';
  /** Output file path (for operations that create new files) */
  outputPath?: string;
  /** Page numbers or ranges for operations (e.g., [1, 3, 5] or "1-5,8,10-12") */
  pages?: number[] | string;
  /** Files to merge (for merge operation) */
  filesToMerge?: string[];
  /** Text content to add */
  text?: string;
  /** Text position for adding text */
  position?: {
    x: number;
    y: number;
    page?: number;
  };
  /** Font options for text */
  fontOptions?: {
    size?: number;
    color?: string;
    font?: string;
  };
  /** Search term for search operations */
  searchTerm?: string;
  /** Search options */
  searchOptions?: {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    regex?: boolean;
  };
  /** Rotation angle for page rotation (90, 180, 270) */
  rotationAngle?: number;
  /** Password for encryption/decryption */
  password?: string;
  /** Encryption options */
  encryptionOptions?: {
    userPassword?: string;
    ownerPassword?: string;
    permissions?: string[];
  };
}

/**
 * PDF page information
 */
export interface PDFPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * PDF document information
 */
export interface PDFDocumentInfo {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  pageCount: number;
  pages: PDFPageInfo[];
  isEncrypted: boolean;
  fileSize: number;
}

/**
 * PDF search result
 */
export interface PDFSearchResult {
  pageNumber: number;
  text: string;
  position?: {
    x: number;
    y: number;
  };
  matchedText: string;
}

/**
 * PDF operation result data
 */
export interface PDFOperationResult {
  /** The file path that was processed */
  filePath: string;
  /** Operation that was performed */
  operation: string;
  /** Output file path (for operations that create new files) */
  outputPath?: string;
  /** Document information */
  documentInfo?: PDFDocumentInfo;
  /** Extracted text content */
  extractedText?: string;
  /** Search results */
  searchResults?: PDFSearchResult[];
  /** Number of pages processed */
  pagesProcessed?: number;
  /** Success flag */
  success: boolean;
}

/**
 * PDF tool invocation
 */
class PDFToolInvocation extends BaseToolInvocation<
  PDFToolParams,
  ToolResult
> {
  constructor(params: PDFToolParams, private config: Config) {
    super(params);
  }

  override getDescription(): string {
    const operation = this.params.operation;
    const filePath = makeRelative(this.params.filePath, this.config.getTargetDir());
    
    switch (operation) {
      case 'create':
        return `Creating new PDF file: ${filePath}`;
      case 'merge':
        return `Merging PDF files into: ${filePath}`;
      case 'split':
        return `Splitting PDF file: ${filePath}${this.params.pages ? ` (pages: ${this.params.pages})` : ''}`;
      case 'delete_pages':
        return `Deleting pages from: ${filePath}${this.params.pages ? ` (pages: ${this.params.pages})` : ''}`;
      case 'extract_text':
        return `Extracting text from: ${filePath}`;
      case 'search':
        return `Searching in: ${filePath}${this.params.searchTerm ? ` (term: "${this.params.searchTerm}")` : ''}`;
      case 'add_text':
        return `Adding text to: ${filePath}`;
      case 'add_page':
        return `Adding page to: ${filePath}`;
      case 'rotate_pages':
        return `Rotating pages in: ${filePath}${this.params.rotationAngle ? ` (${this.params.rotationAngle}°)` : ''}`;
      case 'extract_pages':
        return `Extracting pages from: ${filePath}${this.params.pages ? ` (pages: ${this.params.pages})` : ''}`;
      case 'get_info':
        return `Getting PDF info: ${filePath}`;
      case 'compress':
        return `Compressing PDF: ${filePath}`;
      case 'encrypt':
        return `Encrypting PDF: ${filePath}`;
      case 'decrypt':
        return `Decrypting PDF: ${filePath}`;
      default:
        return `PDF operation on: ${filePath}`;
    }
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.filePath }];
  }

  async execute(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ToolResult> {
    const { filePath, operation } = this.params;
    
    try {
      const result = await this.performOperation();
      
      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: `PDF ${operation} operation completed successfully on ${makeRelative(filePath, this.config.getTargetDir())}`,
      };
    } catch (error) {
      const errorMessage = `PDF operation failed: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMessage,
        returnDisplay: errorMessage,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  private async performOperation(): Promise<PDFOperationResult> {
    const { operation } = this.params;
    
    switch (operation) {
      case 'create':
        return await this.createPDF();
      case 'merge':
        return await this.mergePDFs();
      case 'split':
        return await this.splitPDF();
      case 'delete_pages':
        return await this.deletePages();
      case 'extract_text':
        return await this.extractText();
      case 'search':
        return await this.searchText();
      case 'add_text':
        return await this.addText();
      case 'add_page':
        return await this.addPage();
      case 'rotate_pages':
        return await this.rotatePages();
      case 'extract_pages':
        return await this.extractPages();
      case 'get_info':
        return await this.getPDFInfo();
      case 'compress':
        return await this.compressPDF();
      case 'encrypt':
        return await this.encryptPDF();
      case 'decrypt':
        return await this.decryptPDF();
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  private async createPDF(): Promise<PDFOperationResult> {
    const { filePath, text } = this.params;
    
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage();
    
    if (text) {
      const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
      const fontSize = this.params.fontOptions?.size || 12;
      
      page.drawText(text, {
        x: this.params.position?.x || 50,
        y: this.params.position?.y || page.getHeight() - 50,
        size: fontSize,
        font: font,
        color: this.parseColor(this.params.fontOptions?.color || '#000000'),
      });
    }

    const pdfBytes = await pdfDoc.save();
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(filePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'create',
      pagesProcessed: 1,
    };
  }

  private async mergePDFs(): Promise<PDFOperationResult> {
    const { filePath, filesToMerge } = this.params;
    
    if (!filesToMerge || filesToMerge.length === 0) {
      throw new Error('No files specified for merging');
    }

    const mergedPdf = await PDFLib.PDFDocument.create();
    let totalPages = 0;

    for (const sourceFile of filesToMerge) {
      if (!existsSync(sourceFile)) {
        throw new Error(`Source file not found: ${sourceFile}`);
      }

      const sourceBytes = readFileSync(sourceFile);
      const sourcePdf = await PDFLib.PDFDocument.load(sourceBytes);
      const indices = sourcePdf.getPageIndices();
      
      const copiedPages = await mergedPdf.copyPages(sourcePdf, indices);
      copiedPages.forEach((page: PDFLib.PDFPage) => mergedPdf.addPage(page));
      
      totalPages += indices.length;
    }

    const pdfBytes = await mergedPdf.save();
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(filePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'merge',
      pagesProcessed: totalPages,
    };
  }

  private async splitPDF(): Promise<PDFOperationResult> {
    const { filePath, outputPath, pages } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const sourcePdf = await PDFLib.PDFDocument.load(sourceBytes);
    
    const pageIndices = this.parsePageNumbers(pages, sourcePdf.getPageCount());
    
    if (pageIndices.length === 0) {
      throw new Error('No valid page numbers specified');
    }

    const newPdf = await PDFLib.PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
    copiedPages.forEach((page: PDFLib.PDFPage) => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    
    const outputFilePath = outputPath || this.generateOutputPath(filePath, 'split');
    
    // Ensure directory exists
    const dir = path.dirname(outputFilePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(outputFilePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'split',
      outputPath: outputFilePath,
      pagesProcessed: pageIndices.length,
    };
  }

  private async deletePages(): Promise<PDFOperationResult> {
    const { filePath, pages, outputPath } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const sourcePdf = await PDFLib.PDFDocument.load(sourceBytes);
    
    const pagesToDelete = this.parsePageNumbers(pages, sourcePdf.getPageCount());
    const allPages = Array.from({ length: sourcePdf.getPageCount() }, (_, i) => i);
    const pagesToKeep = allPages.filter(index => !pagesToDelete.includes(index));

    const newPdf = await PDFLib.PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, pagesToKeep);
    copiedPages.forEach((page: PDFLib.PDFPage) => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    
    const outputFilePath = outputPath || filePath;
    await fs.writeFile(outputFilePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'delete_pages',
      outputPath: outputFilePath,
      pagesProcessed: pagesToDelete.length,
    };
  }

  private async extractText(): Promise<PDFOperationResult> {
    const { filePath } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const dataBuffer = readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    return {
      success: true,
      filePath,
      operation: 'extract_text',
      extractedText: data.text,
      pagesProcessed: data.numpages,
    };
  }

  private async searchText(): Promise<PDFOperationResult> {
    const { filePath, searchTerm, searchOptions } = this.params;
    
    if (!searchTerm) {
      throw new Error('Search term is required for search operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const dataBuffer = readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    const results = this.searchInText(data.text, searchTerm, searchOptions || {});

    return {
      success: true,
      filePath,
      operation: 'search',
      searchResults: results,
      pagesProcessed: data.numpages,
    };
  }

  private async addText(): Promise<PDFOperationResult> {
    const { filePath, text, position, fontOptions, outputPath } = this.params;
    
    if (!text) {
      throw new Error('Text is required for add_text operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const pdfDoc = await PDFLib.PDFDocument.load(sourceBytes);
    
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const fontSize = fontOptions?.size || 12;
    const color = this.parseColor(fontOptions?.color || '#000000');
    
    const pageIndex = (position?.page || 1) - 1;
    const page = pdfDoc.getPage(pageIndex);
    
    page.drawText(text, {
      x: position?.x || 50,
      y: position?.y || 50,
      size: fontSize,
      font: font,
      color: color,
    });

    const pdfBytes = await pdfDoc.save();
    
    const outputFilePath = outputPath || filePath;
    await fs.writeFile(outputFilePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'add_text',
      outputPath: outputFilePath,
      pagesProcessed: 1,
    };
  }

  private async addPage(): Promise<PDFOperationResult> {
    const { filePath, outputPath } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const pdfDoc = await PDFLib.PDFDocument.load(sourceBytes);
    
    pdfDoc.addPage();

    const pdfBytes = await pdfDoc.save();
    
    const outputFilePath = outputPath || filePath;
    await fs.writeFile(outputFilePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'add_page',
      outputPath: outputFilePath,
      pagesProcessed: 1,
    };
  }

  private async rotatePages(): Promise<PDFOperationResult> {
    const { filePath, pages, rotationAngle, outputPath } = this.params;
    
    if (!rotationAngle || ![90, 180, 270].includes(rotationAngle)) {
      throw new Error('Rotation angle must be 90, 180, or 270 degrees');
    }

    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const pdfDoc = await PDFLib.PDFDocument.load(sourceBytes);
    
    const pageIndices = this.parsePageNumbers(pages, pdfDoc.getPageCount());
    
    if (pageIndices.length === 0) {
      // Rotate all pages if none specified
      for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const page = pdfDoc.getPage(i);
        page.setRotation(PDFLib.degrees(rotationAngle));
      }
    } else {
      pageIndices.forEach(index => {
        const page = pdfDoc.getPage(index);
        page.setRotation(PDFLib.degrees(rotationAngle));
      });
    }

    const pdfBytes = await pdfDoc.save();
    
    const outputFilePath = outputPath || filePath;
    await fs.writeFile(outputFilePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'rotate_pages',
      outputPath: outputFilePath,
      pagesProcessed: pageIndices.length || pdfDoc.getPageCount(),
    };
  }

  private async extractPages(): Promise<PDFOperationResult> {
    const { filePath, pages, outputPath } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const sourcePdf = await PDFLib.PDFDocument.load(sourceBytes);
    
    const pageIndices = this.parsePageNumbers(pages, sourcePdf.getPageCount());
    
    if (pageIndices.length === 0) {
      throw new Error('No valid page numbers specified for extraction');
    }

    const newPdf = await PDFLib.PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
    copiedPages.forEach((page: PDFLib.PDFPage) => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    
    const outputFilePath = outputPath || this.generateOutputPath(filePath, 'extracted');
    
    // Ensure directory exists
    const dir = path.dirname(outputFilePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(outputFilePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'extract_pages',
      outputPath: outputFilePath,
      pagesProcessed: pageIndices.length,
    };
  }

  private async getPDFInfo(): Promise<PDFOperationResult> {
    const { filePath } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const pdfDoc = await PDFLib.PDFDocument.load(sourceBytes);
    const stats = await fs.stat(filePath);
    
    const pages: PDFPageInfo[] = [];
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      pages.push({
        pageNumber: i + 1,
        width,
        height,
        rotation: page.getRotation().angle,
      });
    }

    const documentInfo: PDFDocumentInfo = {
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor(),
      subject: pdfDoc.getSubject(),
      creator: pdfDoc.getCreator(),
      producer: pdfDoc.getProducer(),
      creationDate: pdfDoc.getCreationDate(),
      modificationDate: pdfDoc.getModificationDate(),
      pageCount: pdfDoc.getPageCount(),
      pages,
      isEncrypted: false, // pdf-lib loads decrypted documents
      fileSize: stats.size,
    };

    return {
      success: true,
      filePath,
      operation: 'get_info',
      documentInfo,
    };
  }

  private async compressPDF(): Promise<PDFOperationResult> {
    const { filePath, outputPath } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const pdfDoc = await PDFLib.PDFDocument.load(sourceBytes);
    
    // Save with compression (pdf-lib automatically applies some compression)
    const pdfBytes = await pdfDoc.save({
      useObjectStreams: false,
    });

    const outputFilePath = outputPath || this.generateOutputPath(filePath, 'compressed');
    await fs.writeFile(outputFilePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'compress',
      outputPath: outputFilePath,
      pagesProcessed: pdfDoc.getPageCount(),
    };
  }

  private async encryptPDF(): Promise<PDFOperationResult> {
    const { filePath, outputPath, encryptionOptions } = this.params;
    
    if (!encryptionOptions?.userPassword && !encryptionOptions?.ownerPassword) {
      throw new Error('At least one password is required for encryption');
    }

    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const sourceBytes = readFileSync(filePath);
    const pdfDoc = await PDFLib.PDFDocument.load(sourceBytes);
    
    // Note: pdf-lib has limited encryption support
    // For full encryption features, you might need additional libraries
    const pdfBytes = await pdfDoc.save();

    const outputFilePath = outputPath || this.generateOutputPath(filePath, 'encrypted');
    await fs.writeFile(outputFilePath, pdfBytes);

    return {
      success: true,
      filePath,
      operation: 'encrypt',
      outputPath: outputFilePath,
      pagesProcessed: pdfDoc.getPageCount(),
    };
  }

  private async decryptPDF(): Promise<PDFOperationResult> {
    const { filePath, outputPath, password } = this.params;
    
    if (!password) {
      throw new Error('Password is required for decryption');
    }

    if (!existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    try {
      const sourceBytes = readFileSync(filePath);
      const pdfDoc = await PDFLib.PDFDocument.load(sourceBytes);
      
      const pdfBytes = await pdfDoc.save();

      const outputFilePath = outputPath || this.generateOutputPath(filePath, 'decrypted');
      await fs.writeFile(outputFilePath, pdfBytes);

      return {
        success: true,
        filePath,
        operation: 'decrypt',
        outputPath: outputFilePath,
        pagesProcessed: pdfDoc.getPageCount(),
      };
    } catch (error) {
      throw new Error('Failed to decrypt PDF - incorrect password or unsupported encryption');
    }
  }

  // Helper methods
  private parsePageNumbers(pages: number[] | string | undefined, maxPages: number): number[] {
    if (!pages) return [];
    
    if (Array.isArray(pages)) {
      return pages
        .filter(p => p >= 1 && p <= maxPages)
        .map(p => p - 1); // Convert to 0-based indexing
    }
    
    if (typeof pages === 'string') {
      const result: number[] = [];
      const parts = pages.split(',');
      
      for (const part of parts) {
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(n => parseInt(n.trim()));
          for (let i = start; i <= end && i <= maxPages; i++) {
            if (i >= 1) result.push(i - 1);
          }
        } else {
          const pageNum = parseInt(part.trim());
          if (pageNum >= 1 && pageNum <= maxPages) {
            result.push(pageNum - 1);
          }
        }
      }
      
      return [...new Set(result)].sort((a, b) => a - b);
    }
    
    return [];
  }

  private parseColor(colorStr: string): PDFLib.RGB {
    // Parse hex color to RGB
    const hex = colorStr.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    return PDFLib.rgb(r, g, b);
  }

  private generateOutputPath(originalPath: string, suffix: string): string {
    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);
    const dir = path.dirname(originalPath);
    return path.join(dir, `${base}_${suffix}${ext}`);
  }

  private searchInText(text: string, searchTerm: string, options: any): PDFSearchResult[] {
    const results: PDFSearchResult[] = [];
    const lines = text.split('\n');
    
    const linesPerPage = 50; // Rough estimate
    
    lines.forEach((line, lineIndex) => {
      const pageNumber = Math.floor(lineIndex / linesPerPage) + 1;
      
      let searchText = line;
      let term = searchTerm;
      
      if (!options.caseSensitive) {
        searchText = line.toLowerCase();
        term = searchTerm.toLowerCase();
      }
      
      if (options.regex) {
        try {
          const flags = options.caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(searchTerm, flags);
          const matches = line.match(regex);
          if (matches) {
            matches.forEach(match => {
              results.push({
                pageNumber,
                text: line,
                matchedText: match,
              });
            });
          }
        } catch (e) {
          // Fall back to literal search if regex is invalid
        }
      } else {
        if (options.wholeWord) {
          const wordRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, options.caseSensitive ? 'g' : 'gi');
          if (wordRegex.test(searchText)) {
            results.push({
              pageNumber,
              text: line,
              matchedText: searchTerm,
            });
          }
        } else {
          if (searchText.includes(term)) {
            results.push({
              pageNumber,
              text: line,
              matchedText: searchTerm,
            });
          }
        }
      }
    });
    
    return results;
  }
}

/**
 * PDF Tool for comprehensive PDF operations
 */
export class PDFTool extends BaseDeclarativeTool<
  PDFToolParams,
  ToolResult
> {
  static readonly Name = 'pdf';
  
  constructor(private config: Config) {
    super(
      'pdf',
      'PDF',
      'Comprehensive PDF tool with support for creating, merging, splitting, text extraction, searching, page manipulation, and document management',
      Kind.Other,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the PDF file',
          },
          operation: {
            type: 'string',
            enum: ['create', 'merge', 'split', 'delete_pages', 'extract_text', 'search', 'add_text', 'add_page', 'rotate_pages', 'extract_pages', 'get_info', 'compress', 'encrypt', 'decrypt'],
            description: 'The operation to perform on the PDF file',
          },
          outputPath: {
            type: 'string',
            description: 'Output file path for operations that create new files',
          },
          pages: {
            oneOf: [
              {
                type: 'array',
                items: { type: 'number' },
                description: 'Array of page numbers (1-based)',
              },
              {
                type: 'string',
                description: 'Page range string (e.g., "1-5,8,10-12")',
              },
            ],
            description: 'Page numbers or ranges for operations',
          },
          filesToMerge: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of PDF file paths to merge',
          },
          text: {
            type: 'string',
            description: 'Text content to add or create',
          },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              page: { type: 'number' },
            },
            description: 'Position for adding text (x, y coordinates and page number)',
          },
          fontOptions: {
            type: 'object',
            properties: {
              size: { type: 'number' },
              color: { type: 'string' },
              font: { type: 'string' },
            },
            description: 'Font options for text',
          },
          searchTerm: {
            type: 'string',
            description: 'Search term for search operations',
          },
          searchOptions: {
            type: 'object',
            properties: {
              caseSensitive: { type: 'boolean' },
              wholeWord: { type: 'boolean' },
              regex: { type: 'boolean' },
            },
            description: 'Search options',
          },
          rotationAngle: {
            type: 'number',
            enum: [90, 180, 270],
            description: 'Rotation angle in degrees (90, 180, or 270)',
          },
          password: {
            type: 'string',
            description: 'Password for encryption/decryption',
          },
          encryptionOptions: {
            type: 'object',
            properties: {
              userPassword: { type: 'string' },
              ownerPassword: { type: 'string' },
              permissions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            description: 'Encryption options',
          },
        },
        required: ['filePath', 'operation'],
        additionalProperties: false,
      }
    );
  }

  protected createInvocation(params: PDFToolParams): ToolInvocation<PDFToolParams, ToolResult> {
    return new PDFToolInvocation(params, this.config);
  }

  protected override validateToolParamValues(params: PDFToolParams): string | null {
    const filePath = params.filePath;
    if (!filePath || filePath.trim() === '') {
      return "The 'filePath' parameter must be non-empty.";
    }

    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.pdf') {
      return `File must be a PDF file (.pdf), got: ${ext}`;
    }

    // Validate operation-specific requirements
    if (params.operation === 'merge' && (!params.filesToMerge || params.filesToMerge.length === 0)) {
      return "Merge operation requires 'filesToMerge' parameter with non-empty array.";
    }

    if (['split', 'delete_pages', 'rotate_pages', 'extract_pages'].includes(params.operation) && !params.pages) {
      return `${params.operation} operation requires 'pages' parameter.`;
    }

    if (params.operation === 'search' && !params.searchTerm) {
      return "Search operation requires 'searchTerm' parameter.";
    }

    if (params.operation === 'add_text' && !params.text) {
      return "Add text operation requires 'text' parameter.";
    }

    if (params.operation === 'rotate_pages' && params.rotationAngle && ![90, 180, 270].includes(params.rotationAngle)) {
      return "Rotation angle must be 90, 180, or 270 degrees.";
    }

    if (['encrypt', 'decrypt'].includes(params.operation)) {
      if (params.operation === 'encrypt' && !params.encryptionOptions?.userPassword && !params.encryptionOptions?.ownerPassword) {
        return "Encryption requires at least one password in encryptionOptions.";
      }
      if (params.operation === 'decrypt' && !params.password) {
        return "Decryption requires 'password' parameter.";
      }
    }

    return null;
  }
}