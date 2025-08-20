/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

class PopupManager {
  private statusEl: HTMLElement;
  private statusTextEl: HTMLElement;
  private pageTitleEl: HTMLElement;
  private pageUrlEl: HTMLElement;
  private selectedTextEl: HTMLElement;
  private selectedTextSectionEl: HTMLElement;
  private tabCountEl: HTMLElement;
  private openGeminiBtn: HTMLButtonElement;

  constructor() {
    this.statusEl = document.getElementById('status')!;
    this.statusTextEl = document.getElementById('status-text')!;
    this.pageTitleEl = document.getElementById('page-title')!;
    this.pageUrlEl = document.getElementById('page-url')!;
    this.selectedTextEl = document.getElementById('selected-text')!;
    this.selectedTextSectionEl = document.getElementById('selected-text-section')!;
    this.tabCountEl = document.getElementById('tab-count')!;
    this.openGeminiBtn = document.getElementById('open-gemini') as HTMLButtonElement;

    this.setupEventListeners();
    this.loadCurrentState();
  }

  private setupEventListeners() {
    this.openGeminiBtn.addEventListener('click', () => {
      this.openGeminiCli();
    });

    document.getElementById('help-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({
        url: 'https://github.com/google-gemini/gemini-cli#readme',
      });
    });

    document.getElementById('settings-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  private async loadCurrentState() {
    try {
      // Get current tab info
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTab) {
        this.updateCurrentPage(currentTab.title || 'Untitled', currentTab.url || '');
        
        // Get selected text from current tab
        if (currentTab.id) {
          try {
            const [result] = await chrome.scripting.executeScript({
              target: { tabId: currentTab.id },
              func: () => window.getSelection()?.toString().trim() || '',
            });

            if (result?.result) {
              this.updateSelectedText(result.result);
            }
          } catch (error) {
            // Ignore errors for restricted pages
          }
        }
      }

      // Get total tab count
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const webTabs = allTabs.filter(tab => tab.url && !tab.url.startsWith('chrome://'));
      this.updateTabCount(webTabs.length);

      // Check connection status
      this.checkConnectionStatus();

    } catch (_error) {
      console.error('Error loading popup state:', _error);
      this.updateStatus('disconnected', 'Error loading extension state');
    }
  }

  private updateCurrentPage(title: string, url: string) {
    this.pageTitleEl.textContent = title;
    this.pageUrlEl.textContent = url;
    this.pageUrlEl.title = url;
  }

  private updateSelectedText(text: string) {
    if (text && text.length > 0) {
      this.selectedTextEl.textContent = text.length > 200 
        ? text.substring(0, 200) + '...' 
        : text;
      this.selectedTextSectionEl.style.display = 'block';
    } else {
      this.selectedTextSectionEl.style.display = 'none';
    }
  }

  private updateTabCount(count: number) {
    this.tabCountEl.textContent = `${count} tab${count === 1 ? '' : 's'}`;
  }

  private checkConnectionStatus() {
    // Check if we can communicate with background script
    chrome.runtime.sendMessage({ type: 'ping' }, (_response) => {
      if (chrome.runtime.lastError) {
        this.updateStatus('disconnected', 'Extension error');
        return;
      }

      // For now, we'll assume connected if the background script responds
      // In a real implementation, this would check for actual Gemini CLI connection
      this.updateStatus('connected', 'Ready to assist with Gemini CLI');
      this.openGeminiBtn.disabled = false;
    });
  }

  private updateStatus(status: 'connected' | 'disconnected' | 'connecting', message: string) {
    this.statusEl.className = `status ${status}`;
    this.statusTextEl.textContent = message;
  }

  private async openGeminiCli() {
    try {
      // This would ideally communicate with a running Gemini CLI instance
      // For now, we'll just show instructions to the user
      
      const newTabUrl = chrome.runtime.getURL('welcome.html');
      await chrome.tabs.create({ url: newTabUrl });
      
      // Close the popup
      window.close();
    } catch (error) {
      console.error('Error opening Gemini CLI:', error);
      this.updateStatus('disconnected', 'Failed to open Gemini CLI');
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});