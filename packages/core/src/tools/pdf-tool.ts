/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
// import { createRequire } from 'node:module';
// import { pathToFileURL } from 'node:url';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { ToolResult } from './tools.js';

// PDF manipulation libraries
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';
// Import PDF.js using the correct .mjs extension
// import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// import { createCanvas } from 'canvas';

// Text extraction and parsing
interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

interface FormField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature';
  value: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageInfo {
  page: number;
  width: number;
  height: number;
  rotation: number;
  textBlocks: TextBlock[];
  images: number;
}

interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  keywords?: string[];
}

interface PDFParams {
  /** PDF file path */
  file: string;
  /** Operation type - carefully designed for token efficiency */
  op: 'create' | 'merge' | 'split' | 'extracttext' | 'search' | 'info'; // | 'hanko' | 'toimage';
  // Commented out to save tokens: 'metadata' | 'forms' | 'protect' | 'optimize' | 'convert' | 'annotate' | 'watermark' | 'compress'
  
  // Core parameters (most common)
  /** Page numbers (1-based) or ranges like "1-3,5,7-10" */
  pages?: string;
  /** Search query for text operations */
  query?: string;
  /** Output file path */
  output?: string;
  
  // Content parameters
  /** Text content to add */
  text?: string;
  /** Position for text/elements {x, y} */
  position?: { x: number; y: number };
  /** Font size */
  fontSize?: number;
  /** Color in hex format #RRGGBB */
  color?: string;
  
  // Form parameters
  /** Form field values */
  fields?: Record<string, string>;
  /** Flatten forms after filling */
  flatten?: boolean;
  
  // Files for operations
  /** Source files for merge operations */
  sources?: string[];
  /** Image file for insertion */
  image?: string;
  
  // Japanese hanko (circular seal) options - DISABLED
  // /** Hanko configuration */
  // hanko?: {
  //   /** Person's name (姓) - will be shown at bottom */
  //   name: string;
  //   /** Function text (承認/申請/確認 etc.) - will be shown at top */
  //   function?: string;
  //   /** Date to include (YYYY/MM/DD format) - will be shown in middle */
  //   date?: string;
  //   /** Circle diameter in points */
  //   diameter?: number;
  //   /** Ink color (red by default) */
  //   color?: string;
  //   /** Coordinates for hanko placement */
  //   coordinates?: { x: number; y: number };
  // };
  
  // /** Extract format */ - REMOVED: extracttext returns raw text
  
  // Commented out to save tokens:
  // password?: string;
  // protection?: { userPassword?: string; ownerPassword?: string; permissions?: string[]; };
  // metadata?: PDFMetadata;
  // quality?: number;
}

interface MatchResult {
  text: string;
  context: string;
  index: number; // Position in the text where match was found
}

interface PDFResult extends ToolResult {
  success: boolean;
  file: string;
  op: string;
  
  // Data results
  text?: string;
  pageTexts?: Record<number, string>; // Page number -> text content
  pageSearchResults?: Record<number, MatchResult[]>; // Page number -> matches on that page
  pages?: PageInfo[];
  metadata?: PDFMetadata;
  forms?: FormField[];
  
  // File results
  outputFile?: string;
  outputFiles?: string[];
  
  // Status
  pageCount?: number;
  fileSize?: number;
  isProtected?: boolean;
}

