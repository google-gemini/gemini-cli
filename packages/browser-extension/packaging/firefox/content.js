"use strict";
(() => {
  // src/content.ts
  var GeminiCliContentScript = class {
    lastSelectedText = "";
    debounceTimer;
    constructor() {
      this.setupEventListeners();
      this.notifyPageLoad();
    }
    setupEventListeners() {
      document.addEventListener("selectionchange", () => {
        this.handleSelectionChange();
      });
      window.addEventListener("focus", () => {
        this.notifyPageFocus();
      });
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "get-page-context") {
          sendResponse(this.getPageContext());
        } else if (message.type === "get-selected-text") {
          sendResponse(this.getSelectedText());
        }
      });
    }
    handleSelectionChange() {
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
    getSelectedText() {
      const selection = window.getSelection();
      return (selection == null ? void 0 : selection.toString().trim()) || "";
    }
    getPageContext() {
      const selectedText = this.getSelectedText();
      const visibleText = this.getVisibleText();
      const pageStructure = this.getPageStructure();
      return {
        url: window.location.href,
        title: document.title,
        selectedText: selectedText.length > 0 ? selectedText : void 0,
        visibleText,
        pageStructure
      };
    }
    getVisibleText() {
      var _a;
      const clonedDocument = document.cloneNode(true);
      const scriptsAndStyles = clonedDocument.querySelectorAll("script, style, noscript");
      scriptsAndStyles.forEach((element) => element.remove());
      const text = ((_a = clonedDocument.body) == null ? void 0 : _a.innerText) || "";
      return text.substring(0, 4096);
    }
    getPageStructure() {
      var _a;
      const structure = [];
      const importantSelectors = [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "nav",
        "main",
        "article",
        "section",
        "aside",
        '[role="main"]',
        '[role="navigation"]',
        '[role="banner"]'
      ];
      for (const selector of importantSelectors) {
        const elements = document.querySelectorAll(selector);
        for (let i = 0; i < Math.min(elements.length, 3); i++) {
          const element = elements[i];
          if (element) {
            const text = (_a = element.textContent) == null ? void 0 : _a.trim();
            if (text && text.length > 0 && text.length <= 200) {
              structure.push({
                tag: element.tagName.toLowerCase(),
                text,
                attributes: this.getRelevantAttributes(element)
              });
            }
          }
        }
      }
      return structure.slice(0, 15);
    }
    getRelevantAttributes(element) {
      const attrs = {};
      const relevantAttrs = ["id", "class", "href", "src", "alt", "title", "role"];
      for (const attr of relevantAttrs) {
        const value = element.getAttribute(attr);
        if (value) {
          attrs[attr] = value;
        }
      }
      return attrs;
    }
    notifyPageLoad() {
      chrome.runtime.sendMessage({
        type: "page-loaded",
        data: this.getPageContext()
      }).catch(() => {
      });
    }
    notifyPageFocus() {
      chrome.runtime.sendMessage({
        type: "page-focused",
        data: {
          url: window.location.href,
          title: document.title
        }
      }).catch(() => {
      });
    }
    notifySelectionChange(selectedText) {
      if (selectedText.length > 0) {
        chrome.runtime.sendMessage({
          type: "text-selected",
          data: {
            selectedText: selectedText.substring(0, 16384),
            // Limit to 16KB
            url: window.location.href,
            title: document.title
          }
        }).catch(() => {
        });
      }
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      new GeminiCliContentScript();
    });
  } else {
    new GeminiCliContentScript();
  }
})();
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=content.js.map
