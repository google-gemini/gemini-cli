/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BrowserTab {
  id: number;
  url: string;
  title: string;
  isActive: boolean;
  timestamp: number;
  favIconUrl: string | undefined;
}

export interface PageContext {
  url: string;
  title: string;
  selectedText: string | undefined;
  visibleText: string | undefined;
  pageStructure: PageElement[] | undefined;
}

export interface PageElement {
  tag: string;
  text?: string;
  attributes?: Record<string, string>;
  children?: PageElement[];
}

export interface BrowserContext {
  activeTabs: BrowserTab[];
  currentPage: PageContext | undefined;
  browserInfo: {
    userAgent: string;
    language: string;
    timezone: string;
  };
}

export class BrowserContextManager {
  private context: BrowserContext;
  private listeners: Array<(_context: BrowserContext) => void> = [];
  private readonly MAX_TABS = 10;
  private readonly MAX_TEXT_LENGTH = 16384; // 16 KiB limit

  constructor() {
    this.context = {
      activeTabs: [],
      currentPage: undefined,
      browserInfo: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    this.setupTabListeners();
    this.initializeCurrentTabs();
  }

  private setupTabListeners() {
    // Listen for tab activation
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.updateActiveTab(activeInfo.tabId);
      this.fireContextChange();
    });