class PDFInvocation extends BaseToolInvocation<PDFParams, PDFResult> {
  async execute(): Promise<PDFResult> {
    const { file, op, pages, query, output, text } = this.params;
    
    try {
      // Validate file exists for read operations
      if (['extracttext', 'search', 'info', 'split'].includes(op)) { // , 'hanko'
        // Commented out operations: 'metadata', 'forms', 'protect', 'optimize', 'convert', 'annotate', 'watermark', 'compress'
        if (!existsSync(file)) {
          return this.createErrorResult(`PDF file not found: ${file}`);
        }
      }

      switch (op) {
        case 'create':
          return await this.createPDF(file, text || 'Hello World');
          
        case 'merge':
          return await this.mergePDFs(this.params.sources || [], output || file);
          
        case 'split':
          return await this.splitPDF(file, pages, output);
          
        case 'extracttext':
          return await this.extractText(file, pages);
          
        case 'search':
          return await this.searchText(file, query || '', pages);
          
        case 'info':
          return await this.getPDFInfo(file, pages);
          
        // case 'hanko':
        //   return await this.addHanko(file, this.params.hanko, output);
          
        // case 'toimage':
        //   return await this.convertToImage(file, pages, output);
          
        // Commented out to save tokens:
        // case 'metadata':
        //   return await this.handleMetadata(file, this.params.metadata, output);
        // case 'forms':
        //   return await this.handleForms(file, this.params.fields, this.params.flatten, output);
        // case 'protect':
        //   return await this.protectPDF(file, this.params.protection, output);
        // case 'optimize':
        //   return await this.optimizePDF(file, output, this.params.quality);
        // case 'convert':
        //   return await this.convertPDF(file, this.params.format || 'text', output);
        // case 'annotate':
        //   return await this.addAnnotation(file, text || '', position, output);
        // case 'watermark':
        //   return await this.addWatermark(file, text || 'WATERMARK', output);
        // case 'compress':
        //   return await this.compressPDF(file, output, this.params.quality);
          
        default:
          return this.createErrorResult(`Unsupported operation: ${op}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(`PDF operation failed: ${message}`);
    }
  }


  private async createPDF(file: string, content: string): Promise<PDFResult> {
    try {
      const pdfDoc = new PDFDocument();
      const stream = createWriteStream(file);
      pdfDoc.pipe(stream);
      
      pdfDoc.fontSize(12).text(content, 50, 50);
      pdfDoc.end();
      
      await new Promise<void>((resolve, reject) => {
        stream.on('finish', () => resolve());
        stream.on('error', reject);
      });
      
      const stats = await fs.stat(file);
      
      return {
        success: true,
        file,
        op: 'create',
        outputFile: file,
        fileSize: stats.size,
        llmContent: `pdf(create): Created PDF "${file}" with content: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"

**File Details:**
- Path: ${file}
- Size: ${Math.round(stats.size/1024)}KB`,
        returnDisplay: `pdf(create): Successfully created PDF file`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to create PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async mergePDFs(sources: string[], output: string): Promise<PDFResult> {
    try {
      const mergedDoc = await PDFLibDocument.create();
      
      for (const source of sources) {
        if (!existsSync(source)) {
          return this.createErrorResult(`Source file not found: ${source}`);
        }
        
        const sourceDoc = await PDFLibDocument.load(await fs.readFile(source));
        const pages = await mergedDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
        pages.forEach(page => mergedDoc.addPage(page));
      }
      
      await fs.writeFile(output, await mergedDoc.save());
      const stats = await fs.stat(output);
      
      return {
        success: true,
        file: output,
        op: 'merge',
        outputFile: output,
        fileSize: stats.size,
        pageCount: mergedDoc.getPageCount(),
        llmContent: `pdf(merge): Merged ${sources.length} PDFs into "${output}". Total pages: ${mergedDoc.getPageCount()}

**Source Files:**
${sources.map((source, index) => `${index + 1}. ${path.basename(source)}`).join('\n')}

**Output File:**
- Path: ${output}
- Size: ${Math.round(stats.size/1024)}KB
- Pages: ${mergedDoc.getPageCount()}`,
        returnDisplay: `pdf(merge): Successfully merged ${sources.length} PDF files`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to merge PDFs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async splitPDF(file: string, pages: string | undefined, outputPath?: string): Promise<PDFResult> {
    try {
      const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
      const totalPages = pdfDoc.getPageCount();
      const pageNumbers = this.parsePageNumbers(pages, totalPages);
      
      // Determine base directory and filename
      let baseDir: string;
      let baseName: string;
      
      if (outputPath) {
        // Check if output is a directory or file path
        if (outputPath.endsWith('.pdf')) {
          // It's a specific file path, use it for single page only
          if (pageNumbers.length === 1) {
            baseDir = path.dirname(outputPath);
            baseName = path.basename(outputPath, '.pdf');
          } else {
            // Multiple pages, treat as directory
            baseDir = path.dirname(outputPath);
            baseName = path.basename(file, path.extname(file));
          }
        } else {
          // It's a directory
          baseDir = outputPath;
          baseName = path.basename(file, path.extname(file));
        }
      } else {
        // No output specified, use same directory as input
        baseDir = path.dirname(file);
        baseName = path.basename(file, path.extname(file));
      }
      
      const outputFiles: string[] = [];
      
      for (const pageNum of pageNumbers) {
        const newDoc = await PDFLibDocument.create();
        const [copiedPage] = await newDoc.copyPages(pdfDoc, [pageNum - 1]);
        newDoc.addPage(copiedPage);
        
        let outputFile: string;
        if (outputPath?.endsWith('.pdf') && pageNumbers.length === 1) {
          // Use the specified filename for single page
          outputFile = outputPath;
        } else {
          // Generate filename with page number
          outputFile = path.join(baseDir, `${baseName}_page_${pageNum}.pdf`);
        }
        
        await fs.writeFile(outputFile, await newDoc.save());
        outputFiles.push(outputFile);
      }
      
      return {
        success: true,
        file,
        op: 'split',
        outputFiles,
        llmContent: `pdf(split): Split "${file}" into ${outputFiles.length} files:

**Generated Files:**
${outputFiles.map((filePath, index) => `${index + 1}. ${path.basename(filePath)}
   Path: ${filePath}`).join('\n')}`,
        returnDisplay: `pdf(split): Successfully split PDF into ${outputFiles.length} files`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to split PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractText(file: string, pages?: string): Promise<PDFResult> {
    try {
      const buffer = await fs.readFile(file);
      const pdfDoc = await PDFLibDocument.load(buffer);
      const pageCount = pdfDoc.getPageCount();
      const pageNumbers = this.parsePageNumbers(pages, pageCount);
      
      const pageTexts: Record<number, string> = {};
      
      // Extract text from each specified page
      for (const pageNum of pageNumbers) {
        try {
          // Create a single-page PDF for individual parsing
          const singlePageDoc = await PDFLibDocument.create();
          const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum - 1]);
          singlePageDoc.addPage(copiedPage);
          
          // Convert single page to buffer and extract text
          const singlePageBuffer = await singlePageDoc.save();
          const singlePageData = await pdfParse(Buffer.from(singlePageBuffer));
          
          pageTexts[pageNum] = singlePageData.text.trim() || '';
        } catch (pageError) {
          pageTexts[pageNum] = `[Error extracting page: ${pageError instanceof Error ? pageError.message : 'Unknown error'}]`;
        }
      }
      
      return {
        success: true,
        file,
        op: 'extracttext',
        pageTexts,
        pageCount,
        llmContent: `pdf(extracttext): Extracted text from ${pageNumbers.length} pages:
${Object.entries(pageTexts).map(([pageNum, text]) => `**Page ${pageNum}:**
${text}`).join('\n\n')}`,
        returnDisplay: `pdf(extracttext): Extracted text from ${pageNumbers.length} pages`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async searchText(file: string, query: string, pages?: string): Promise<PDFResult> {
    try {
      const buffer = await fs.readFile(file);
      const pdfDoc = await PDFLibDocument.load(buffer);
      const pageCount = pdfDoc.getPageCount();
      const pageNumbers = this.parsePageNumbers(pages, pageCount);
      
      const pageSearchResults: Record<number, MatchResult[]> = {};
      let totalMatches = 0;
      
      // Search in each specified page
      for (const pageNum of pageNumbers) {
        try {
          // Create a single-page PDF for individual text extraction
          const singlePageDoc = await PDFLibDocument.create();
          const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum - 1]);
          singlePageDoc.addPage(copiedPage);
          
          // Convert single page to buffer and extract text
          const singlePageBuffer = await singlePageDoc.save();
          const singlePageData = await pdfParse(Buffer.from(singlePageBuffer));
          const pageText = singlePageData.text;
          
          // Search for all occurrences of query in this page
          const matches: MatchResult[] = [];
          const queryLower = query.toLowerCase();
          const textLower = pageText.toLowerCase();
          
          let searchIndex = 0;
          while (searchIndex < textLower.length) {
            const matchIndex = textLower.indexOf(queryLower, searchIndex);
            if (matchIndex === -1) break;
            
            // Extract context around the match (50 characters before and after)
            const contextStart = Math.max(0, matchIndex - 50);
            const contextEnd = Math.min(pageText.length, matchIndex + query.length + 50);
            const context = pageText.substring(contextStart, contextEnd).trim();
            
            matches.push({
              text: pageText.substring(matchIndex, matchIndex + query.length),
              context: context.length > 150 ? context.substring(0, 147) + '...' : context,
              index: matchIndex
            });
            
            searchIndex = matchIndex + 1; // Continue searching from next position
          }
          
          pageSearchResults[pageNum] = matches;
          totalMatches += matches.length;
        } catch (pageError) {
          pageSearchResults[pageNum] = [{
            text: query,
            context: `[Error searching page: ${pageError instanceof Error ? pageError.message : 'Unknown error'}]`,
            index: -1
          }];
        }
      }
      
      return {
        success: true,
        file,
        op: 'search',
        pageSearchResults,
        pageCount,
        llmContent: `pdf(search): Found ${totalMatches} matches for "${query}" in ${pageNumbers.length} pages:

${Object.entries(pageSearchResults)
  .filter(([, matches]) => matches.length > 0)
  .map(([pageNum, matches]) => 
    `**Page ${pageNum} (${matches.length} matches):**
${matches.map(match => `- "${match.text}" (context: ${match.context})`).join('\n')}`
  ).join('\n\n') || 'No matches found'}`,
        returnDisplay: `pdf(search): Found ${totalMatches} matches for "${query}" in ${pageNumbers.length} pages`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to search PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getPDFInfo(file: string, pages?: string): Promise<PDFResult> {
    try {
      const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
      const pageCount = pdfDoc.getPageCount();
      const stats = await fs.stat(file);
      const pageNumbers = this.parsePageNumbers(pages, pageCount);
      
      // Get basic metadata
      const title = pdfDoc.getTitle();
      const author = pdfDoc.getAuthor();
      const subject = pdfDoc.getSubject();
      const creator = pdfDoc.getCreator();
      const producer = pdfDoc.getProducer();
      
      const metadata: PDFMetadata = {
        title: title || undefined,
        author: author || undefined,
        subject: subject || undefined,
        creator: creator || undefined,
        producer: producer || undefined,
      };
      
      // Get page structure information
      const pagesInfo: PageInfo[] = [];
      for (const pageNum of pageNumbers) {
        const page = pdfDoc.getPage(pageNum - 1);
        const { width, height } = page.getSize();
        
        pagesInfo.push({
          page: pageNum,
          width,
          height,
          rotation: page.getRotation().angle,
          textBlocks: [], // Would require OCR library for full implementation
          images: 0 // Would require image extraction
        });
      }
      
      return {
        success: true,
        file,
        op: 'info',
        pageCount,
        fileSize: stats.size,
        metadata,
        pages: pagesInfo,
        isProtected: false, // Would need to check encryption
        llmContent: `pdf(info): PDF "${file}" has ${pageCount} pages, size: ${Math.round(stats.size/1024)}KB

**Metadata:**
${Object.entries(metadata)
  .filter(([, value]) => value !== undefined)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n') || 'No metadata available'}

**Page Structure:**
${pagesInfo.map(page => 
  `Page ${page.page}: ${page.width} x ${page.height} points${page.rotation ? ` (rotated ${page.rotation}°)` : ''}`
).join('\n')}`,
        returnDisplay: `pdf(info): PDF has ${pageCount} pages, size: ${Math.round(stats.size/1024)}KB`
      };
    } catch (error) {
      return this.createErrorResult(`Failed to get PDF info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // private async addHanko(file: string, hankoConfig?: PDFParams['hanko'], output?: string): Promise<PDFResult> {
  //   try {
  //     if (!hankoConfig?.name) {
  //       return this.createErrorResult('Hanko name is required');
  //     }

  //     const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
  //     const pages = pdfDoc.getPages();
  //     const firstPage = pages[0];
      
  //     const { width, height } = firstPage.getSize();
      
  //     // Hanko parameters with proper defaults
  //     const { 
  //       name, 
  //       function: functionText = '承認', // Default function text
  //       date, 
  //       diameter = 80, // Larger for better visibility
  //       color = '#CC0000',
  //       coordinates
  //     } = hankoConfig;
      
  //     // Determine position
  //     let centerX: number, centerY: number;
  //     if (coordinates) {
  //       // Use provided coordinates (PDF coordinate system: bottom-left origin)
  //       centerX = coordinates.x;
  //       centerY = coordinates.y;
  //     } else {
  //       // Default position: top-right corner
  //       centerX = width - diameter - 30;
  //       centerY = height - diameter - 30;
  //     }
  //     const radius = diameter / 2;
      
  //     // Parse color (hex to RGB)
  //     const hexColor = color.replace('#', '');
  //     const r = parseInt(hexColor.substr(0, 2), 16) / 255;
  //     const g = parseInt(hexColor.substr(2, 2), 16) / 255;
  //     const b = parseInt(hexColor.substr(4, 2), 16) / 255;
      
  //     // Draw outer circle (main border)
  //     firstPage.drawCircle({
  //       x: centerX,
  //       y: centerY,
  //       size: radius,
  //       borderColor: rgb(r, g, b),
  //       borderWidth: 3,
  //       color: rgb(1, 1, 1) // White fill
  //     });
      
  //     // Draw inner circle (smaller, for visual depth)
  //     const innerRadius = radius - 6;
  //     firstPage.drawCircle({
  //       x: centerX,
  //       y: centerY,
  //       size: innerRadius,
  //       borderColor: rgb(r, g, b),
  //       borderWidth: 1,
  //     });
      
  //     // Draw horizontal lines connecting to inner circle
  //     const lineY1 = centerY + innerRadius * 0.3; // Upper line
  //     const lineY2 = centerY - innerRadius * 0.3; // Lower line
  //     const lineStartX = centerX - innerRadius + 3;
  //     const lineEndX = centerX + innerRadius - 3;
      
  //     // Upper horizontal line
  //     firstPage.drawLine({
  //       start: { x: lineStartX, y: lineY1 },
  //       end: { x: lineEndX, y: lineY1 },
  //       thickness: 1,
  //       color: rgb(r, g, b)
  //     });
      
  //     // Lower horizontal line
  //     firstPage.drawLine({
  //       start: { x: lineStartX, y: lineY2 },
  //       end: { x: lineEndX, y: lineY2 },
  //       thickness: 1,
  //       color: rgb(r, g, b)
  //     });
      
  //     // Try to load a font that supports Unicode characters
  //     let unicodeFont: any = null;
  //     try {
  //       // For now, we'll use standard fonts and improve text positioning
  //       const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  //       const thinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  //       unicodeFont = { bold: font, regular: thinFont };
  //     } catch (error) {
  //       // Fallback if font loading fails
  //       unicodeFont = null;
  //     }
      
  //     // Calculate font sizes based on circle size
  //     const functionFontSize = Math.max(8, Math.min(12, radius / 5));
  //     const dateFontSize = Math.max(6, Math.min(8, radius / 8));
  //     const nameFontSize = Math.max(10, Math.min(14, radius / 4));
      
  //     // Helper function to get text width for proper centering
  //     const getTextWidth = (text: string, size: number): number => {
  //       // Estimate width - CJK characters are wider
  //       const hasUnicode = /[^\x00-\x7F]/.test(text);
  //       const charWidth = hasUnicode ? size * 0.8 : size * 0.5;
  //       return text.length * charWidth;
  //     };
      
  //     // Helper function to create simple visual representation for Unicode text
  //     const createUnicodeVisual = (text: string, x: number, y: number, size: number, isBold: boolean) => {
  //       const textWidth = getTextWidth(text, size);
  //       const visualHeight = size * 0.8;
        
  //       // Draw background shape
  //       firstPage.drawRectangle({
  //         x: x - textWidth / 2,
  //         y: y - visualHeight / 2,
  //         width: textWidth,
  //         height: visualHeight,
  //         borderColor: rgb(r, g, b),
  //         borderWidth: isBold ? 2 : 1,
  //         color: rgb(1, 1, 1) // White fill
  //       });
        
  //       // Add character indicators
  //       const charIndicators = text.split('').map(char => {
  //         // Simplified visual representation
  //         if (/[\u4e00-\u9fff]/.test(char)) return '中'; // Chinese
  //         if (/[\u3040-\u309f\u30a0-\u30ff]/.test(char)) return '日'; // Japanese
  //         if (/[\uac00-\ud7af]/.test(char)) return '한'; // Korean
  //         return char;
  //       }).join('');
        
  //       // Try to draw the indicators with standard font
  //       if (unicodeFont) {
  //         try {
  //           firstPage.drawText(charIndicators, {
  //             x: x - (charIndicators.length * size / 4),
  //             y: y - size / 4,
  //             size: Math.max(8, size * 0.6),
  //             font: unicodeFont.regular,
  //             color: rgb(r, g, b)
  //           });
  //         } catch {
  //           // If that fails, just show character count
  //           firstPage.drawText(`[${text.length}]`, {
  //             x: x - size,
  //             y: y - size / 4,
  //             size: Math.max(6, size * 0.5),
  //             font: unicodeFont.regular,
  //             color: rgb(r, g, b)
  //           });
  //         }
  //       }
  //     };
      
  //     // Helper function to safely draw centered text
  //     const drawCenteredText = (text: string, x: number, y: number, size: number, isBold: boolean = false) => {
  //       const textWidth = getTextWidth(text, size);
  //       const textX = x - textWidth / 2;
        
  //       // Check if text contains Unicode characters
  //       const hasUnicode = /[^\x00-\x7F]/.test(text);
        
  //       if (hasUnicode) {
  //         // For Unicode text, create visual representation
  //         createUnicodeVisual(text, x, y, size, isBold);
  //         return;
  //       }
        
  //       // For ASCII text, use standard rendering
  //       try {
  //         if (unicodeFont) {
  //           firstPage.drawText(text, {
  //             x: textX,
  //             y: y - size / 2,
  //             size,
  //             font: isBold ? unicodeFont.bold : unicodeFont.regular,
  //             color: rgb(r, g, b)
  //           });
  //           return;
  //         }
  //       } catch (error) {
  //         // Fallback rendering without font
  //         try {
  //           firstPage.drawText(text, {
  //             x: textX,
  //             y: y - size / 2,
  //             size,
  //             color: rgb(r, g, b)
  //           });
  //         } catch {
  //           // Final fallback
  //           firstPage.drawRectangle({
  //             x: textX,
  //             y: y - size / 2,
  //             width: textWidth,
  //             height: size * 0.8,
  //             color: rgb(r * 0.6, g * 0.6, b * 0.6),
  //             opacity: 0.5
  //           });
  //         }
  //       }
  //     };
      
  //     // Function text (top area)
  //     const functionY = centerY + innerRadius * 0.65;
  //     drawCenteredText(functionText, centerX, functionY, functionFontSize, true);
      
  //     // Date (middle area - between the lines)
  //     if (date) {
  //       const dateY = centerY; // Exactly between the two lines
  //       drawCenteredText(date, centerX, dateY, dateFontSize, false);
  //     }
      
  //     // Name (bottom area)
  //     const nameY = centerY - innerRadius * 0.65;
  //     drawCenteredText(name, centerX, nameY, nameFontSize, true);
      
  //     const outputFile = output || file;
  //     await fs.writeFile(outputFile, await pdfDoc.save());
      
  //     return {
  //       success: true,
  //       file,
  //       op: 'hanko',
  //       outputFile,
  //       llmContent: `pdf(hanko): Added Japanese hanko seal with name "${name}" ${date ? `and date "${date}" ` : ''}to "${file}". Positioned at top-right corner with ${diameter}pt diameter.`,
  //       returnDisplay: `pdf(hanko): Successfully added Japanese hanko seal`
  //     };
  //   } catch (error) {
  //     return this.createErrorResult(`Failed to add hanko: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

//   private async convertToImage(file: string, pages?: string, output?: string): Promise<PDFResult> {
//     try {
//       const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
//       const totalPages = pdfDoc.getPageCount();
//       const pageNumbers = this.parsePageNumbers(pages, totalPages);
      
//       const outputFiles: string[] = [];
      
//       // Determine output directory and base name
//       let baseDir: string;
//       let baseName: string;
      
//       if (output) {
//         if (output.endsWith('.pdf') || output.endsWith('.png') || output.endsWith('.jpg')) {
//           // Specific file specified
//           baseDir = path.dirname(output);
//           baseName = path.basename(output, path.extname(output));
//         } else {
//           // Directory specified
//           baseDir = output;
//           baseName = path.basename(file, path.extname(file));
//         }
//       } else {
//         // Use same directory as input
//         baseDir = path.dirname(file);
//         baseName = path.basename(file, path.extname(file));
//       }
      
//       // Page dimensions info for coordinate analysis
//       const pagesInfo: Array<{
//         page: number;
//         width: number;
//         height: number;
//         coordinateSystem: string;
//       }> = [];
      
//       for (const pageNum of pageNumbers) {
//         const page = pdfDoc.getPage(pageNum - 1);
//         const { width, height } = page.getSize();
        
//         // Create a single-page PDF for this page
//         const singlePageDoc = await PDFLibDocument.create();
//         const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum - 1]);
//         singlePageDoc.addPage(copiedPage);
        
//         // Generate image filename
//         const imageFileName = pageNumbers.length === 1 ? 
//           `${baseName}.png` : 
//           `${baseName}_page_${pageNum}.png`;
//         const imageFilePath = path.join(baseDir, imageFileName);
        
//         // Save single-page PDF temporarily
//         const tempPdfBuffer = await singlePageDoc.save();
        
//         try {
//           // Convert PDF to image using Node.js compatible approach
//           // Configure worker for .mjs imports
//           if (!(pdfjsLib as any).GlobalWorkerOptions.workerSrc) {
//             (pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
//           }
          
//           // Load PDF from buffer - research-based solution for font rendering
//           const loadingTask = pdfjsLib.getDocument({
//             data: tempPdfBuffer,
//             // Research shows: disableFontFace: true is key for Node.js environments
//             disableFontFace: true,   // Force use of system fonts instead of embedded fonts (prevents squares)
//             useSystemFonts: true,    // Use system fonts for better compatibility in Node.js
//             isEvalSupported: false,  // Disable eval for security
//             // standardFontDataUrl: (() => {
//             //   const require = createRequire(import.meta.url);
//             //   const fontPath = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts');
//             //   const fontUrl = pathToFileURL(fontPath).href + '/';
//             //   return fontUrl;
//             // })(),
//           });
//           const pdfDocument = await loadingTask.promise;
          
//           // Get the first page
//           const page = await pdfDocument.getPage(1);
          
//           // Set scale for higher quality
//           const scale = 2.0;
//           const viewport = page.getViewport({ scale });
          
//           console.log(`PDF page info: width=${viewport.width}, height=${viewport.height}, scale=${scale}, rotation=${viewport.rotation}`);
          
//           // Create canvas with proper configuration
//           const canvas = createCanvas(viewport.width, viewport.height);
//           const context = canvas.getContext('2d');
          
//           // Set white background
//           context.fillStyle = 'white';
//           context.fillRect(0, 0, canvas.width, canvas.height);
          
//           // Configure context for basic text rendering with system fonts
//           context.textBaseline = 'alphabetic';
//           context.textAlign = 'start';
//           // Use simple system fonts that are commonly available
//           context.font = '12px "Liberation Sans", Arial, sans-serif';
          
//           // Render the page with minimal configuration for better compatibility
//           const renderTask = page.render({
//             canvasContext: context as any,
//             viewport: viewport,
//             canvas: canvas as any
//           });
          
//           await renderTask.promise;
          
//           console.log(`Page rendered: ${viewport.width}x${viewport.height}, rotation: ${viewport.rotation}`);
          
//           // Convert to PNG buffer
//           const imageBuffer = canvas.toBuffer('image/png');
          
//           // Save the image
//           await fs.writeFile(imageFilePath, imageBuffer);
//           outputFiles.push(imageFilePath);
          
//           console.log(`PDF converted to image: ${path.resolve(imageFilePath)}, size: ${imageBuffer.length} bytes`);
          
//           // Cleanup
//           pdfDocument.destroy();
          
//         } catch (conversionError) {
//           throw new Error(`PDF to image conversion failed: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`);
//         }
        
//         pagesInfo.push({
//           page: pageNum,
//           width: Math.round(width),
//           height: Math.round(height),
//           coordinateSystem: `PDF coordinates: (0,0) at bottom-left, (${Math.round(width)},${Math.round(height)}) at top-right`
//         });
//       }
      
//       return {
//         success: true,
//         file,
//         op: 'toimage',
//         outputFiles,
//         pages: pagesInfo.map(info => ({
//           page: info.page,
//           width: info.width,
//           height: info.height,
//           rotation: 0,
//           textBlocks: [],
//           images: 0
//         })),
//         llmContent: `pdf(toimage): Converted ${pageNumbers.length} pages to images for visual analysis.
// Files created: ${outputFiles.map(f => path.resolve(f)).join('\n')}

// Page dimensions for coordinate analysis:
// ${pagesInfo.map(info => `Page ${info.page}: ${info.width}x${info.height} points. ${info.coordinateSystem}`).join('\n')}

// COORDINATE SYSTEM GUIDE:
// - PDF uses bottom-left origin (0,0)
// - X increases rightward, Y increases upward  
// - Image coordinates (if LLM sees image) typically use top-left origin
// - To convert: PDF_Y = PageHeight - Image_Y

// The generated images can now be analyzed by LLM for precise hanko placement.
// For hanko placement, provide coordinates in PDF format.`,
//         returnDisplay: `pdf(toimage): Successfully converted ${pageNumbers.length} pages to PNG images`
//       };
//     } catch (error) {
//       return this.createErrorResult(`Failed to convert to image: ${error instanceof Error ? error.message : 'Unknown error'}`);
//     }
//   }

  // private async handleMetadata(file: string, newMetadata?: PDFMetadata, output?: string): Promise<PDFResult> {
  //   try {
  //     const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
      
  //     if (newMetadata) {
  //       // Set new metadata
  //       if (newMetadata.title) pdfDoc.setTitle(newMetadata.title);
  //       if (newMetadata.author) pdfDoc.setAuthor(newMetadata.author);
  //       if (newMetadata.subject) pdfDoc.setSubject(newMetadata.subject);
  //       if (newMetadata.creator) pdfDoc.setCreator(newMetadata.creator);
  //       if (newMetadata.producer) pdfDoc.setProducer(newMetadata.producer);
  //       if (newMetadata.keywords) pdfDoc.setKeywords(newMetadata.keywords);
        
  //       const outputFile = output || file;
  //       await fs.writeFile(outputFile, await pdfDoc.save());
        
  //       return {
  //         success: true,
  //         file,
  //         op: 'metadata',
  //         outputFile,
  //         metadata: newMetadata,
  //         llmContent: `pdf(metadata): Updated metadata for "${file}": ${JSON.stringify(newMetadata, null, 2)}`,
  //         returnDisplay: `pdf(metadata): Successfully updated PDF metadata`
  //       };
  //     } else {
  //       // Get existing metadata
  //       const metadata: PDFMetadata = {
  //         title: pdfDoc.getTitle() || undefined,
  //         author: pdfDoc.getAuthor() || undefined,
  //         subject: pdfDoc.getSubject() || undefined,
  //         creator: pdfDoc.getCreator() || undefined,
  //         producer: pdfDoc.getProducer() || undefined,
  //       };
        
  //       return {
  //         success: true,
  //         file,
  //         op: 'metadata',
  //         metadata,
  //         llmContent: `pdf(metadata): Retrieved metadata from "${file}": ${JSON.stringify(metadata, null, 2)}`,
  //         returnDisplay: `pdf(metadata): Successfully retrieved PDF metadata`
  //       };
  //     }
  //   } catch (error) {
  //     return this.createErrorResult(`Failed to handle metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  // private async handleForms(file: string, fields?: Record<string, string>, flatten?: boolean, output?: string): Promise<PDFResult> {
  //   try {
  //     const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
  //     const form = pdfDoc.getForm();
      
  //     if (fields) {
  //       // Fill form fields
  //       for (const [fieldName, value] of Object.entries(fields)) {
  //         try {
  //           const field = form.getTextField(fieldName);
  //           field.setText(value);
  //         } catch {
  //           // Try other field types
  //           try {
  //             const field = form.getCheckBox(fieldName);
  //             if (value === 'true' || value === '1') {
  //               field.check();
  //             } else {
  //               field.uncheck();
  //             }
  //           } catch {
  //             // Field not found or unsupported type
  //           }
  //         }
  //       }
        
  //       if (flatten) {
  //         form.flatten();
  //       }
        
  //       const outputFile = output || file;
  //       await fs.writeFile(outputFile, await pdfDoc.save());
        
  //       return {
  //         success: true,
  //         file,
  //         op: 'forms',
  //         outputFile,
  //         llmContent: `pdf(forms): Filled ${Object.keys(fields).length} form fields in "${file}". Fields: ${JSON.stringify(fields, null, 2)}`,
  //         returnDisplay: `pdf(forms): Successfully filled ${Object.keys(fields).length} form fields`
  //       };
  //     } else {
  //       // Get form fields info
  //       const formFields = form.getFields();
  //       const fieldsInfo: FormField[] = formFields.map(field => ({
  //         name: field.getName(),
  //         type: 'text', // Simplified - would need proper type detection
  //         value: '',
  //         page: 1, // Simplified
  //         x: 0,
  //         y: 0,
  //         width: 0,
  //         height: 0
  //       }));
        
  //       return {
  //         success: true,
  //         file,
  //         op: 'forms',
  //         forms: fieldsInfo,
  //         llmContent: `pdf(forms): Found ${fieldsInfo.length} form fields in "${file}": ${fieldsInfo.map(f => f.name).join(', ')}`,
  //         returnDisplay: `pdf(forms): Found ${fieldsInfo.length} form fields`
  //       };
  //     }
  //   } catch (error) {
  //     return this.createErrorResult(`Failed to handle forms: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  // private async protectPDF(file: string, protection?: PDFParams['protection'], output?: string): Promise<PDFResult> {
  //   try {
  //     const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
      
  //     if (protection) {
  //       // Note: pdf-lib has limited encryption support
  //       // This is a simplified implementation
  //       const outputFile = output || file;
  //       await fs.writeFile(outputFile, await pdfDoc.save());
        
  //       return {
  //         success: true,
  //         file,
  //         op: 'protect',
  //         outputFile,
  //         llmContent: `pdf(protect): Applied protection to "${file}". Note: Full encryption requires additional libraries.`,
  //         returnDisplay: `pdf(protect): Successfully applied protection to PDF`
  //       };
  //     } else {
  //       return this.createErrorResult('Protection parameters required');
  //     }
  //   } catch (error) {
  //     return this.createErrorResult(`Failed to protect PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  // private async optimizePDF(file: string, output?: string, quality?: number): Promise<PDFResult> {
  //   try {
  //     const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
  //     const originalSize = (await fs.stat(file)).size;
      
  //     // Basic optimization - remove unused objects
  //     const outputFile = output || file;
  //     await fs.writeFile(outputFile, await pdfDoc.save());
      
  //     const optimizedSize = (await fs.stat(outputFile)).size;
  //     const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
      
  //     return {
  //       success: true,
  //       file,
  //       op: 'optimize',
  //       outputFile,
  //       fileSize: optimizedSize,
  //       llmContent: `pdf(optimize): Optimized "${file}" from ${Math.round(originalSize/1024)}KB to ${Math.round(optimizedSize/1024)}KB (${savings}% reduction)`,
  //       returnDisplay: `pdf(optimize): Reduced file size by ${savings}%`
  //     };
  //   } catch (error) {
  //     return this.createErrorResult(`Failed to optimize PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  // private async convertPDF(file: string, format: string, output?: string): Promise<PDFResult> {
  //   try {
  //     // This would typically use external tools like pdf2htmlEX, pdftk, etc.
  //     // For now, we'll provide a simplified text extraction
  //     const extractResult = await this.extractContent(file, undefined, format);
      
  //     if (output && extractResult.text) {
  //       await fs.writeFile(output, extractResult.text);
  //       return {
  //         ...extractResult,
  //         op: 'convert',
  //         outputFile: output,
  //         llmContent: `pdf(convert): Converted "${file}" to ${format} format and saved to "${output}"`,
  //         returnDisplay: `pdf(convert): Successfully converted PDF to ${format}`
  //       };
  //     }
      
  //     return {
  //       ...extractResult,
  //       op: 'convert'
  //     };
  //   } catch (error) {
  //     return this.createErrorResult(`Failed to convert PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  // private async addAnnotation(file: string, text: string, position?: { x: number; y: number }, output?: string): Promise<PDFResult> {
  //   try {
  //     const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
  //     const pages = pdfDoc.getPages();
  //     const firstPage = pages[0];
      
  //     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  //     const { x = 50, y = 50 } = position || {};
      
  //     firstPage.drawText(text, {
  //       x,
  //       y: firstPage.getHeight() - y, // PDF coordinate system is bottom-up
  //       size: 12,
  //       font,
  //       color: rgb(1, 0, 0) // Red color
  //     });
      
  //     const outputFile = output || file;
  //     await fs.writeFile(outputFile, await pdfDoc.save());
      
  //     return {
  //       success: true,
  //       file,
  //       op: 'annotate',
  //       outputFile,
  //       llmContent: `pdf(annotate): Added annotation "${text}" at position (${x}, ${y}) to "${file}"`,
  //       returnDisplay: `pdf(annotate): Successfully added annotation to PDF`
  //     };
  //   } catch (error) {
  //     return this.createErrorResult(`Failed to add annotation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  // private async addWatermark(file: string, watermarkText: string, output?: string): Promise<PDFResult> {
  //   try {
  //     const pdfDoc = await PDFLibDocument.load(await fs.readFile(file));
  //     const pages = pdfDoc.getPages();
  //     const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
  //     pages.forEach(page => {
  //       const { width, height } = page.getSize();
  //       page.drawText(watermarkText, {
  //         x: width / 2 - 100,
  //         y: height / 2,
  //         size: 48,
  //         font,
  //         color: rgb(0.7, 0.7, 0.7),
  //         opacity: 0.3,
  //         rotate: degrees(-45)
  //       });
  //     });
      
  //     const outputFile = output || file;
  //     await fs.writeFile(outputFile, await pdfDoc.save());
      
  //     return {
  //       success: true,
  //       file,
  //       op: 'watermark',
  //       outputFile,
  //       llmContent: `pdf(watermark): Added watermark "${watermarkText}" to all pages of "${file}"`,
  //       returnDisplay: `pdf(watermark): Successfully added watermark to PDF`
  //     };
  //   } catch (error) {
  //     return this.createErrorResult(`Failed to add watermark: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  // private async compressPDF(file: string, output?: string, quality?: number): Promise<PDFResult> {
  //   // This is essentially the same as optimize for this implementation
  //   return await this.optimizePDF(file, output, quality);
  // }

//   private convertToMarkdown(text: string): string {
//     // Simple text to markdown conversion
//     return text
//       .split('\n\n')
//       .map(paragraph => paragraph.trim())
//       .filter(paragraph => paragraph.length > 0)
//       .map(paragraph => {
//         // Convert lines that look like headers
//         if (paragraph.length < 100 && paragraph.toUpperCase() === paragraph) {
//           return `## ${paragraph}`;
//         }
//         return paragraph;
//       })
//       .join('\n\n');
//   }

//   private convertToHtml(text: string): string {
//     // Simple text to HTML conversion
//     return `<!DOCTYPE html>
// <html>
// <head>
//     <meta charset="UTF-8">
//     <title>PDF Content</title>
//     <style>
//         body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
//         h2 { color: #333; border-bottom: 2px solid #ddd; }
//     </style>
// </head>
// <body>
// ${text
//   .split('\n\n')
//   .map(paragraph => paragraph.trim())
//   .filter(paragraph => paragraph.length > 0)
//   .map(paragraph => {
//     if (paragraph.length < 100 && paragraph.toUpperCase() === paragraph) {
//       return `    <h2>${paragraph}</h2>`;
//     }
//     return `    <p>${paragraph.replace(/\n/g, '<br>')}</p>`;
//   })
//   .join('\n')}
// </body>
// </html>`;
//   }

  private parsePageNumbers(pages: string | undefined, totalPages: number): number[] {
    if (!pages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    const result: number[] = [];
    const parts = pages.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          if (i >= 1) result.push(i);
        }
      } else {
        const pageNum = parseInt(trimmed, 10);
        if (pageNum >= 1 && pageNum <= totalPages) {
          result.push(pageNum);
        }
      }
    }
    
    return [...new Set(result)].sort((a, b) => a - b);
  }

  private createErrorResult(message: string): PDFResult {
    return {
      success: false,
      file: this.params.file,
      op: this.params.op,
      llmContent: `pdf(${this.params.op}): ${message}`,
      returnDisplay: `pdf(${this.params.op}): ${message}`,
    };
  }

  getDescription(): string {
    const { op, file, pages, query, output } = this.params;
    
    switch (op) {
      case 'create':
        return `Creating PDF "${file}"`;
      case 'merge':
        return `Merging PDFs into "${output || file}"`;
      case 'split':
        return `Splitting PDF "${file}"${pages ? ` pages ${pages}` : ''}`;
      case 'extracttext':
        return `Extracting text from PDF "${file}"${pages ? ` pages ${pages}` : ''}`;
      case 'search':
        return `Searching for "${query}" in PDF "${file}"`;
      case 'info':
        return `Getting info and structure for PDF "${file}"${pages ? ` pages ${pages}` : ''}`;
      // case 'hanko':
      //   return `Adding Japanese hanko seal to PDF "${file}"`;
      // case 'toimage':
      //   return `Getting coordinate system info for PDF "${file}"`;
      // case 'metadata':
      //   return `Handling metadata for PDF "${file}"`;
      // case 'forms':
      //   return `Processing forms in PDF "${file}"`;
      // case 'protect':
      //   return `Protecting PDF "${file}"`;
      // case 'watermark':
      //   return `Adding watermark to PDF "${file}"`;
      default:
        return `Performing ${op} operation on PDF "${file}"`;
    }
  }
}

export class PDFTool extends BaseDeclarativeTool<PDFParams, PDFResult> {
  constructor() {
    super(
      'pdf',
      'PDF Operations',
      'PDF operations: create/merge PDFs, SPLIT pages into separate PDF files, extracttext to get page-specific text content, search, info for PDF metadata and page structure.',
      Kind.Other,
      {
        type: 'object',
        required: ['file', 'op'],
        properties: {
          file: { type: 'string', description: 'PDF file path' },
          op: {
            type: 'string',
            enum: ['create', 'merge', 'split', 'extracttext', 'search', 'info'], // 'hanko', 'toimage'],
            description: 'Operation: split=save pages as PDF files, extracttext=get text content from pages, info=get PDF info and page structure' // , toimage=convert PDF pages to PNG images for visual analysis
          },
          pages: { type: 'string', description: 'Page numbers/ranges (1-based): "1-3,5,7-10"' },
          query: { type: 'string', description: 'Search text query' },
          output: { type: 'string', description: 'Output file path' },
          text: { type: 'string', description: 'Text content to add' },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            description: 'Position coordinates {x, y}'
          },
          fontSize: { type: 'number', description: 'Font size for text' },
          color: { type: 'string', description: 'Color in hex format #RRGGBB' },
          fields: {
            type: 'object',
            description: 'Form field values as key-value pairs'
          },
          flatten: { type: 'boolean', description: 'Flatten forms after filling' },
          sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Source PDF files for merge operation'
          },
          // hanko: {
          //   type: 'object',
          //   properties: {
          //     name: { type: 'string', description: 'Person name (shown at bottom)' },
          //     function: { type: 'string', description: 'Function text like 承認/申請 (shown at top, default: 承認)' },
          //     date: { type: 'string', description: 'Date in YYYY/MM/DD format (shown in middle)' },
          //     diameter: { type: 'number', description: 'Circle diameter in points (default: 80)' },
          //     color: { type: 'string', description: 'Ink color in hex format (default: #CC0000)' },
          //     coordinates: {
          //       type: 'object',
          //       properties: {
          //         x: { type: 'number', description: 'X coordinate (PDF format: left edge)' },
          //         y: { type: 'number', description: 'Y coordinate (PDF format: bottom edge)' }
          //       },
          //       required: ['x', 'y'],
          //       description: 'Exact coordinates for hanko placement. Use toimage op first to get page dimensions.'
          //     }
          //   },
          //   required: ['name'],
          //   description: 'Japanese hanko stamp with 3-tier layout and optional coordinate positioning'
          // }
        }
      }
    );
  }

  protected createInvocation(params: PDFParams): PDFInvocation {
    return new PDFInvocation(params);
  }
}