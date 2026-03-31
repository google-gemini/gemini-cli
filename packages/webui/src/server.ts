/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web GUI HTTP server for Gemini CLI.
 * Serves the Material You dashboard and API endpoints.
 */

import http from 'node:http';
import process from 'node:process';
import { type Config } from '@google/gemini-cli-core';

import { getStyles } from './styles.js';
import { getClientScript } from './client.js';
import {
  svgSearch,
  svgList,
  svgPlus,
  svgSidebar,
  svgFolder,
  svgChevDown,
  svgInfo,
  svgMaximize,
  svgCpu,
  svgSend,
  svgPalette,
} from './icons.js';
import {
  handleCommandProxy,
  handleFileSearch,
  handleFileRead,
  handleFileWrite,
  handleFileOpen,
  handleSessionsList,
  handleSessionLoad,
  handleSessionDelete,
  handleChatRequest,
  handleModels,
} from './api.js';

export const WEB_PORT = 11267;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

let server: http.Server | null = null;
let gcConfig: Config | null = null;

/** Set the CLI Config object — must be called before startServer. */
export function setConfig(config: Config | null): void {
  gcConfig = config;
}

/** Returns true if the web server is currently running. */
export function isRunning(): boolean {
  return server !== null;
}

// ── HTML Template ───────────────────────────────────────────────────────────

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Gemini CLI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${getStyles()}
</style>
</head>
<body>

<!-- Mobile sidebar toggle -->
<button class="sb-toggle" id="sbToggle" onclick="toggleMobileSidebar()" aria-label="Open menu">
  ${svgList()}
</button>
<div class="sb-overlay" id="sbOverlay" onclick="closeMobileSidebar()"></div>

<!-- ═══ Sidebar ═══ -->
<aside class="sidebar" id="sidebar">
  <div class="sb-header">
    <img class="brand-av" src="https://avatars.githubusercontent.com/ml/20450?s=82&v=4" alt="Logo">
    <span class="brand-name">Gemini CLI</span>
    <span class="brand-ver">web</span>
  </div>

  <div class="sb-section">
    <span class="sb-label">SESSIONS</span>
    <div class="sb-actions">
      <button class="ib" title="New chat" onclick="openDirPicker()">${svgPlus()}</button>
    </div>
  </div>

  <div class="sb-search-row">
    <div class="sb-sinput-wrap">
      ${svgSearch()}
      <input class="sb-sinput" type="text" placeholder="Search sessions..." id="searchInput" oninput="renderSessions()">
    </div>
    <div class="view-tog" id="viewToggle">
      <button class="active" id="viewList" title="List view" onclick="setView('list')">
        ${svgList()}
      </button>
      <button id="viewTree" title="Grouped by folder" onclick="setView('tree')">
        <svg class="ic xs" viewBox="0 0 24 24"><path d="M20 10a1 1 0 001-1V6a1 1 0 00-1-1h-2.5a1 1 0 01-.8-.4l-.9-1.2A1 1 0 0015 3h-2a1 1 0 00-1 1v5a1 1 0 001 1z"/><path d="M20 21a1 1 0 001-1v-3a1 1 0 00-1-1h-2.9a1 1 0 01-.88-.55l-.42-.85a1 1 0 00-.92-.6H13a1 1 0 00-1 1v5a1 1 0 001 1z"/><path d="M3 5a2 2 0 002 2h3"/><path d="M3 3v13a2 2 0 002 2h3"/></svg>
      </button>
    </div>
  </div>

  <div class="sb-list" id="sessionList"></div>

  <div class="sb-nav"></div>
  <div class="sb-footer">
    <button class="ib" title="About">${svgInfo()}</button>
    <button class="ib" title="Toggle sidebar" onclick="toggleSidebar()">${svgSidebar()}</button>
  </div>
</aside>

