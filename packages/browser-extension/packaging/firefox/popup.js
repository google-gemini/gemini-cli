"use strict";
(() => {
  // src/popup.ts
  var PopupManager = class {
    statusEl;
    statusTextEl;
    pageTitleEl;
    pageUrlEl;
    selectedTextEl;
    selectedTextSectionEl;
    tabCountEl;
    openGeminiBtn;
    constructor() {
      this.statusEl = document.getElementById("status");
      this.statusTextEl = document.getElementById("status-text");
      this.pageTitleEl = document.getElementById("page-title");
      this.pageUrlEl = document.getElementById("page-url");
      this.selectedTextEl = document.getElementById("selected-text");
      this.selectedTextSectionEl = document.getElementById("selected-text-section");
      this.tabCountEl = document.getElementById("tab-count");
      this.openGeminiBtn = document.getElementById("open-gemini");
      this.setupEventListeners();
      this.loadCurrentState();
    }
    setupEventListeners() {
      var _a, _b;
      this.openGeminiBtn.addEventListener("click", () => {
        this.openGeminiCli();
      });
      (_a = document.getElementById("help-link")) == null ? void 0 : _a.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({
          url: "https://github.com/google-gemini/gemini-cli#readme"
        });
      });
      (_b = document.getElementById("settings-link")) == null ? void 0 : _b.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
    }
    async loadCurrentState() {
      try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (currentTab) {
          this.updateCurrentPage(currentTab.title || "Untitled", currentTab.url || "");
          if (currentTab.id) {
            try {
              const [result] = await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                func: () => {
                  var _a;
                  return ((_a = window.getSelection()) == null ? void 0 : _a.toString().trim()) || "";
                }
              });
              if (result == null ? void 0 : result.result) {
                this.updateSelectedText(result.result);
              }
            } catch (error) {
            }
          }
        }
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const webTabs = allTabs.filter((tab) => tab.url && !tab.url.startsWith("chrome://"));
        this.updateTabCount(webTabs.length);
        this.checkConnectionStatus();
      } catch (_error) {
        console.error("Error loading popup state:", _error);
        this.updateStatus("disconnected", "Error loading extension state");
      }
    }
    updateCurrentPage(title, url) {
      this.pageTitleEl.textContent = title;
      this.pageUrlEl.textContent = url;
      this.pageUrlEl.title = url;
    }
    updateSelectedText(text) {
      if (text && text.length > 0) {
        this.selectedTextEl.textContent = text.length > 200 ? text.substring(0, 200) + "..." : text;
        this.selectedTextSectionEl.style.display = "block";
      } else {
        this.selectedTextSectionEl.style.display = "none";
      }
    }
    updateTabCount(count) {
      this.tabCountEl.textContent = `${count} tab${count === 1 ? "" : "s"}`;
    }
    checkConnectionStatus() {
      chrome.runtime.sendMessage({ type: "ping" }, (_response) => {
        if (chrome.runtime.lastError) {
          this.updateStatus("disconnected", "Extension error");
          return;
        }
        this.updateStatus("connected", "Ready to assist with Gemini CLI");
        this.openGeminiBtn.disabled = false;
      });
    }
    updateStatus(status, message) {
      this.statusEl.className = `status ${status}`;
      this.statusTextEl.textContent = message;
    }
    async openGeminiCli() {
      try {
        const newTabUrl = chrome.runtime.getURL("welcome.html");
        await chrome.tabs.create({ url: newTabUrl });
        window.close();
      } catch (error) {
        console.error("Error opening Gemini CLI:", error);
        this.updateStatus("disconnected", "Failed to open Gemini CLI");
      }
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    new PopupManager();
  });
})();
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=popup.js.map