    // Listen for tab updates (URL changes, loading status, etc.)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        await this.updateTabInfo(tab);
        this.fireContextChange();
      }
    });

    // Listen for tab creation
    chrome.tabs.onCreated.addListener(async (tab) => {
      if (tab.id !== undefined) {
        await this.addTab(tab);
        this.fireContextChange();
      }
    });

    // Listen for tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.removeTab(tabId);
      this.fireContextChange();
    });
  }

  private async initializeCurrentTabs() {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const activeTabs = tabs
        .filter((tab) => tab.id !== undefined && tab.url && !tab.url.startsWith('chrome://'))
        .slice(0, this.MAX_TABS)
        .map((tab) => this.tabToBrowserTab(tab));

      this.context.activeTabs = activeTabs;
      
      // Set the current active tab
      const activeTab = tabs.find((tab) => tab.active);
      if (activeTab && activeTab.id !== undefined) {
        await this.updateActiveTab(activeTab.id);
      }
    } catch (error) {
      console.error('Failed to initialize current tabs:', error);
    }
  }

  private tabToBrowserTab(tab: chrome.tabs.Tab): BrowserTab {
    const browserTab: BrowserTab = {
      id: tab.id!,
      url: tab.url || '',
      title: tab.title || '',
      isActive: tab.active || false,
      timestamp: Date.now(),
      favIconUrl: tab.favIconUrl || undefined,
    };
    
    return browserTab;
  }

  private async updateActiveTab(tabId: number) {
    // Deactivate all tabs
    this.context.activeTabs.forEach((tab) => {
      tab.isActive = false;
    });

    // Find and activate the current tab
    let activeTab = this.context.activeTabs.find((tab) => tab.id === tabId);
    if (!activeTab) {
      try {
        const tab = await chrome.tabs.get(tabId);
        activeTab = this.tabToBrowserTab(tab);
        this.addTabToList(activeTab);
      } catch (error) {
        console.error('Failed to get tab info:', error);
        return;
      }
    }

    activeTab.isActive = true;
    activeTab.timestamp = Date.now();

    // Move to front of list
    const index = this.context.activeTabs.indexOf(activeTab);
    if (index > 0) {
      this.context.activeTabs.splice(index, 1);
      this.context.activeTabs.unshift(activeTab);
    }

    // Update current page context
    await this.updateCurrentPageContext(tabId);
  }

  private async updateTabInfo(tab: chrome.tabs.Tab) {
    if (!tab.id) return;

    const existingTab = this.context.activeTabs.find((t) => t.id === tab.id);
    if (existingTab) {
      existingTab.url = tab.url || existingTab.url;
      existingTab.title = tab.title || existingTab.title;
      if (tab.favIconUrl) {
        existingTab.favIconUrl = tab.favIconUrl;
      }
      existingTab.timestamp = Date.now();

      if (tab.active) {
        await this.updateCurrentPageContext(tab.id);
      }
    }
  }

  private async addTab(tab: chrome.tabs.Tab) {
    if (!tab.id || !tab.url || tab.url.startsWith('chrome://')) return;

    const browserTab = this.tabToBrowserTab(tab);
    this.addTabToList(browserTab);

    if (tab.active) {
      await this.updateActiveTab(tab.id);
    }
  }

  private addTabToList(tab: BrowserTab) {
    // Remove if already exists
    this.context.activeTabs = this.context.activeTabs.filter((t) => t.id !== tab.id);
    
    // Add to front
    this.context.activeTabs.unshift(tab);
    
    // Enforce max tabs
    if (this.context.activeTabs.length > this.MAX_TABS) {
      this.context.activeTabs = this.context.activeTabs.slice(0, this.MAX_TABS);
    }
  }

  private removeTab(tabId: number) {
    this.context.activeTabs = this.context.activeTabs.filter((tab) => tab.id !== tabId);
    
    // If this was the current page, clear it
    if (this.context.currentPage) {
      const currentTab = this.context.activeTabs.find((tab) => tab.isActive);
      if (!currentTab) {
        this.context.currentPage = undefined;
      }
    }
  }

  private async updateCurrentPageContext(tabId: number) {
    try {
      // Get selected text and page context from content script
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: this.extractPageContext,
      });

      if (result?.result) {
        const tab = this.context.activeTabs.find((t) => t.id === tabId);
        if (tab) {
          this.context.currentPage = {
            url: tab.url,
            title: tab.title,
            selectedText: result.result.selectedText,
            visibleText: result.result.visibleText,
            pageStructure: result.result.pageStructure,
          };
        }
      }
    } catch (error) {
      // This can fail for chrome:// pages or other restricted URLs
      console.log('Could not extract page context:', error);
    }
  }

  // This function will be injected and executed in the page context
  private extractPageContext() {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || undefined;

    // Get visible text (first few KB)
    const body = document.body;
    const visibleText = body?.innerText?.substring(0, 4096) || undefined;

    // Get basic page structure
    const getElementInfo = (element: Element, maxDepth: number = 3): PageElement | null => {
      if (maxDepth <= 0) return null;
      
      const info: PageElement = {
        tag: element.tagName.toLowerCase(),
      };

      // Get text content for relevant elements
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button'].includes(info.tag)) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && text.length <= 200) {
          info.text = text;
        }
      }

      // Get important attributes
      const importantAttrs = ['id', 'class', 'href', 'src', 'alt', 'title'];
      const attributes: Record<string, string> = {};
      for (const attr of importantAttrs) {
        const value = element.getAttribute(attr);
        if (value) {
          attributes[attr] = value;
        }
      }
      if (Object.keys(attributes).length > 0) {
        info.attributes = attributes;
      }

      return info;
    };

    // Get main page structure elements
    const pageStructure: PageElement[] = [];
    const importantSelectors = ['h1', 'h2', 'h3', 'nav', 'main', 'article', 'section'];
    
    for (const selector of importantSelectors) {
      const elements = document.querySelectorAll(selector);
      for (let i = 0; i < Math.min(elements.length, 5); i++) {
        const element = elements[i];
        if (element) {
          const info = getElementInfo(element);
          if (info) {
            pageStructure.push(info);
          }
        }
      }
    }

    return {
      selectedText: selectedText && selectedText.length <= 16384 ? selectedText : selectedText?.substring(0, 16384),
      visibleText,
      pageStructure: pageStructure.slice(0, 20), // Limit to 20 elements
    };
  }

  public getCurrentContext(): BrowserContext {
    return { ...this.context };
  }

  public onContextChange(listener: (_context: BrowserContext) => void) {
    this.listeners.push(listener);
  }

  private fireContextChange() {
    const context = this.getCurrentContext();
    this.listeners.forEach((listener) => {
      try {
        listener(context);
      } catch (error) {
        console.error('Error in context change listener:', error);
      }
    });
  }

  // Method to manually update context (called from content script)
  public updatePageContext(pageContext: Partial<PageContext>) {
    if (this.context.currentPage) {
      this.context.currentPage = {
        ...this.context.currentPage,
        ...pageContext,
      };
      this.fireContextChange();
    }
  }
}