<!-- ═══ Main ═══ -->
<main class="main">
  <div class="app-shell">
    <!-- Top bar -->
    <div class="topbar">
      <div class="topbar-l">
        <div class="topbar-kicker">Gemini CLI Web</div>
        <span class="topbar-title" id="topTitle">Untitled</span>
      </div>
      <div class="topbar-r">
        <button class="folder-chip" type="button" onclick="openDirPicker()" title="Choose working directory">
          ${svgFolder()}
          <span class="folder-path">Working directory</span>
          ${svgChevDown()}
        </button>
        <button class="ib" type="button" aria-label="Open about panel" title="About" onclick="showPanel('about')">${svgInfo()}</button>
        <button class="ib" type="button" aria-label="Open theme picker" title="Theme" onclick="openThemePicker()">${svgPalette()}</button>
        <button class="ib ib-disabled" type="button" aria-label="Fullscreen is not available in this view" title="Fullscreen coming soon" disabled>${svgMaximize()}</button>
      </div>
    </div>

    <div class="chat-stage">
      <div class="chat-column">
        <!-- Chat -->
        <div class="chat" id="chatArea">
          <div class="empty" id="emptyState">
            <div class="empty-badge">AI coding teammate</div>
            <img class="empty-logo" src="https://avatars.githubusercontent.com/ml/20450?s=82&v=4" alt="Gemini CLI logo">
            <h2>Start with a prompt, command, file, or saved session.</h2>
            <p>Use the composer like Gemini CLI: type a request, press <code class="il">/</code> for workflow commands, or <code class="il">@</code> to attach project files as context.</p>
            <div class="empty-grid">
              <div class="empty-card">
                <div class="empty-card-k">Quick start</div>
                <ul class="empty-list">
                  <li><code class="il">/help</code> shows available web-safe commands</li>
                  <li><code class="il">@src/file.ts</code> attaches a file before sending</li>
                  <li>Pick a working directory from the folder chip above</li>
                </ul>
              </div>
              <div class="empty-card">
                <div class="empty-card-k">Before you send</div>
                <ul class="empty-list">
                  <li>Choose a model in the composer footer</li>
                  <li>Use the sidebar to resume CLI or draft sessions</li>
                  <li>Attached files are read into the prompt and may be truncated</li>
                </ul>
              </div>
            </div>
            <div class="sug-row">
              <button class="sug" onclick="useSug(this)">Explain this codebase</button>
              <button class="sug" onclick="useSug(this)">Review @packages/webui/src/client.ts for UX issues</button>
              <button class="sug" onclick="useSug(this)">/resume</button>
              <button class="sug" onclick="useSug(this)">Create a plan for improving mobile usability</button>
            </div>
          </div>
        </div>

        <!-- ═══ Panels ═══ -->
        <div class="panel" id="panelStats"><div class="mw">
          <div class="panel-header">
            <button class="back-btn" onclick="showPanel('chat')"><svg class="ic" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></button>
            <h2>Session Statistics</h2>
          </div>
          <div id="statsContent"><div class="stat-card"><div class="stat-row"><span class="stat-label">Loading...</span></div></div></div>
        </div></div>

        <div class="panel" id="panelTools"><div class="mw">
          <div class="panel-header">
            <button class="back-btn" onclick="showPanel('chat')"><svg class="ic" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></button>
            <h2>Available Tools</h2>
          </div>
          <div id="toolsContent"><div class="tool-item"><span class="stat-label">Loading...</span></div></div>
        </div></div>

        <div class="panel" id="panelMemory"><div class="mw">
          <div class="panel-header">
            <button class="back-btn" onclick="showPanel('chat')"><svg class="ic" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></button>
            <h2>Memory (GEMINI.md)</h2>
          </div>
          <div id="memoryContent"><div class="mem-section"><span class="stat-label">Loading...</span></div></div>
        </div></div>

        <div class="panel" id="panelAbout"><div class="mw">
          <div class="panel-header">
            <button class="back-btn" onclick="showPanel('chat')"><svg class="ic" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></button>
            <h2>About</h2>
          </div>
          <div id="aboutContent"><div class="stat-card"><div class="stat-row"><span class="stat-label">Loading...</span></div></div></div>
        </div></div>

        <!-- Theme modal -->
        <div class="modal-overlay" id="themeModal" onclick="if(event.target===this)closeThemePicker()">
          <div class="modal">
            <h2>Choose Theme</h2>
            <div class="theme-grid" id="themeGrid"></div>
          </div>
        </div>

        <!-- Files panel -->
        <div class="files-panel" id="filesPanel" aria-hidden="true">
          <div class="fp-head">
            <div>
              <div class="fp-title">File activity</div>
              <div class="fp-subtitle">Files written from assistant responses appear here.</div>
            </div>
          </div>
          <div class="fp-list" id="fpList"></div>
          <div class="fp-cwd" id="fpCwd">
            <svg class="ic xs" viewBox="0 0 24 24"><path d="m6 14 1.5-2.9A2 2 0 019.24 10H20a2 2 0 011.94 2.5l-1.54 6a2 2 0 01-1.95 1.5H4a2 2 0 01-2-2V5a2 2 0 012-2h3.9a2 2 0 011.69.9l.81 1.2a2 2 0 001.67.9H18a2 2 0 012 2v2"/></svg>
            <span id="fpCwdPath"></span>
          </div>
        </div>

        <!-- Input area -->
        <div class="inp-area">
          <div class="status-bar" aria-label="Conversation status and context">
            <div class="chips-l">
              <div class="chip status-chip"><div class="st-dot"></div><span id="statusText">Awaiting input</span></div>
              <button class="chip clk" type="button" id="filesChip" onclick="toggleFilesPanel()" aria-expanded="false" aria-controls="filesPanel" aria-label="Open file activity panel">
                ${svgFolder()}
                <span style="color:var(--green)" id="filesAdded">+0</span>
                <span style="color:var(--red)" id="filesRemoved">-0</span>
                <span id="filesCount">0 files</span>
                ${svgChevDown()}
              </button>
            </div>
            <div class="ctx-wrap" id="ctxWrap">
              <button class="chip clk" type="button" id="contextChip" onclick="toggleCtxPanel()" aria-expanded="false" aria-controls="ctxPanel" aria-label="Open context usage panel">
                <svg class="ctx-ring" width="14" height="14" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity=".25"/>
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-dasharray="62.83" stroke-dashoffset="62.83" stroke-linecap="round"
                    id="ctxRing" style="transform-origin:center;transform:rotate(-90deg)"/>
                </svg>
                <span id="ctxPct">0.0% context</span>
              </button>
              <div class="ctx-panel" id="ctxPanel" aria-hidden="true">
                <div class="ctx-top">
                  <div class="ctx-row"><span id="ctxPctLg">0.0%</span><span class="ctx-mono" id="ctxTokens">0 / 0</span></div>
                  <div class="ctx-bar"><div class="ctx-fill" id="ctxFill" style="width:0%"></div></div>
                </div>
                <div class="ctx-details">
                  <div class="ctx-section">
                    <div class="ctx-sh">Input Tokens</div>
                    <div class="ctx-row"><span class="ctx-lbl">Regular</span><span id="ctxInputReg">0</span></div>
                    <div class="ctx-row"><span class="ctx-lbl">Cache Read</span><span id="ctxCacheR">0</span></div>
                    <div class="ctx-row"><span class="ctx-lbl">Cache Write</span><span id="ctxCacheW">0</span></div>
                    <div class="ctx-row ctx-total"><span>Total Input</span><span id="ctxInputTotal">0</span></div>
                  </div>
                  <div class="ctx-section">
                    <div class="ctx-sh">Output Tokens</div>
                    <div class="ctx-row"><span class="ctx-lbl">Generated</span><span id="ctxOutputGen">0</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="inp-box" id="inputBox">
            <div class="sl-menu" id="slashMenu">
              <div class="sl-hdr">SLASH COMMANDS</div>
              <div class="sl-list" id="slashList"></div>
            </div>
            <div class="at-menu" id="atMenu">
              <div class="at-hdr">@ MENTION FILES</div>
              <div class="at-list" id="atList"></div>
            </div>
            <div id="attachedFiles" class="attached-files" style="display:none" aria-live="polite"></div>
            <textarea class="chat-input" id="chatInput" aria-label="Message composer" placeholder="Message Gemini CLI — type / for commands, @ for files" rows="1" oninput="onInput(this)" onkeydown="onKey(event)"></textarea>
            <div class="tb">
              <div class="tb-l">
                <div class="model-wrap">
                  <button class="model-btn" type="button" id="modelBtn" onclick="toggleModelPicker()" aria-expanded="false" aria-controls="modelDropdown" aria-label="Select model">
                    ${svgCpu()}
                    <span id="modelLabel">gemini-2.0-flash</span>
                    ${svgChevDown()}
                  </button>
                  <div class="model-dd-shell" id="modelDd">
                    <div class="model-dd" id="modelDropdown">
                      <div class="model-dd-hdr">SELECT MODEL</div>
                      <div class="model-dd-list" id="modelList"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="tb-r">
                <button class="send-btn" type="button" id="sendBtn" title="Send" aria-label="Send message" onclick="sendMessage()">
                  ${svgSend()}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>

