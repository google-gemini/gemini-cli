/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cn } from '@/utils/cn';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface ParsedContent {
  type: 'paragraph' | 'header' | 'list' | 'code' | 'separator' | 'conclusion' | 'formula' | 'table';
  content: string;
  level?: number;
  language?: string;
  isNumbered?: boolean;
  children?: ParsedContent[];
  tableData?: {
    headers: string[];
    rows: string[][];
    alignment?: Array<('left' | 'center' | 'right')>;
  };
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className
}) => {
  // Parse markdown-like content into structured format
  const parseContent = (text: string): ParsedContent[] => {
    const lines = text.split('\n');
    const parsed: ParsedContent[] = [];
    let currentCodeBlock: string[] = [];
    let codeLanguage = '';
    let inCodeBlock = false;
    let numberedListCounter = 1; // Track numbered list counter
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    let tableAlignment: Array<('left' | 'center' | 'right')> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Handle code blocks
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          // End code block
          parsed.push({
            type: 'code',
            content: currentCodeBlock.join('\n'),
            language: codeLanguage
          });
          currentCodeBlock = [];
          inCodeBlock = false;
          codeLanguage = '';
        } else {
          // Start code block
          inCodeBlock = true;
          codeLanguage = trimmed.substring(3);
        }
        continue;
      }

      if (inCodeBlock) {
        currentCodeBlock.push(line);
        continue;
      }

      // Check if line is a table row
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed.slice(1, -1).split('|').map(cell => cell.trim());

        // Check if this is a separator line (e.g., |---|---|---|)
        if (cells.every(cell => /^[-:\s]+$/.test(cell))) {
          // This is a separator line, determine alignment
          tableAlignment = cells.map(cell => {
            if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
            if (cell.endsWith(':')) return 'right';
            return 'left';
          });
          inTable = true;
          continue;
        }

        // If we haven't seen headers yet and not in table, this is a header row
        if (!inTable && tableHeaders.length === 0) {
          tableHeaders = cells;
          continue;
        }

        // Otherwise it's a data row
        if (inTable) {
          tableRows.push(cells);
          continue;
        }
      } else if (inTable && trimmed !== '') {
        // End of table, save it and continue processing this line
        if (tableHeaders.length > 0) {
          parsed.push({
            type: 'table',
            content: '',
            tableData: {
              headers: tableHeaders,
              rows: tableRows,
              alignment: tableAlignment.length > 0 ? tableAlignment : undefined
            }
          });
        }
        inTable = false;
        tableHeaders = [];
        tableRows = [];
        tableAlignment = [];
        // Don't continue, process this line normally
      } else if (inTable && trimmed === '') {
        // Empty line ends table
        if (tableHeaders.length > 0) {
          parsed.push({
            type: 'table',
            content: '',
            tableData: {
              headers: tableHeaders,
              rows: tableRows,
              alignment: tableAlignment.length > 0 ? tableAlignment : undefined
            }
          });
        }
        inTable = false;
        tableHeaders = [];
        tableRows = [];
        tableAlignment = [];
        continue;
      }

      // Handle separators
      if (trimmed === '---' || trimmed === '___') {
        parsed.push({ type: 'separator', content: '' });
        // Reset numbered list counter after separator
        numberedListCounter = 1;
        continue;
      }

      // Handle headers
      if (trimmed.startsWith('#')) {
        const level = trimmed.match(/^#+/)?.[0].length || 1;
        const headerContent = trimmed.substring(level).trim();
        parsed.push({
          type: 'header',
          content: headerContent,
          level
        });
        // Reset numbered list counter after header
        numberedListCounter = 1;
        continue;
      }

      // Handle numbered lists
      if (/^\d+\.\s/.test(trimmed)) {
        parsed.push({
          type: 'list',
          content: trimmed.substring(trimmed.indexOf('.') + 1).trim(),
          isNumbered: true,
          level: 1 // Top level numbered list
        });
        numberedListCounter++;
        continue;
      }

      // Handle bullet lists (including indented ones)
      const indentMatch = line.match(/^(\s*)([-*•])\s(.+)$/);
      if (indentMatch) {
        const indentLevel = Math.floor(indentMatch[1].length / 2) + 1; // Calculate indent level
        parsed.push({
          type: 'list',
          content: indentMatch[3],
          isNumbered: false,
          level: indentLevel
        });
        continue;
      }

      // Handle conclusions (lines starting with special characters)
      if (trimmed.startsWith('✅') || trimmed.startsWith('💡') || trimmed.startsWith('🎯')) {
        parsed.push({
          type: 'conclusion',
          content: trimmed
        });
        continue;
      }

      // Handle formulas (centered text with math symbols)
      if (trimmed.includes('=') && (trimmed.includes('×') || trimmed.includes('÷') || /\d+/.test(trimmed))) {
        parsed.push({
          type: 'formula',
          content: trimmed
        });
        continue;
      }

      // Regular paragraph
      if (trimmed) {
        parsed.push({
          type: 'paragraph',
          content: trimmed
        });
        // Reset numbered list counter after paragraph
        numberedListCounter = 1;
      }
    }

    // Handle any remaining table at the end of content
    if (inTable && tableHeaders.length > 0) {
      parsed.push({
        type: 'table',
        content: '',
        tableData: {
          headers: tableHeaders,
          rows: tableRows,
          alignment: tableAlignment.length > 0 ? tableAlignment : undefined
        }
      });
    }

    return parsed;
  };

  const renderContent = (items: ParsedContent[]) => {
    let numberedCounter = 1; // Counter for numbered lists

    return items.map((item, index) => {
      const key = `${item.type}-${index}`;

      switch (item.type) {
        case 'header':
          {
            const level = Math.min(item.level || 1, 6);
            const headerClassName = cn(
              "font-bold mt-6 mb-4",
              item.level === 1 && "text-lg",
              item.level === 2 && "text-base",
              item.level === 3 && "text-sm",
              // Theme-aware text colors
              "text-foreground"
            );

            switch (level) {
              case 1:
                return <h1 key={key} className={headerClassName}>{item.content}</h1>;
              case 2:
                return <h2 key={key} className={headerClassName}>{item.content}</h2>;
              case 3:
                return <h3 key={key} className={headerClassName}>{item.content}</h3>;
              case 4:
                return <h4 key={key} className={headerClassName}>{item.content}</h4>;
              case 5:
                return <h5 key={key} className={headerClassName}>{item.content}</h5>;
              case 6:
                return <h6 key={key} className={headerClassName}>{item.content}</h6>;
              default:
                return <h2 key={key} className={headerClassName}>{item.content}</h2>;
            }
          }

        case 'separator':
          return (
            <hr
              key={key}
              className="border-border my-6 border-t"
            />
          );

        case 'code':
          return (
            <div key={key} className="my-4">
              <div className="bg-muted rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-muted border-b border-border">
                  <span className="text-sm text-muted-foreground">{item.language || 'code'}</span>
                  <button className="text-sm text-muted-foreground hover:text-foreground">
                    Copy code
                  </button>
                </div>
                <pre className="p-4 text-sm text-foreground overflow-x-auto">
                  <code>{item.content}</code>
                </pre>
              </div>
            </div>
          );

        case 'list':
          {
            const listNumber = item.isNumbered ? numberedCounter : null;
            if (item.isNumbered) {
              numberedCounter++;
            }
  
            // Reset counter on new sections
            if (index === 0 || (index > 0 && items[index - 1].type !== 'list')) {
              if (item.isNumbered) {
                numberedCounter = 2; // Next number after this one
              }
            }
  
            const indentLevel = item.level || 1;
            const paddingLeft = `${indentLevel * 24}px`; // 24px per level
  
            return (
              <div key={key} className="my-2" style={{ paddingLeft }}>
                <div className="flex items-start gap-3">
                  <span className={cn(
                    "mt-1 flex-shrink-0",
                    "text-foreground/70"
                  )}>
                    {item.isNumbered ? `${listNumber || 1}.` : '•'}
                  </span>
                  <span className={cn(
                    "leading-6",
                    "text-foreground/90"
                  )}>
                    {renderInlineFormatting(item.content)}
                  </span>
                </div>
              </div>
            );
          }

        case 'conclusion':
          return (
            <div key={key} className="my-4 p-4 bg-green-500/10 border-l-4 border-green-500 rounded-r-lg">
              <div className={cn(
                "leading-6",
                "text-foreground"
              )}>
                {renderInlineFormatting(item.content)}
              </div>
            </div>
          );

        case 'formula':
          return (
            <div key={key} className="my-4 text-center">
              <div className={cn(
                "inline-block px-4 py-2 bg-muted rounded-lg font-mono",
                "text-foreground"
              )}>
                {item.content}
              </div>
            </div>
          );

        case 'table':
          {
            if (!item.tableData) return null;
  
            const { headers, rows, alignment } = item.tableData;
  
            return (
              <div key={key} className="my-4 overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border">
                      {headers.map((header, idx) => (
                        <th
                          key={idx}
                          className={cn(
                            "px-4 py-2 font-semibold",
                            alignment?.[idx] === 'center' && "text-center",
                            alignment?.[idx] === 'right' && "text-right",
                            (!alignment || alignment[idx] === 'left') && "text-left",
                            "text-foreground"
                          )}
                        >
                          {renderInlineFormatting(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-border hover:bg-muted/50 transition-colors">
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            className={cn(
                              "px-4 py-2",
                              alignment?.[cellIdx] === 'center' && "text-center",
                              alignment?.[cellIdx] === 'right' && "text-right",
                              (!alignment || alignment[cellIdx] === 'left') && "text-left",
                              "text-foreground/90"
                            )}
                          >
                            {renderInlineFormatting(cell || '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

        case 'paragraph':
        default:
          return (
            <p key={key} className={cn(
              "my-4 leading-7 text-left",
              "text-foreground/90"
            )}>
              {renderInlineFormatting(item.content)}
            </p>
          );
      }
    });
  };

  const renderInlineFormatting = (text: string) => {
    // First handle line breaks - both <br> tags and Markdown-style (two spaces at end of line)
    // Replace two or more spaces at the end of a line with <br>
    let processedText = text.replace(/  +$/gm, '<br>');
    // Also handle explicit <br> or <br/> tags
    processedText = processedText.replace(/<br\s*\/?>/gi, '<br>');

    // Split by <br> to handle line breaks
    const lines = processedText.split('<br>');

    return lines.map((line, lineIndex) => {
      // Handle URL detection and linking
      const processedLine = processLineWithUrls(line);

      // Add line break after each line except the last
      if (lineIndex < lines.length - 1) {
        return (
          <React.Fragment key={lineIndex}>
            {processedLine}
            <br />
          </React.Fragment>
        );
      }
      return <React.Fragment key={lineIndex}>{processedLine}</React.Fragment>;
    });
  };

  const processLineWithUrls = (line: string) => {
    // URL regex pattern to detect various URL formats
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}[^\s]*)/g;

    // Split the line by URLs while keeping the URLs
    const parts = line.split(urlRegex);

    return parts.map((part, partIndex) => {
      // Check if this part is a URL
      if (urlRegex.test(part)) {
        // Ensure URL has protocol
        const href = part.startsWith('http') ? part : `https://${part}`;

        return (
          <a
            key={`url-${partIndex}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300",
              "underline hover:no-underline",
              "break-all", // Allow breaking long URLs
              "inline" // Ensure inline display, not block
            )}
          >
            {part}
          </a>
        );
      }

      // Handle bold text within non-URL parts
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((boldPart, boldIndex) => {
        if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
          return (
            <strong key={`bold-${partIndex}-${boldIndex}`} className={cn(
              "font-bold",
              "text-foreground"
            )}>
              {boldPart.slice(2, -2)}
            </strong>
          );
        }
        return (
          <span key={`text-${partIndex}-${boldIndex}`} className={cn(
            "text-foreground"
          )}>
            {boldPart}
          </span>
        );
      });
    });
  };

  const parsedContent = parseContent(content);

  return (
    <div className={cn("max-w-none text-left", className)}>
      {renderContent(parsedContent)}
    </div>
  );
};