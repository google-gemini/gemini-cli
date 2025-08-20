/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

class GeminiCliContentScript {
  private lastSelectedText = '';
  private debounceTimer: number | undefined;

  constructor() {
    this.setupEventListeners();
    this.notifyPageLoad();
  }

  private setupEventListeners() {
    // Listen for text selection changes
    document.addEventListener('selectionchange', () => {
      this.handleSelectionChange();
    });

    // Listen for page focus/blur
    window.addEventListener('focus', () => {
      this.notifyPageFocus();
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'get-page-context') {
        sendResponse(this.getPageContext());
      } else if (message.type === 'get-selected-text') {
        sendResponse(this.getSelectedText());
      }
    });
  }

  private handleSelectionChange() {
    // Debounce selection changes to avoid too many updates
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      const selectedText = this.getSelectedText();
      if (selectedText !== this.lastSelectedText) {
        this.lastSelectedText = selectedText;
        this.notifySelectionChange(selectedText);
      }
    }, 300);
  }

  private getSelectedText(): string {
    const selection = window.getSelection();
    return selection?.toString().trim() || '';
  }

  private getPageContext() {
    const selectedText = this.getSelectedText();
    const visibleText = this.getVisibleText();
    const pageStructure = this.getPageStructure();

    return {
      url: window.location.href,
      title: document.title,
      selectedText: selectedText.length > 0 ? selectedText : undefined,
      visibleText,
      pageStructure,
    };
  }

  private getVisibleText(): string {
    // Get visible text from the page, excluding scripts and styles
    const clonedDocument = document.cloneNode(true) as Document;
    
    // Remove script and style elements
    const scriptsAndStyles = clonedDocument.querySelectorAll('script, style, noscript');
    scriptsAndStyles.forEach((element) => element.remove());

    // Get text content
    const text = clonedDocument.body?.innerText || '';
    
    // Limit to first 4KB to avoid sending too much data
    return text.substring(0, 4096);
  }

  private getPageStructure() {
    const structure: unknown[] = [];
    
    // Get main structural elements
    const importantSelectors = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'nav', 'main', 'article', 'section', 'aside',
      '[role="main"]', '[role="navigation"]', '[role="banner"]'
    ];

    for (const selector of importantSelectors) {
      const elements = document.querySelectorAll(selector);
      for (let i = 0; i < Math.min(elements.length, 3); i++) {
        const element = elements[i];
        if (element) {
          const text = element.textContent?.trim();
          
          if (text && text.length > 0 && text.length <= 200) {
            structure.push({
              tag: element.tagName.toLowerCase(),
              text: text,
              attributes: this.getRelevantAttributes(element),
            });
          }
        }
      }
    }

    return structure.slice(0, 15); // Limit to 15 elements
  }

  private getRelevantAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    const relevantAttrs = ['id', 'class', 'href', 'src', 'alt', 'title', 'role'];
    
    for (const attr of relevantAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        attrs[attr] = value;
      }
    }
    
    return attrs;
  }

  private notifyPageLoad() {
    chrome.runtime.sendMessage({
      type: 'page-loaded',
      data: this.getPageContext(),
    }).catch(() => {
      // Extension might not be ready yet, ignore
    });
  }

  private notifyPageFocus() {
    chrome.runtime.sendMessage({
      type: 'page-focused',
      data: {
        url: window.location.href,
        title: document.title,
      },
    }).catch(() => {
      // Extension might not be ready yet, ignore
    });
  }

  private notifySelectionChange(selectedText: string) {
    if (selectedText.length > 0) {
      chrome.runtime.sendMessage({
        type: 'text-selected',
        data: {
          selectedText: selectedText.substring(0, 16384), // Limit to 16KB
          url: window.location.href,
          title: document.title,
        },
      }).catch(() => {
        // Extension might not be ready yet, ignore
      });
    }
  }
}

// Initialize the content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new GeminiCliContentScript();
  });
} else {
  new GeminiCliContentScript();
}