/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import type React from 'react';
import {
  Bold,
  Italic,
  Code,
  Quote,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  X,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Folder,
  BookTemplate
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { MarkdownRenderer } from './MarkdownRenderer';
import { cn } from '@/utils/cn';
import { useChatStore } from '@/stores/chatStore';

interface QuotedMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
}

interface RichTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onClick?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  quotedMessage?: QuotedMessage | null;
  onRemoveQuote?: () => void;
  // Callbacks for external buttons
  onExcelClick?: () => void;
  onWorkspaceClick?: () => void;
  onTemplateClick?: () => void;
  // External button children (for rendering menus)
  excelButton?: React.ReactNode;
  workspaceButton?: React.ReactNode;
  templateButton?: React.ReactNode;
}

export interface RichTextInputRef {
  focus: () => void;
  getTextareaRef: () => HTMLTextAreaElement | null;
}

export const RichTextInput = forwardRef<RichTextInputRef, RichTextInputProps>(
  ({
    value,
    onChange,
    onKeyDown,
    onClick,
    disabled = false,
    placeholder = 'Type a message...',
    className,
    quotedMessage,
    onRemoveQuote,
    onExcelClick,
    onWorkspaceClick,
    onTemplateClick,
    excelButton,
    workspaceButton,
    templateButton
  }, ref) => {
    const [isMultilineMode, setIsMultilineMode] = useState(false);
    const [showToolbar, setShowToolbar] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { setInputMultilineMode } = useChatStore();

    useImperativeHandle(ref, () => ({
      focus() {
        textareaRef.current?.focus();
      },
      getTextareaRef() {
        return textareaRef.current;
      }
    }));

    // Auto-adjust textarea height
    const adjustHeight = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = isMultilineMode ? 400 : 200;
      const newHeight = Math.min(scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }, [isMultilineMode]);

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    // Sync multiline mode to chat store
    useEffect(() => {
      setInputMultilineMode(isMultilineMode);
    }, [isMultilineMode, setInputMultilineMode]);

    // Handle mode toggle
    const toggleMode = useCallback(() => {
      setIsMultilineMode(prev => !prev);
      // When showing toolbar in single-line mode, also switch to multi-line mode
      setShowToolbar(prev => !prev);
      // Focus after mode change
      setTimeout(() => textareaRef.current?.focus(), 0);
    }, []);

    // Toggle Markdown syntax (add or remove)
    const toggleMarkdown = useCallback((before: string, after: string = '') => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      // Check if already wrapped
      const beforeText = value.substring(start - before.length, start);
      const afterText = value.substring(end, end + after.length);

      if (beforeText === before && afterText === after) {
        // Remove the markdown
        const newText = value.substring(0, start - before.length) + selectedText + value.substring(end + after.length);
        onChange(newText);

        setTimeout(() => {
          const newStart = start - before.length;
          const newEnd = end - before.length;
          textarea.setSelectionRange(newStart, newEnd);
          textarea.focus();
        }, 0);
      } else {
        // Add the markdown
        const newText = value.substring(0, start) + before + selectedText + after + value.substring(end);
        onChange(newText);

        setTimeout(() => {
          const newStart = start + before.length;
          const newEnd = end + before.length;
          textarea.setSelectionRange(newStart, newEnd);
          textarea.focus();
        }, 0);
      }
    }, [value, onChange]);

    // Insert text at cursor
    const insertText = useCallback((text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = value.substring(0, start) + text + value.substring(end);

      onChange(newText);

      // Set cursor position after the inserted text
      setTimeout(() => {
        const newPosition = start + text.length;
        textarea.setSelectionRange(newPosition, newPosition);
        textarea.focus();
      }, 0);
    }, [value, onChange]);

    // Toolbar actions
    const handleBold = () => toggleMarkdown('**', '**');
    const handleItalic = () => toggleMarkdown('*', '*');
    const handleCode = () => toggleMarkdown('`', '`');
    const handleCodeBlock = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const isStartOfLine = lineStart === start;

      if (isStartOfLine) {
        insertText('```\n\n```');
        setTimeout(() => {
          textarea.setSelectionRange(start + 4, start + 4);
          textarea.focus();
        }, 0);
      } else {
        insertText('\n```\n\n```\n');
        setTimeout(() => {
          textarea.setSelectionRange(start + 5, start + 5);
          textarea.focus();
        }, 0);
      }
    };

    const handleQuote = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const isStartOfLine = lineStart === start;

      if (isStartOfLine) {
        insertText('> ');
      } else {
        insertText('\n> ');
      }
    };

    const handleBulletList = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const isStartOfLine = lineStart === start;

      if (isStartOfLine) {
        insertText('- ');
      } else {
        insertText('\n- ');
      }
    };

    const handleNumberedList = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const isStartOfLine = lineStart === start;

      if (isStartOfLine) {
        insertText('1. ');
      } else {
        insertText('\n1. ');
      }
    };

    const handleHeading = (level: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const isStartOfLine = lineStart === start;
      const hashes = '#'.repeat(level) + ' ';

      if (isStartOfLine) {
        insertText(hashes);
      } else {
        insertText('\n' + hashes);
      }
    };

    // Handle internal key events
    const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // In single-line mode, Enter sends the message
      if (!isMultilineMode && e.key === 'Enter' && !e.shiftKey) {
        // Let parent handle send
        onKeyDown?.(e);
        return;
      }

      // In multi-line mode, Shift+Enter adds a new line
      if (isMultilineMode && e.key === 'Enter' && e.shiftKey) {
        // Default behavior (new line)
        return;
      }

      // In multi-line mode, Enter without Shift adds a new line
      if (isMultilineMode && e.key === 'Enter' && !e.shiftKey) {
        // Default behavior (new line)
        return;
      }

      // Pass other keys to parent
      onKeyDown?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {/* Quoted message display */}
        {quotedMessage && (
          <div className="bg-muted/50 border-l-4 border-primary rounded-r-lg px-3 py-2 relative group">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-1 font-medium">
                  Replying to {quotedMessage.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <div className="text-sm text-foreground/80 line-clamp-2">
                  {quotedMessage.content}
                </div>
              </div>
              {onRemoveQuote && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={onRemoveQuote}
                >
                  <X size={14} />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Main input area */}
        <div className="relative">
          {/* Markdown toolbar - shows in multi-line mode or when explicitly shown */}
          {(isMultilineMode || showToolbar) && (
            <div className="flex items-center gap-1 mb-2 pb-2 border-b border-border flex-wrap">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleBold}
                disabled={disabled}
                title="Bold (Ctrl+B)"
              >
                <Bold size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleItalic}
                disabled={disabled}
                title="Italic (Ctrl+I)"
              >
                <Italic size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCode}
                disabled={disabled}
                title="Inline code"
              >
                <Code size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCodeBlock}
                disabled={disabled}
                title="Code block"
              >
                <Code size={16} className="font-bold" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleQuote}
                disabled={disabled}
                title="Quote"
              >
                <Quote size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleBulletList}
                disabled={disabled}
                title="Bullet list"
              >
                <List size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleNumberedList}
                disabled={disabled}
                title="Numbered list"
              >
                <ListOrdered size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleHeading(1)}
                disabled={disabled}
                title="Heading 1"
              >
                <Heading1 size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleHeading(2)}
                disabled={disabled}
                title="Heading 2"
              >
                <Heading2 size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleHeading(3)}
                disabled={disabled}
                title="Heading 3"
              >
                <Heading3 size={16} />
              </Button>

              <div className="flex-1" />

              {/* External feature buttons */}
              {(excelButton || onExcelClick) && (
                <>
                  <div className="h-6 w-px bg-border mx-1" />
                  {excelButton || (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={onExcelClick}
                      disabled={disabled}
                      title="Excel"
                    >
                      <FileSpreadsheet size={16} />
                    </Button>
                  )}
                </>
              )}

              {(workspaceButton || onWorkspaceClick) && (
                workspaceButton || (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onWorkspaceClick}
                    disabled={disabled}
                    title="Workspace"
                  >
                    <Folder size={16} />
                  </Button>
                )
              )}

              {(templateButton || onTemplateClick) && (
                templateButton || (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onTemplateClick}
                    disabled={disabled}
                    title="Template"
                  >
                    <BookTemplate size={16} />
                  </Button>
                )
              )}

              {/* Preview toggle - only in multi-line mode */}
              {isMultilineMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowPreview(prev => !prev)}
                  disabled={disabled}
                  title={showPreview ? 'Hide preview' : 'Show preview'}
                >
                  {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              )}
            </div>
          )}

          {/* Textarea and preview side by side in multi-line mode with preview */}
          {isMultilineMode && showPreview ? (
            <div className="grid grid-cols-2 gap-3">
              {/* Editor */}
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleChange}
                  onKeyDown={handleInternalKeyDown}
                  onClick={onClick}
                  disabled={disabled}
                  placeholder={placeholder}
                  className={cn(
                    "min-h-[200px] max-h-[400px] resize-none font-mono text-sm",
                    "focus:ring-1 focus:ring-primary/50",
                    "[&::-webkit-scrollbar]:w-2",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                    "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20",
                    "[&::-webkit-scrollbar-thumb]:rounded-full",
                    "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/30"
                  )}
                />
                <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  Editor
                </div>
              </div>

              {/* Preview */}
              <div className="relative">
                <div className={cn(
                  "min-h-[200px] max-h-[400px] overflow-y-auto",
                  "border border-border rounded-md bg-background p-3",
                  "[&::-webkit-scrollbar]:w-2",
                  "[&::-webkit-scrollbar-track]:bg-transparent",
                  "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20",
                  "[&::-webkit-scrollbar-thumb]:rounded-full",
                  "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/30"
                )}>
                  {value ? (
                    <MarkdownRenderer content={value} />
                  ) : (
                    <div className="text-muted-foreground text-sm">Preview will appear here...</div>
                  )}
                </div>
                <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  Preview
                </div>
              </div>
            </div>
          ) : (
            // Standard textarea view
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleInternalKeyDown}
              onClick={onClick}
              disabled={disabled}
              placeholder={placeholder}
              className={cn(
                isMultilineMode ? "min-h-[200px] max-h-[400px]" : "min-h-[44px] max-h-[200px]",
                "resize-none",
                "focus:ring-1 focus:ring-primary/50",
                "[&::-webkit-scrollbar]:w-2",
                "[&::-webkit-scrollbar-track]:bg-transparent",
                "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20",
                "[&::-webkit-scrollbar-thumb]:rounded-full",
                "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/30"
              )}
              style={{
                paddingTop: '11px',
                paddingBottom: '13px',
                paddingLeft: '16px',
                paddingRight: '16px',
                fontSize: '14px',
                lineHeight: '20px'
              }}
            />
          )}

          {/* Mode toggle button - positioned at bottom right */}
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-50 hover:opacity-100"
              onClick={toggleMode}
              title={isMultilineMode ? 'Switch to single-line mode' : 'Switch to multi-line mode'}
            >
              {isMultilineMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </Button>
          </div>
        </div>

        {/* Mode indicator and help text */}
        {isMultilineMode && (
          <div className="text-xs text-muted-foreground px-1">
            Multi-line mode: Press Enter for new line • Markdown supported
          </div>
        )}
        {!isMultilineMode && (
          <div className="text-xs text-muted-foreground px-1">
            Press Enter to send • Shift+Enter for new line
          </div>
        )}
      </div>
    );
  }
);

RichTextInput.displayName = 'RichTextInput';
