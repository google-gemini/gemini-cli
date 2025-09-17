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
  isUserMessage?: boolean; // To handle user message styling
}

interface ParsedContent {
  type: 'paragraph' | 'header' | 'list' | 'code' | 'separator' | 'conclusion' | 'formula';
  content: string;
  level?: number;
  language?: string;
  isNumbered?: boolean;
  children?: ParsedContent[];
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
  isUserMessage = false
}) => {
  // Parse markdown-like content into structured format
  const parseContent = (text: string): ParsedContent[] => {
    const lines = text.split('\n');
    const parsed: ParsedContent[] = [];
    let currentCodeBlock: string[] = [];
    let codeLanguage = '';
    let inCodeBlock = false;
    let numberedListCounter = 1; // Track numbered list counter

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

    return parsed;
  };

  const renderContent = (items: ParsedContent[]) => {
    let numberedCounter = 1; // Counter for numbered lists

    return items.map((item, index) => {
      const key = `${item.type}-${index}`;

      switch (item.type) {
        case 'header':
          const level = Math.min(item.level || 1, 6);
          const headerClassName = cn(
            "font-bold mt-6 mb-4",
            item.level === 1 && "text-lg",
            item.level === 2 && "text-base",
            item.level === 3 && "text-sm",
            // Theme-aware text colors
            isUserMessage ? "text-primary-foreground" : "text-foreground"
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
                  isUserMessage ? "text-primary-foreground/70" : "text-foreground/70"
                )}>
                  {item.isNumbered ? `${listNumber || 1}.` : '•'}
                </span>
                <span className={cn(
                  "leading-6",
                  isUserMessage ? "text-primary-foreground/90" : "text-foreground/90"
                )}>
                  {renderInlineFormatting(item.content)}
                </span>
              </div>
            </div>
          );

        case 'conclusion':
          return (
            <div key={key} className="my-4 p-4 bg-green-500/10 border-l-4 border-green-500 rounded-r-lg">
              <div className={cn(
                "leading-6",
                isUserMessage ? "text-primary-foreground" : "text-foreground"
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
                isUserMessage ? "text-primary-foreground" : "text-foreground"
              )}>
                {item.content}
              </div>
            </div>
          );

        case 'paragraph':
        default:
          return (
            <p key={key} className={cn(
              "my-4 leading-7",
              isUserMessage ? "text-primary-foreground/90" : "text-foreground/90"
            )}>
              {renderInlineFormatting(item.content)}
            </p>
          );
      }
    });
  };

  const renderInlineFormatting = (text: string) => {
    // Handle bold text
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className={cn(
            "font-bold",
            isUserMessage ? "text-primary-foreground" : "text-foreground"
          )}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={index} className={cn(
        isUserMessage ? "text-primary-foreground" : "text-foreground"
      )}>{part}</span>;
    });
  };

  const parsedContent = parseContent(content);

  return (
    <div className={cn("max-w-none", className)}>
      {renderContent(parsedContent)}
    </div>
  );
};