<!-- Directory picker popup -->
<div class="dir-overlay" id="dirOverlay" onclick="if(event.target===this)closeDirPicker()">
  <div class="dir-box">
    <div class="dir-input-row">
      ${svgSearch()}
      <input class="dir-input" id="dirInput" type="text" placeholder="Search directories or type a path..." oninput="filterDirs()" onkeydown="dirKey(event)">
    </div>
    <div class="dir-list" id="dirList"></div>
  </div>
</div>

<script>
${getClientScript()}
</script>
</body>
</html>`;
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

export function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve();
      return;
    }
    const srv = http.createServer(async (req, res) => {
      const url = req.url ?? '/';

      res.setHeader(
        'Access-Control-Allow-Origin',
        'http://localhost:' + WEB_PORT,
      );

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'POST' && url === '/api/chat') {
        await handleChatRequest(req, res, gcConfig);
        return;
      }

      if (req.method === 'POST' && url === '/api/command') {
        await handleCommandProxy(req, res, gcConfig);
        return;
      }

      if (req.method === 'POST' && url === '/api/files/search') {
        await handleFileSearch(req, res);
        return;
      }

      if (req.method === 'POST' && url === '/api/files/read') {
        await handleFileRead(req, res);
        return;
      }

      if (req.method === 'POST' && url === '/api/files/write') {
        await handleFileWrite(req, res);
        return;
      }

      if (req.method === 'POST' && url === '/api/files/open') {
        await handleFileOpen(req, res);
        return;
      }

      if (req.method === 'GET' && url === '/api/sessions') {
        await handleSessionsList(res, gcConfig);
        return;
      }

      if (req.method === 'POST' && url === '/api/sessions/load') {
        await handleSessionLoad(req, res, gcConfig);
        return;
      }

      if (req.method === 'POST' && url === '/api/sessions/delete') {
        await handleSessionDelete(req, res, gcConfig);
        return;
      }

      if (req.method === 'GET' && url === '/api/models') {
        handleModels(res, gcConfig);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHTML());
    });

    srv.on('error', reject);
    srv.listen(WEB_PORT, 'localhost', () => {
      server = srv;

      const cleanup = () => {
        server?.close();
        server = null;
      };
      process.once('exit', cleanup);
      process.once('SIGINT', () => {
        cleanup();
        process.exit(0);
      });
      process.once('SIGTERM', () => {
        cleanup();
        process.exit(0);
      });

      resolve();
    });
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      resolve();
    });
  });
}
