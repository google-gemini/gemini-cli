/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side JavaScript for the web GUI.
 * Runs in the browser — returned as a string to be embedded in <script>.
 * Uses ES5-compatible syntax (var, function) for broad browser support.
 */
export function getClientScript(): string {
  return `
/* ═══ SVG Icon Helpers (inlined at build) ═══ */
/* Already rendered server-side via template interpolation */

/* ═══ State ═══ */
var sessions = normalizeDraftSessions(JSON.parse(localStorage.getItem('gcw_s') || '[]'));
var cliSessions = [];
var curId = null;
var curSource = 'draft';
var curMsgs = [];
var streaming = false;
var initialSessionParam = getSessionParam();

var MODELS = [];
var selectedModel = '';

var SLASH_CMDS = [
  {cmd:'/model',    desc:'Change the AI model',        action:'model'},
  {cmd:'/clear',    desc:'Clear the chat history',     action:'clear'},
  {cmd:'/resume',   desc:'Browse saved CLI sessions',  action:'resume'},
  {cmd:'/stats',    desc:'Session statistics',         action:'stats'},
  {cmd:'/tools',    desc:'List available tools',       action:'tools'},
  {cmd:'/memory',   desc:'View GEMINI.md memory',      action:'memory'},
  {cmd:'/init',     desc:'Analyze project & create GEMINI.md', action:'init'},
  {cmd:'/theme',    desc:'Change the visual theme',    action:'theme'},
  {cmd:'/copy',     desc:'Copy last response',         action:'copy'},
  {cmd:'/about',    desc:'Version & environment info', action:'about'},
  {cmd:'/docs',     desc:'Open Gemini CLI docs',       action:'docs'},
  {cmd:'/compress', desc:'Compress context',           action:'compress'},
  {cmd:'/corgi',    desc:'A friendly corgi',           action:'corgi'},
  {cmd:'/help',     desc:'Show available commands',    action:'help'},
];

var chatArea = document.getElementById('chatArea');
var emptyState = document.getElementById('emptyState');
var chatInput = document.getElementById('chatInput');
var sendBtn = document.getElementById('sendBtn');
var slashMenu = document.getElementById('slashMenu');
var slashList = document.getElementById('slashList');
var toastHost = null;
var attachedFileMeta = {};

function ensureToastHost(){
  if(toastHost) return toastHost;
  toastHost = document.getElementById('toastHost');
  if(toastHost) return toastHost;
  toastHost = document.createElement('div');
  toastHost.id = 'toastHost';
  toastHost.className = 'toast-host';
  toastHost.setAttribute('aria-live', 'polite');
  toastHost.setAttribute('aria-atomic', 'false');
  document.body.appendChild(toastHost);
  return toastHost;
}

function showToast(kind, text){
  var host = ensureToastHost();
  var toast = document.createElement('div');
  toast.className = 'toast ' + (kind || 'info');
  toast.textContent = text;
  host.appendChild(toast);
  setTimeout(function(){ toast.classList.add('show'); }, 10);
  setTimeout(function(){
    toast.classList.remove('show');
    setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); }, 180);
  }, 2600);
}

function getChatMessages(){
  return chatArea ? chatArea.querySelectorAll('.a-msg, .u-row') : [];
}

function isChatEmpty(){
  return getChatMessages().length === 0;
}

function scrollChatToBottom(){
  if(chatArea) chatArea.scrollTop = chatArea.scrollHeight;
}

function closeTransientUi(){
  closeSlash();
  closeAt();
  closeModelPicker();
  closeCtxPanel();
  closeFilesPanel();
  closeAllFileMenus();
}

function normalizeDraftSessions(items){
  return (items || []).map(function(session){
    session.source = 'draft';
    return session;
  });
}

function getSessionParam(){
  try {
    var params = new URLSearchParams(window.location.search || '');
    return params.get('session') || '';
  } catch(_) {
    return '';
  }
}

function syncSessionUrl(sessionId){
  try {
    var url = new URL(window.location.href);
    if(sessionId) url.searchParams.set('session', sessionId);
    else url.searchParams.delete('session');
    window.history.replaceState({}, '', url.toString());
  } catch(_) {}
}

/* ═══ Helpers ═══ */
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function stripMalformedInlineHtml(text){
  if(!text || text.indexOf('<') === -1) return text;

  // First, protect already-valid inline code from being processed
  var codeBlocks = [];
  text = text.replace(/<code\\b[^>]*>([\\s\\S]*?)<\\/code>/gi, function(_, inner){
    codeBlocks.push(inner);
    return '%%CODE' + (codeBlocks.length - 1) + '%%';
  });

  // Collapse pathological per-character strong/em wrappers back into plain text.
  text = text.replace(/(?:\\s*<(?:strong|em|del)>(?:[\\s\\S]*?)<\\/(?:strong|em|del)>\\s*){3,}/gi, function(block){
    return block.replace(/<\\/?(?:strong|em|del)>/gi, '');
  });

  // Drop stray wrapper divs/spans that only damage layout, while preserving line breaks.
  text = text.replace(/<div\\b[^>]*>/gi, '\\n');
  text = text.replace(/<\\/div>/gi, '\\n');
  text = text.replace(/<\\/?span\\b[^>]*>/gi, '');
  text = text.replace(/<br\\s*\\/?>/gi, '\\n');

  // Restore protected code blocks with backticks
  for(var i = 0; i < codeBlocks.length; i++){
    var inner = codeBlocks[i].replace(/\\x60/g, '\\x60');
    text = text.replace('%%CODE' + i + '%%', '\`' + inner + '\`');
  }

  return text;
}

function stripFragmentedMarkdown(text){
  if(!text) return text;

  // Collapse pathological bold fragments like **H****e****l****l****o**
  text = text.replace(/(?:\\*\\*[^*\\n]{1,4}\\*\\*\\s*){3,}/g, function(block){
    return block.replace(/\\*\\*([^*\\n]{1,4})\\*\\*/g, '$1');
  });

  // Collapse pathological italic fragments like *H**e**l*
  text = text.replace(/(?:\\*[^*\\n]{1,4}\\*\\s*){3,}/g, function(block){
    return block.replace(/\\*([^*\\n]{1,4})\\*/g, '$1');
  });

  return text;
}

function stripReferenceContent(text){
  if(!text) return text;
  return text
    .replace(/\\n*<reference_content\\b[^>]*>[\\s\\S]*?<\\/reference_content>/gi, '')
    .trim();
}

function renderMd(text){
  var triple = '\`\`\`';
  var normalized = stripFragmentedMarkdown(stripMalformedInlineHtml(text));
  var parts = normalized.split(triple);
  var out = '';

  for(var i=0; i<parts.length; i++){
    if(i % 2 === 0){
      // Step 1: HTML-escape the entire segment first.
      var t = esc(parts[i]);

      // Step 2: Bold (**text**) - require at least 2 chars or 1 char with word boundary
      // More conservative: only match **text** where text has at least 2 non-star chars
      t = t.replace(/\\*\\*([^*\\n]{2,}|[^*\\n][^*\\n]*[^*\\n])\\*\\*/g, '<strong>$1</strong>');

      // Step 3: Italic (*text*) - single star, require at least 2 chars
      t = t.replace(/\\*([^*\\n]{2,}|[^*\\n][^*\\n]*[^*\\n])\\*/g, '<em>$1</em>');

      // Step 4: Strikethrough ~~text~~
      t = t.replace(/~~([^~\\n]{2,}|[^~\\n][^~\\n]*[^~\\n])~~/g, '<del>$1</del>');

      // Step 5: Inline code (backtick-quoted)
      t = t.replace(/\\x60([^\\x60\\n]+?)\\x60/g, '<code class="il">$1</code>');

      // Step 6: Process line by line for headers and lists.
      var lines = t.split('\\n');
      for(var j=0; j<lines.length; j++){
        var raw = lines[j];
        var trimmed = raw.trim();
        if(!trimmed){ lines[j]=''; continue; }
        if(trimmed.indexOf('### ')===0){
          lines[j] = '<h3>'+trimmed.substring(4)+'</h3>';
        } else if(trimmed.indexOf('## ')===0){
          lines[j] = '<h2>'+trimmed.substring(3)+'</h2>';
        } else if(trimmed.indexOf('# ')===0){
          lines[j] = '<h1>'+trimmed.substring(2)+'</h1>';
        } else if(/^\\d+\\. /.test(trimmed)){
          var nm = trimmed.match(/^(\\d+)\\. ([\\s\\S]*)$/);
          if(nm) lines[j] = '<div style="margin-left:16px;display:flex;gap:8px"><span style="flex-shrink:0">'+nm[1]+'.</span><span>'+nm[2]+'</span></div>';
          else lines[j] = raw+'<br>';
        } else if(trimmed.indexOf('- ')===0 || trimmed.indexOf('* ')===0){
          lines[j] = '<div style="margin-left:16px;display:flex;gap:8px"><span>•</span><span>'+trimmed.substring(2)+'</span></div>';
        } else {
          lines[j] = raw+'<br>';
        }
      }
      out += lines.join('\\n');
    } else {
      // Code block
      var part = parts[i];
      var nl = part.indexOf('\\n');
      var lang = nl > -1 ? part.substring(0, nl).trim() : '';
      var code = nl > -1 ? part.substring(nl+1) : part;
      var fpath = '';
      if(lang.indexOf('__FILE:')===0){
        fpath = lang.substring(7).trim();
      } else {
        var codeBody = code.trimStart();
        if(codeBody.indexOf('__FILE:')===0){
          var bodyNl = codeBody.indexOf('\\n');
          fpath = codeBody.substring(7, bodyNl > -1 ? bodyNl : codeBody.length).trim();
          code = bodyNl > -1 ? codeBody.substring(bodyNl+1) : '';
        }
      }

      var id = 'cb_' + Math.random().toString(36).slice(2);
      if(fpath){
        // File write card with collapsible preview
        var fcId = 'fc_' + Math.random().toString(36).slice(2);
        var safeId = fcId.replace(/'/g,'');
        var safePreId = id.replace(/'/g,'');
        var safeFpath = esc(fpath.replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
        var shortFpath = fpath.length > 40 ? '...' + fpath.slice(-37) : fpath;
        out += '<div class="tool-call file-card" id="'+fcId+'">' +
          '<div class="tool-call-hdr" onclick="toggleFileCard(event, \\''+safeId+'\\')">'+
            '<span class="tool-call-icon">'+SVG_FILE+'</span>' +
            '<span class="tool-call-title">WriteFile</span>' +
            '<span class="tool-call-meta">'+esc(shortFpath)+'</span>' +
            '<span class="tool-call-status"><div class="fc-dot" style="margin-right:6px"></div></span>' +
            '<svg class="ic xs tool-call-chev" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>' +
          '</div>' +
          '<div class="tool-call-body fc-body">' +
            '<div class="fc-path" style="border-radius:0;border:none;margin:0;padding:10px 14px;background:var(--bg-low);font-size:11px">Writing to: <code>'+esc(fpath)+'</code></div>' +
            '<div class="fc-preview" style="max-height:200px;border-top:1px solid var(--outline)"><pre id="'+id+'" style="margin:0">'+esc(code.trim())+'</pre></div>' +
            '<div class="fc-btns" style="padding:10px 14px;background:var(--bg-low);border-top:1px solid var(--outline)">' +
              '<button class="fc-btn primary" onclick="approveFile(\\''+safeId+'\\',\\''+safeFpath+'\\',\\''+safePreId+'\\')">&#10003; Approve<kbd>1</kbd></button>' +
              '<button class="fc-btn" onclick="approveFileSession(\\''+safeId+'\\',\\''+safeFpath+'\\',\\''+safePreId+'\\')">Session<kbd>2</kbd></button>' +
              '<button class="fc-btn danger" onclick="declineFile(\\''+safeId+'\\')">&#10007; Decline<kbd>3</kbd></button>' +
            '</div>' +
          '</div>' +
        '</div>';
      } else {
        // Regular code block with collapsible
        var langText = lang || 'text';
        var shortLang = langText.length > 20 ? langText.slice(0,17) + '...' : langText;
        out += '<div class="tool-call">' +
          '<div class="tool-call-hdr" onclick="toggleCodeBlock(event, this)">' +
            '<span class="tool-call-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg></span>' +
            '<span class="tool-call-title">'+esc(langText)+'</span>' +
            '<span class="tool-call-meta">'+code.trim().split('\\n').length+' lines</span>' +
            '<svg class="ic xs tool-call-chev" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>' +
          '</div>' +
          '<div class="tool-call-body">' +
            '<div style="display:flex;justify-content:flex-end;padding:4px 8px;background:var(--bg-low);border-top:1px solid var(--outline)">' +
              '<button class="cb-copy" onclick="cpCode(\\''+id+'\\')" style="border:none;padding:4px 8px">Copy</button>' +
            '</div>' +
            '<pre id="'+id+'">'+esc(code.trim())+'</pre>' +
          '</div>' +
        '</div>';
      }
    }
  }
  return out;
}

function cpCode(id){ var e=document.getElementById(id); if(e) navigator.clipboard.writeText(e.textContent).catch(function(){}); }

function setExpandedState(id, expanded){
  var el = document.getElementById(id);
  if(el) el.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function setPanelHidden(id, hidden){
  var el = document.getElementById(id);
  if(el) el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

/* ═══ Toggle Functions for Collapsible Sections ═══ */
function toggleCodeBlock(event, headerEl){
  event.stopPropagation();
  var toolCall = headerEl.closest('.tool-call');
  if(!toolCall) return;
  var body = toolCall.querySelector('.tool-call-body');
  var chev = headerEl.querySelector('.tool-call-chev');
  if(body && chev){
    if(body.classList.contains('open')){
      body.classList.remove('open');
      chev.classList.remove('open');
    } else {
      body.classList.add('open');
      chev.classList.add('open');
    }
  }
}

function toggleFileCard(event, cardId){
  event.stopPropagation();
  var card = document.getElementById(cardId);
  if(!card) return;
  var body = card.querySelector('.tool-call-body');
  var chev = card.querySelector('.tool-call-chev');
  if(body && chev){
    if(body.classList.contains('open')){
      body.classList.remove('open');
      chev.classList.remove('open');
    } else {
      body.classList.add('open');
      chev.classList.add('open');
    }
  }
}

/* ═══ File Approval & Tracking ═══ */
var sessionApprovedPaths = {};
var writtenFiles = [];
var openFileMenuPath = null;

async function doWriteFile(cardId, fpath, preId){
  var card = document.getElementById(cardId);
  var pre = document.getElementById(preId);
  if(!card || !pre) return;
  var btns = card.querySelector('.fc-btns');
  var header = card.querySelector('.tool-call-hdr');
  if(!btns) return;
  btns.innerHTML = '<span style="color:var(--muted);font-size:12px">Saving...</span>';
  try {
    var resp = await fetch('/api/files/write', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:fpath, content:pre.textContent})
    });
    var data = await resp.json();
    if(data.ok){
      card.classList.add('approved');
      card.classList.add('check');
      card.classList.remove('error');
      // Update header status
      if(header){
        var statusEl = header.querySelector('.tool-call-status');
        if(statusEl) statusEl.innerHTML = SVG_CHECK;
        var metaEl = header.querySelector('.tool-call-meta');
        if(metaEl) metaEl.textContent = fpath.length > 40 ? '...' + fpath.slice(-37) : fpath;
      }
      btns.innerHTML = '<div class="fc-status ok">Saved to workspace</div>';
      // Auto-expand to show success
      var body = card.querySelector('.tool-call-body');
      if(body) body.classList.add('open');
      trackWrittenFile(fpath, pre.textContent.split('\\n').length);
      showToast('success', 'Saved ' + fpath);
    } else {
      card.classList.add('error');
      btns.innerHTML = '<div class="fc-status err">\\u2717 ' + esc(data.error || 'Failed to save') + '</div>';
      showToast('error', 'Failed to save ' + fpath);
    }
  } catch(e){
    card.classList.add('error');
    btns.innerHTML = '<div class="fc-status err">\\u2717 ' + esc(String(e)) + '</div>';
    showToast('error', 'Failed to save ' + fpath);
  }
}

function approveFile(cardId, fpath, preId){
  doWriteFile(cardId, fpath, preId);
}

function approveFileSession(cardId, fpath, preId){
  sessionApprovedPaths[fpath] = true;
  doWriteFile(cardId, fpath, preId);
}

function declineFile(cardId){
  var card = document.getElementById(cardId);
  if(!card) return;
  card.classList.add('declined');
  var btns = card.querySelector('.fc-btns');
  btns.innerHTML = '<div class="fc-status err">Write declined</div>';
  showToast('info', 'File write declined');
}

function trackWrittenFile(fpath, lines){
  var existing = writtenFiles.find(function(f){ return f.path === fpath; });
  if(existing){ existing.lines = lines; }
  else { writtenFiles.push({path:fpath, lines:lines || 0}); }
  updateFilesPanel();
}

function updateFilesPanel(){
  var totalAdded = 0;
  writtenFiles.forEach(function(f){ totalAdded += f.lines; });
  var countEl = document.getElementById('filesCount');
  var addedEl = document.getElementById('filesAdded');
  if(countEl) countEl.textContent = writtenFiles.length + ' file' + (writtenFiles.length !== 1 ? 's' : '');
  if(addedEl) addedEl.textContent = '+' + totalAdded;

  var list = document.getElementById('fpList');
  if(list){
    list.innerHTML = '';
    if(writtenFiles.length === 0){
      list.innerHTML = '<div class="fp-empty"><strong>No approved file writes yet.</strong><span>When the assistant proposes a file write, approve it to track saves and open the result here.</span></div>';
    }
    writtenFiles.forEach(function(f, idx){
      var el = document.createElement('div');
      el.className = 'fp-item';
      var menuId = 'fp_menu_' + idx;
      var isOpen = openFileMenuPath === f.path;
      el.innerHTML =
        '<svg class="ic xs" viewBox="0 0 24 24"><path d="M6 22a2 2 0 01-2-2V4a2 2 0 012-2h8a2.4 2.4 0 011.7.7l3.6 3.6A2.4 2.4 0 0120 8v12a2 2 0 01-2 2z"/><path d="M14 2v5a1 1 0 001 1h5"/></svg>' +
        '<span class="fp-adds"><span class="add">+' + f.lines + '</span></span>' +
        '<span class="fp-path" title="' + esc(f.path) + '">' + esc(f.path) + '</span>' +
        '<div class="fp-actions">' +
          '<button type="button" class="fp-open-btn" aria-expanded="' + (isOpen ? 'true' : 'false') + '" aria-controls="' + menuId + '" onclick="toggleFileMenu(event, \'' + esc(escJs(f.path)) + '\', \'' + menuId + '\')">Open</button>' +
          '<div class="fp-menu' + (isOpen ? ' open' : '') + '" id="' + menuId + '">' +
            '<button type="button" class="fp-menu-item" onclick="openTrackedFile(event, \\'' + escJs(f.path) + '\\', \\'finder\\')">Finder</button>' +
            '<button type="button" class="fp-menu-item" onclick="openTrackedFile(event, \\'' + escJs(f.path) + '\\', \\'cursor\\')">Cursor</button>' +
            '<button type="button" class="fp-menu-item" onclick="openTrackedFile(event, \\'' + escJs(f.path) + '\\', \\'vscode\\')">VS Code</button>' +
            '<div class="fp-menu-sep"></div>' +
            '<button type="button" class="fp-menu-item" onclick="copyTrackedFilePath(event, \\'' + escJs(f.path) + '\\')">Copy path</button>' +
          '</div>' +
        '</div>';
      list.appendChild(el);
    });
  }
  var cwdEl = document.getElementById('fpCwdPath');
  if(cwdEl) cwdEl.textContent = currentCwd || 'Unknown';
}

function toggleFilesPanel(){
  var panel = document.getElementById('filesPanel');
  if(panel){
    if(panel.classList.contains('open')){
      panel.classList.remove('open');
      setExpandedState('filesChip', false);
      setPanelHidden('filesPanel', true);
      openFileMenuPath = null;
    } else {
      closeCtxPanel();
      panel.classList.add('open');
      setExpandedState('filesChip', true);
      setPanelHidden('filesPanel', false);
    }
    updateFilesPanel();
  }
}

function escJs(s){
  return String(s).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\'");
}

function escJsDouble(s){
  return String(s).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\"');
}

function toggleFileMenu(event, path, menuId){
  event.stopPropagation();
  openFileMenuPath = openFileMenuPath === path ? null : path;
  updateFilesPanel();
}

async function openTrackedFile(event, path, target){
  event.stopPropagation();
  openFileMenuPath = null;
  updateFilesPanel();
  try {
    var resp = await fetch('/api/files/open', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:path, target:target})
    });
    var data = await resp.json();
    if(!resp.ok || !data.ok){
      addMsg('system', '<span class="err-msg">' + esc(data.error || 'Failed to open file') + '</span>');
      showToast('error', 'Failed to open ' + path);
    } else {
      showToast('success', 'Opened ' + path + ' in ' + target);
    }
  } catch(e){
    addMsg('system', '<span class="err-msg">' + esc(String(e)) + '</span>');
    showToast('error', 'Failed to open ' + path);
  }
}

async function copyTrackedFilePath(event, path){
  event.stopPropagation();
  openFileMenuPath = null;
  updateFilesPanel();
  try {
    await navigator.clipboard.writeText(path);
    showToast('success', 'Copied file path');
  } catch(e){
    addMsg('system', '<span class="err-msg">' + esc('Failed to copy path') + '</span>');
    showToast('error', 'Failed to copy file path');
  }
}

/* ═══ Sessions ═══ */
var sbView = localStorage.getItem('gcw_view') || 'list';
var wsOpen = {};
var currentCwd = '';

function setView(v){
  sbView = v;
  localStorage.setItem('gcw_view', v);
  document.getElementById('viewList').className = v==='list'?'active':'';
  document.getElementById('viewTree').className = v==='tree'?'active':'';
  renderSessions();
}

function shortPath(p){
  if(!p) return 'Unknown';
  var parts = p.replace(/\\\\/g,'/').split('/');
  return parts.length <= 3 ? p : '.../' + parts.slice(-2).join('/');
}

function makeSI(s){
  var el = document.createElement('div');
  var isActive = s.id === curId && (s.source || 'draft') === curSource;
  var source = s.source || 'draft';
  el.className = 'si' + (isActive ? ' active' : '');
  el.innerHTML = '<span class="si-main">' +
      '<span class="si-t">' + esc(s.title||'Untitled') + '</span>' +
      '<span class="si-src ' + esc(source) + '">' + (source === 'cli' ? 'CLI' : 'Draft') + '</span>' +
    '</span>' +
    '<span class="si-d">' + esc(s.time||'') + '</span>' +
    '<button class="si-del" title="Delete" onclick="event.stopPropagation();confirmDeleteSession(\'' + esc(escJs(s.id)) + '\', \'' + esc(escJs(source)) + '\')"><svg class="ic xs" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>';
  el.onclick = function(){ loadSession(s.id, source); };
  return el;
}

function getAllSessions(){
  return cliSessions.concat(sessions);
}

function renderSessions(){
  var list = document.getElementById('sessionList');
  list.innerHTML = '';
  var q = (document.getElementById('searchInput').value||'').toLowerCase();
  var filtered = getAllSessions().filter(function(s){
    return !q || (s.title||'').toLowerCase().indexOf(q) > -1;
  });

  if(sbView === 'tree'){
    // Group by cwd
    var groups = {};
    var order = [];
    filtered.forEach(function(s){
      var c = s.cwd || 'Unknown';
      if(!groups[c]){ groups[c] = []; order.push(c); }
      groups[c].push(s);
    });
    order.forEach(function(cwd){
      var items = groups[cwd];
      var isOpen = wsOpen[cwd] !== false;
      var grp = document.createElement('div');
      grp.className = 'ws-group';

      var hdr = document.createElement('div');
      hdr.className = 'ws-hdr';
      hdr.innerHTML = '<svg class="ic xs ws-chev' + (isOpen?'':' closed') + '" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
        '<span class="ws-path">' + esc(shortPath(cwd)) + '</span>' +
        '<span class="ws-cnt">(' + items.length + ')</span>' +
        '<button class="ws-new" title="New chat in this folder" onclick="event.stopPropagation(); newChatInCwd(&quot;' + escJsDouble(cwd) + '&quot;)"><svg class="ic xs" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>';
      hdr.onclick = function(){ wsOpen[cwd] = !isOpen; renderSessions(); };
      grp.appendChild(hdr);

      var body = document.createElement('div');
      body.className = 'ws-items' + (isOpen?'':' closed');
      items.forEach(function(s){ body.appendChild(makeSI(s)); });
      grp.appendChild(body);
      list.appendChild(grp);
    });
  } else {
    filtered.slice(0,30).forEach(function(s){ list.appendChild(makeSI(s)); });
  }
}

function delSession(id){
  delSessionWithSource(id, 'draft');
}

var pendingDelete = null;

function confirmDeleteSession(id, source){
  var s = getAllSessions().find(function(x){ return x.id === id && (x.source||'draft') === source; });
  var title = s ? (s.title || 'Untitled') : id;
  pendingDelete = {id:id, source:source};
  var overlay = document.getElementById('deleteOverlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'deleteOverlay';
    overlay.className = 'dir-overlay';
    overlay.innerHTML = '<div class="dir-box" style="max-width:380px;padding:20px"><div style="font-size:15px;font-weight:600;margin-bottom:8px">Delete session?</div><div id="deleteMsg" style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin-bottom:16px;word-break:break-word"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="fc-btn" onclick="closeDeleteConfirm()">Cancel</button><button class="fc-btn danger" onclick="doDeleteSession()">Delete</button></div></div>';
    overlay.onclick = function(e){ if(e.target === overlay) closeDeleteConfirm(); };
    document.body.appendChild(overlay);
  }
  document.getElementById('deleteMsg').textContent = '"' + (title.length > 60 ? title.slice(0,57) + '...' : title) + '"';
  overlay.classList.add('open');
}

function closeDeleteConfirm(){
  pendingDelete = null;
  var overlay = document.getElementById('deleteOverlay');
  if(overlay) overlay.classList.remove('open');
}

async function doDeleteSession(){
  if(!pendingDelete) return;
  var id = pendingDelete.id;
  var source = pendingDelete.source;
  closeDeleteConfirm();
  await delSessionWithSource(id, source);
}

async function delSessionWithSource(id, source){
  if(source === 'cli'){
    try {
      var resp = await fetch('/api/sessions/delete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:id})
      });
      var data = await resp.json();
      if(!resp.ok || !data.ok){
        showToast('error', data.error || 'Failed to delete session');
        return;
      }
      cliSessions = cliSessions.filter(function(s){ return s.id !== id; });
    } catch(e){
      showToast('error', String(e));
      return;
    }
  } else {
    sessions = sessions.filter(function(s){ return s.id !== id; });
    localStorage.setItem('gcw_s', JSON.stringify(sessions));
  }
  showToast('success', 'Session deleted');
  if(curId === id && curSource === source) newChat();
  else renderSessions();
}

function newChatInCwd(cwd){
  currentCwd = cwd;
  newChat();
  renderSessions();
}

function saveSession(firstMsg){
  curSource = 'draft';
  var ex = sessions.find(function(s){ return s.id === curId; });
  if(ex){
    ex.messages = curMsgs;
    ex.updatedAt = Date.now();
    ex.time = 'now';
    ex.source = 'draft';
  } else {
    var title = firstMsg.length > 40 ? firstMsg.slice(0,40) + '...' : firstMsg;
    sessions.unshift({id:curId, title:title, messages:curMsgs, time:'now', updatedAt:Date.now(), cwd:currentCwd, source:'draft'});
  }
  localStorage.setItem('gcw_s', JSON.stringify(sessions.slice(0,50)));
  renderSessions();
}

async function loadSession(id, source){
  if(source === 'cli'){
    await loadCliSession(id);
    return;
  }
  var s = sessions.find(function(x){ return x.id === id; });
  if(!s) return;
  applyLoadedSession(s, 'draft');
}

function applyLoadedSession(session, source){
  curId = session.id;
  curSource = source || session.source || 'draft';
  curMsgs = session.messages || [];
  currentCwd = session.cwd || currentCwd;
  closeTransientUi();
  chatArea.innerHTML = '';
  curMsgs.forEach(function(m){
    if(m.role === 'user') addUserBubble(m.display || stripReferenceContent(m.content));
    else addAgentMessage(m.content);
  });
  document.getElementById('topTitle').textContent = session.title || 'Untitled';
  syncSessionUrl(curSource === 'cli' ? curId : '');
  renderSessions();
  refreshMobileStatus();
  closeMobileSidebar();
}

async function fetchCliSessions(showError){
  try {
    var resp = await fetch('/api/sessions');
    var data = await resp.json();
    if(!resp.ok){
      if(showError) addMsg('system', '<span class="err-msg">' + esc(data.error || 'Failed to load sessions') + '</span>');
      return [];
    }
    cliSessions = data.sessions || [];
    renderSessions();
    return cliSessions;
  } catch(e){
    if(showError) addMsg('system', '<span class="err-msg">' + esc(String(e)) + '</span>');
    return [];
  }
}

async function loadCliSession(id){
  try {
    var resp = await fetch('/api/sessions/load', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:id})
    });
    var data = await resp.json();
    if(!resp.ok || !data.session){
      addMsg('system', '<span class="err-msg">' + esc(data.error || 'Failed to load session') + '</span>');
      return;
    }
    applyLoadedSession(data.session, 'cli');
  } catch(e){
    addMsg('system', '<span class="err-msg">' + esc(String(e)) + '</span>');
  }
}

function newChat(){
  curId = null;
  curSource = 'draft';
  curMsgs = [];
  syncSessionUrl('');
  closeTransientUi();
  chatArea.innerHTML = '';
  chatArea.appendChild(emptyState);
  emptyState.style.display = '';
  document.getElementById('topTitle').textContent = 'Untitled';
  renderSessions();
  refreshMobileStatus();
  chatInput.focus();
}

async function autoLoadSessionFromUrl(){
  if(!initialSessionParam) return;
  // Try CLI session first (filename like session-2026-...)
  var found = await fetchCliSessions(false);
  var cli = cliSessions.find(function(s){ return s.id === initialSessionParam || s.sessionId === initialSessionParam; });
  if(cli){ loadSession(cli.id, 'cli'); return; }
  // Try draft session
  var draft = sessions.find(function(s){ return s.id === initialSessionParam; });
  if(draft){ loadSession(draft.id, 'draft'); return; }
}

/* ═══ Rendering ═══ */
function hideEmpty(){ if(emptyState.parentNode) emptyState.style.display='none'; }

/* Auto-collapse long code blocks after render */
function autoCollapseLongBlocks(container){
  if(!container) container = chatArea;
  var toolCalls = container.querySelectorAll('.tool-call');
  toolCalls.forEach(function(tc){
    var pre = tc.querySelector('pre');
    if(!pre) return;
    var lines = pre.textContent.split('\\n').length;
    if(lines > 30){
      // Keep collapsed by default for long blocks
      var body = tc.querySelector('.tool-call-body');
      var chev = tc.querySelector('.tool-call-chev');
      if(body && chev){
        body.classList.remove('open');
        chev.classList.remove('open');
      }
      // Add line count to meta
      var meta = tc.querySelector('.tool-call-meta');
      if(meta && meta.textContent.indexOf('lines') === -1){
        meta.textContent = lines + ' lines (click to expand)';
      }
    }
  });
}

function addMsg(role, html){
  hideEmpty();
  var w = document.createElement('div'); w.className = 'mw';
  var msg = document.createElement('div'); msg.className = 'a-msg' + (role === 'system' ? ' system' : '');
  var lbl = document.createElement('div'); lbl.className = 'a-label';
  lbl.innerHTML = role === 'system' ? '⚙ SYSTEM' : '<svg class="ic xs" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><path d="M9 15h6"/></svg> GEMINI';
  msg.appendChild(lbl);
  var txt = document.createElement('div'); txt.className = 'a-text';
  txt.innerHTML = html;
  msg.appendChild(txt);
  w.appendChild(msg);
  chatArea.appendChild(w);
  scrollChatToBottom();
  // Auto-collapse long code blocks
  setTimeout(function(){ autoCollapseLongBlocks(w); }, 0);
}

function addUserBubble(text){
  hideEmpty();
  var w = document.createElement('div'); w.className = 'mw';
  var row = document.createElement('div'); row.className = 'u-row';
  var bub = document.createElement('div'); bub.className = 'u-bub';
  bub.textContent = text;
  row.appendChild(bub);
  w.appendChild(row);
  chatArea.appendChild(w);
  scrollChatToBottom();
}

function addAgentMessage(content, isStreaming){
  hideEmpty();
  var w = document.createElement('div'); w.className = 'mw';
  var msg = document.createElement('div'); msg.className = 'a-msg';

  // Agent label
  var lbl = document.createElement('div'); lbl.className = 'a-label';
  lbl.innerHTML = '<svg class="ic xs" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><path d="M9 15h6"/></svg> GEMINI';
  msg.appendChild(lbl);

  // Text area
  var txt = document.createElement('div'); txt.className = 'a-text';
  if(isStreaming){
    txt.innerHTML = '<span class="blink"></span>';
  } else {
    txt.innerHTML = renderMd(content);
  }
  msg.appendChild(txt);

  w.appendChild(msg);
  chatArea.appendChild(w);
  scrollChatToBottom();
  return txt;
}

function addActionBlock(title, icon, status){
  hideEmpty();
  var lastMw = chatArea.querySelector('.mw:last-child .a-msg');
  if(!lastMw) return null;

  var act = document.createElement('div'); act.className = 'act';

  var iconSvg = '';
  if(icon==='think') iconSvg = '<svg class="ic spin" style="color:var(--primary)" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="10"/></svg>';
  else if(icon==='terminal') iconSvg = '<svg class="ic" style="color:var(--blue)" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
  else iconSvg = '<svg class="ic" style="color:var(--green)" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

  var stSvg = '';
  if(status==='running') stSvg = '<svg class="ic xs spin" style="color:var(--red)" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="10"/></svg>';
  else if(status==='success') stSvg = '<svg class="ic xs" style="color:var(--green)" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

  var h = document.createElement('div'); h.className = 'act-h';
  h.innerHTML = '<svg class="ic xs act-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
    '<div class="act-iw">' + iconSvg + '</div>' +
    '<span class="act-title">' + esc(title) + '</span>' +
    '<span class="act-st">' + stSvg + '</span>';

  var body = document.createElement('div'); body.className = 'act-body';

  h.onclick = function(){
    var chev = h.querySelector('.act-chev');
    if(body.classList.contains('open')){
      body.classList.remove('open');
      chev.classList.remove('open');
    } else {
      body.classList.add('open');
      chev.classList.add('open');
    }
  };

  act.appendChild(h);
  act.appendChild(body);

  // Insert before the a-text element
  var aTxt = lastMw.querySelector('.a-text');
  if(aTxt) lastMw.insertBefore(act, aTxt);
  else lastMw.appendChild(act);

  return {act:act, body:body, header:h};
}

/* ═══ Thinking Block ═══ */
var SVG_SPARKLE = '<svg class="ic xs think-sparkle" viewBox="0 0 24 24"><path d="M11.017 2.814a1 1 0 011.966 0l1.051 5.558a2 2 0 001.594 1.594l5.558 1.051a1 1 0 010 1.966l-5.558 1.051a2 2 0 00-1.594 1.594l-1.051 5.558a1 1 0 01-1.966 0l-1.051-5.558a2 2 0 00-1.594-1.594l-5.558-1.051a1 1 0 010-1.966l5.558-1.051a2 2 0 001.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>';

function addThinkBlock(){
  hideEmpty();
  var lastMw = chatArea.querySelector('.mw:last-child .a-msg');
  if(!lastMw) return null;

  var wrap = document.createElement('div'); wrap.className = 'think';

  var h = document.createElement('div'); h.className = 'think-h';
  h.innerHTML = SVG_SPARKLE +
    '<span class="think-label">Thinking...</span>' +
    '<svg class="ic xs think-chev" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>';

  var body = document.createElement('div'); body.className = 'think-body';
  var labelEl = h.querySelector('.think-label');
  var chevEl = h.querySelector('.think-chev');
  var timer = null;

  function setOpen(open){
    if(open){
      body.classList.add('open');
      chevEl.classList.add('open');
    } else {
      body.classList.remove('open');
      chevEl.classList.remove('open');
    }
  }

  function setDetails(text, autoOpen){
    body.textContent = text || '';
    wrap.classList.toggle('has-details', !!text);
    if(text && autoOpen){
      setOpen(true);
    } else if(!text) {
      setOpen(false);
    }
  }

  h.onclick = function(){
    if(!wrap.classList.contains('has-details')) return;
    setOpen(!body.classList.contains('open'));
  };

  wrap.appendChild(h);
  wrap.appendChild(body);

  var aTxt = lastMw.querySelector('.a-text');
  if(aTxt) lastMw.insertBefore(wrap, aTxt);
  else lastMw.appendChild(wrap);

  timer = setInterval(function(){
    var elapsed = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    labelEl.textContent = 'Thinking for ' + elapsed + 's';
  }, 250);

  var startTime = Date.now();
  return {
    wrap:wrap,
    label:labelEl,
    body:body,
    chevron:chevEl,
    startTime:startTime,
    setDetails:setDetails,
    stop:function(){
      if(timer){
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

/* ═══ Collapsible Tool Call (Claude-style) ═══ */
var SVG_FILE = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path></svg>';
var SVG_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
var SVG_READ = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>';
var SVG_WRITE = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
var SVG_SEARCH = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>';

function addToolCall(toolName, filePath, status, content){
  hideEmpty();
  var lastMw = chatArea.querySelector('.mw:last-child .a-msg');
  if(!lastMw) return null;

  var tool = document.createElement('div'); tool.className = 'tool-call';
  if(status === 'success') tool.classList.add('check');
  if(status === 'error') tool.classList.add('error');

  var iconSvg = SVG_FILE;
  if(toolName === 'Read') iconSvg = SVG_READ;
  else if(toolName === 'Write' || toolName === 'WriteFile') iconSvg = SVG_WRITE;
  else if(toolName === 'Search' || toolName === 'Grep') iconSvg = SVG_SEARCH;

  var statusSvg = status === 'success' ? SVG_CHECK : '';

  var shortPath = filePath.length > 50 ? '...' + filePath.slice(-47) : filePath;
  var metaText = status === 'success' ? shortPath : filePath;

  var h = document.createElement('div'); h.className = 'tool-call-hdr';
  h.innerHTML = '<span class="tool-call-icon">' + iconSvg + '</span>' +
    '<span class="tool-call-title">' + esc(toolName) + '</span>' +
    '<span class="tool-call-meta">' + esc(metaText) + '</span>' +
    '<span class="tool-call-status">' + statusSvg + '</span>' +
    '<svg class="ic xs tool-call-chev" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>';

  var body = document.createElement('div'); body.className = 'tool-call-body';
  if(content){
    body.innerHTML = '<pre>' + esc(content) + '</pre>';
  }

  h.onclick = function(){
    var chev = h.querySelector('.tool-call-chev');
    if(body.classList.contains('open')){
      body.classList.remove('open');
      chev.classList.remove('open');
    } else {
      body.classList.add('open');
      chev.classList.add('open');
    }
  };

  tool.appendChild(h);
  tool.appendChild(body);

  var aTxt = lastMw.querySelector('.a-text');
  if(aTxt) lastMw.insertBefore(tool, aTxt);
  else lastMw.appendChild(tool);

  return {tool:tool, body:body, header:h};
}

/* ═══ Chat Send ═══ */
function useSug(btn){ chatInput.value = btn.textContent; sendMessage(); }

function copyMessageText(btn){
  var msg = btn.closest('.a-msg');
  if(!msg) return;
  var text = msg.querySelector('.a-text');
  if(!text) return;
  
  // Use a temporary textarea to preserve formatting if needed, 
  // but navigator.clipboard is better for modern browsers.
  var content = text.innerText || text.textContent;
  navigator.clipboard.writeText(content.trim()).then(function(){
    showToast('info', 'Copied message to clipboard');
  });
}

function refreshMobileStatus(){
  var mobileBar = document.getElementById('mobileStatusBar');
  if(!mobileBar) return;
  var statusText = document.getElementById('statusText');
  var filesCount = document.getElementById('filesCount');
  var ctxPct = document.getElementById('ctxPct');
  var dir = document.getElementById('mobileStatusDir');
  var status = document.getElementById('mobileStatusText');
  var files = document.getElementById('mobileStatusFiles');
  var ctx = document.getElementById('mobileStatusCtx');
  if(status && statusText) status.textContent = statusText.textContent;
  if(files && filesCount) files.textContent = filesCount.textContent;
  if(ctx && ctxPct) ctx.textContent = ctxPct.textContent;
  if(dir) dir.textContent = currentCwd ? homePath(currentCwd) : 'Working directory not set';
}

function syncViewportHeight(){
  var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  if(viewportHeight > 0){
    document.documentElement.style.setProperty('--app-vh', viewportHeight + 'px');
  }
}

async function sendMessage(){
  var text = chatInput.value.trim();
  if(!text || streaming) return;

  streaming = true;
  sendBtn.disabled = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  closeSlash();
  closeAt();
  document.getElementById('statusText').textContent = 'Generating...';

  // Read attached files and prepend content
  var fileContext = '';
  var filesToRead = attachedFiles.slice();
  if(filesToRead.length > 0){
    attachedFiles = [];
    renderAttachedFiles();
    for(var fi = 0; fi < filesToRead.length; fi++){
      try {
        var fr = await fetch('/api/files/read', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({path: filesToRead[fi]})
        });
        var fd = await fr.json();
        if(fd.content){
          fileContext += '\\n\\n<reference_content source="@' + filesToRead[fi] + '">\\n' + fd.content + '\\n</reference_content>';
        }
      } catch(e){ /* skip unreadable files */ }
    }
  }

  var userContent = fileContext ? text + fileContext : text;

  if(curSource === 'cli'){
    curId = 'draft-' + Date.now().toString();
    curSource = 'draft';
  }
  if(!curId){ curId = Date.now().toString(); curMsgs = []; curSource = 'draft'; }
  addUserBubble(text);
  curMsgs.push({role:'user', content:userContent, display:text});
  if(filesToRead.length > 0){
    showToast('info', filesToRead.length + ' attached file' + (filesToRead.length === 1 ? '' : 's') + ' added to the prompt');
  }

  // Add agent container with thinking block
  var agTxt = addAgentMessage('', true);
  var thinkBlock = addThinkBlock();

  var fullText = '';
  var lastError = '';
  var MAX_RETRIES = 2;

  for(var attempt = 0; attempt < MAX_RETRIES; attempt++){
    fullText = '';
    lastError = '';
    if(attempt > 0){
      agTxt.innerHTML = '<span style="color:var(--muted);font-style:italic">Retrying... (attempt ' + (attempt+1) + ')</span>';
    }

    try {
      var resp = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages:curMsgs, model:selectedModel, cwd:currentCwd})
      });

      if(!resp.ok){
        var err = {};
        try{ err = await resp.json(); }catch(e){ err = {error:resp.statusText}; }
        lastError = err.error || 'Unknown error';
        continue;
      }

      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';

      while(true){
        var result = await reader.read();
        if(result.done) break;
        buf += decoder.decode(result.value, {stream:true});
        var lines = buf.split('\\n');
        buf = lines.pop();
        for(var j=0;j<lines.length;j++){
          var line = lines[j];
          if(!line.startsWith('data:')) continue;
          var raw = line.slice(5).trim();
          if(raw === '[DONE]') continue;
          try{
            var d = JSON.parse(raw);
            if(d.text){
              fullText += d.text;
              agTxt.innerHTML = renderMd(fullText) + '<span class="blink"></span>';
              scrollChatToBottom();
            }
            if(d.usage){ updateCtx(d.usage); }
            if(d.error){ lastError = d.error; }
          }catch(e){}
        }
      }

      // If we got text, success — stop retrying
      if(fullText.length > 0) break;
      // Otherwise retry (empty response from model)
    } catch(e){
      lastError = String(e);
    }
  }

  // Finalize
  if(fullText.length > 0){
    agTxt.innerHTML = renderMd(fullText);
    curMsgs.push({role:'model', content:fullText});
    saveSession(text);
    // Auto-collapse long code blocks after render
    setTimeout(function(){ autoCollapseLongBlocks(); }, 0);
  } else if(lastError){
    agTxt.innerHTML = '<span class="err-msg">' + esc(lastError) + '</span>';
  } else {
    agTxt.innerHTML = '<span class="err-msg">No response received. Please try again.</span>';
  }

  // Update thinking block
  if(thinkBlock){
    thinkBlock.stop();
    var elapsed = Math.round((Date.now() - thinkBlock.startTime) / 1000);
    if(fullText.length > 0){
      thinkBlock.wrap.classList.add('done');
      thinkBlock.label.textContent = 'Responded in ' + Math.max(1, elapsed) + 's';
      thinkBlock.setDetails('', false);
    } else {
      thinkBlock.wrap.classList.add('error');
      thinkBlock.label.textContent = 'Failed after ' + Math.max(1, elapsed) + 's';
      thinkBlock.setDetails(lastError || 'No response received', true);
    }
  }

  endStream();
  attachedFiles = [];
  attachedFileMeta = {};
  renderAttachedFiles();
}

function endStream(){
  streaming = false;
  sendBtn.disabled = false;
  var statusEl = document.getElementById('statusText');
  if(statusEl) statusEl.textContent = 'Awaiting input';
  chatInput.focus();
}

/* ═══ Input ═══ */
function getAtContext(el){
  var val = el.value;
  var cursor = el.selectionStart;
  for(var i = cursor - 1; i >= 0; i--){
    if(val[i] === '@' && (i === 0 || /\\s/.test(val[i-1]))){
      return {start: i, query: val.substring(i+1, cursor)};
    }
    if(/\\s/.test(val[i])) break;
  }
  return null;
}

function onInput(el){
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';

  var v = el.value;
  var atCtx = getAtContext(el);

  if(atCtx){
    closeSlash();
    showAtMenu(atCtx.query);
  } else if(v.startsWith('/')){
    closeAt();
    showSlash(v);
  } else {
    closeSlash();
    closeAt();
  }
}

function onKey(e){
  var atOpen = atMenu.classList.contains('open');
  var slOpen = slashMenu.classList.contains('open');

  if(e.key === 'ArrowUp' || e.key === 'ArrowDown'){
    if(atOpen){ e.preventDefault(); navigateAtMenu(e.key === 'ArrowUp' ? -1 : 1); return; }
    if(slOpen){ e.preventDefault(); navigateSlashMenu(e.key === 'ArrowUp' ? -1 : 1); return; }
  }

  if(e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)){
    if(atOpen){ e.preventDefault(); var hl = atList.querySelector('.at-item.hl'); if(hl) hl.click(); return; }
  }

  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    if(slOpen){ var hl2 = slashList.querySelector('.hl'); if(hl2) hl2.click(); }
    else { sendMessage(); }
    return;
  }

  if(e.key === 'Escape'){
    if(atOpen) closeAt();
    else closeSlash();
  }
}

function showSlash(query){
  var q = query.slice(1).toLowerCase();
  var filtered = SLASH_CMDS.filter(function(c){ return !q || c.cmd.toLowerCase().indexOf(q) > -1; });
  if(filtered.length === 0){ closeSlash(); return; }
  slashList.innerHTML = '';
  filtered.forEach(function(c, i){
    var el = document.createElement('div');
    el.className = 'sl-item' + (i===0?' hl':'');
    el.innerHTML = '<span class="sl-cmd">' + esc(c.cmd) + '</span><span class="sl-desc">' + esc(c.desc) + '</span>';
    el.onclick = function(){
      closeSlash();
      chatInput.value = '';
      chatInput.style.height = 'auto';
      if(c.action && execSlashCmd(c.cmd)) return;
      chatInput.value = c.cmd + ' ';
      chatInput.focus();
    };
    slashList.appendChild(el);
  });
  slashMenu.classList.add('open');
}

function closeSlash(){ slashMenu.classList.remove('open'); }

/* ═══ @ Mentions ═══ */
var atMenu = document.getElementById('atMenu');
var atList = document.getElementById('atList');
var attachedFilesEl = document.getElementById('attachedFiles');
var attachedFiles = [];
var atSearchTimer = null;
var atHighlightIdx = 0;
var slashHighlightIdx = 0;

function showAtMenu(query){
  if(atSearchTimer) clearTimeout(atSearchTimer);
  atSearchTimer = setTimeout(function(){ searchFiles(query); }, 150);
}

function closeAt(){ atMenu.classList.remove('open'); atHighlightIdx = 0; }

async function searchFiles(query){
  atList.innerHTML = '<div class="at-loading">Searching...</div>';
  atMenu.classList.add('open');
  try {
    var resp = await fetch('/api/files/search', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({query: query})
    });
    var data = await resp.json();
    var files = data.files || [];
    if(files.length === 0){ atList.innerHTML = '<div class="at-loading">No files found</div>'; return; }
    atList.innerHTML = '';
    atHighlightIdx = 0;
    files.forEach(function(f, i){
      var el = document.createElement('div');
      el.className = 'at-item' + (i === 0 ? ' hl' : '');
      var ext = f.split('.').pop() || '';
      var icons = {ts:'📘',tsx:'📘',js:'📒',jsx:'📒',py:'🐍',rs:'🦀',go:'🔷',java:'☕',json:'📋',md:'📝',css:'🎨',html:'🌐',yml:'⚙',yaml:'⚙',sh:'💻'};
      el.innerHTML = '<span class="at-icon">' + (icons[ext]||'📄') + '</span><span class="at-path">' + esc(f) + '</span>';
      el.onclick = function(){ selectAtFile(f); };
      atList.appendChild(el);
    });
  } catch(e){
    atList.innerHTML = '<div class="at-loading">Error searching files</div>';
  }
}

function selectAtFile(filePath){
  var val = chatInput.value;
  var cursor = chatInput.selectionStart;
  var atIdx = -1;
  for(var i = cursor - 1; i >= 0; i--){
    if(val[i] === '@'){ if(i === 0 || /\\s/.test(val[i-1])) atIdx = i; break; }
    if(/\\s/.test(val[i])) break;
  }
  // Replace @query with @filepath inline in textarea
  if(atIdx >= 0){
    var before = val.substring(0, atIdx);
    var after = val.substring(cursor);
    var mention = '@' + filePath + ' ';
    chatInput.value = before + mention + after;
    var newPos = before.length + mention.length;
    chatInput.selectionStart = chatInput.selectionEnd = newPos;
  }
  // Also track for file reading on send
  if(!attachedFiles.some(function(f){ return f === filePath; })){
    attachedFiles.push(filePath);
    renderAttachedFiles();
  }
  closeAt();
  chatInput.focus();
}

function renderAttachedFiles(){
  if(attachedFiles.length === 0){ attachedFilesEl.style.display = 'none'; return; }
  attachedFilesEl.style.display = 'flex';
  attachedFilesEl.innerHTML = '';
  attachedFiles.forEach(function(f, i){
    var meta = attachedFileMeta[f] || {};
    var chip = document.createElement('span');
    chip.className = 'at-chip';
    var name = f.split('/').pop();
    var status = meta.error ? 'Unreadable' : (meta.truncated ? 'Truncated' : (meta.ready ? 'Ready' : 'Pending'));
    var detail = meta.error ? esc(meta.error) : (meta.truncated ? 'Attached with truncation warning' : 'Will be read when you send');
    chip.innerHTML = '<span class="at-chip-main"><span class="at-chip-icon">@</span><span class="at-chip-text"><strong>' + esc(name) + '</strong><span class="at-chip-meta">' + esc(status) + '</span></span></span><span class="at-x" role="button" tabindex="0" aria-label="Remove attached file">✕</span>';
    chip.title = f;
    if(detail) chip.setAttribute('data-detail', detail);
    var removeEl = chip.querySelector('.at-x');
    if(removeEl){
      removeEl.onclick = function(){ removeAtFile(i); };
      removeEl.onkeydown = function(event){
        if(event.key==='Enter' || event.key===' '){
          event.preventDefault();
          removeAtFile(i);
        }
      };
    }
    attachedFilesEl.appendChild(chip);
  });
}

function removeAtFile(idx){
  if(attachedFiles[idx]) delete attachedFileMeta[attachedFiles[idx]];
  attachedFiles.splice(idx, 1);
  renderAttachedFiles();
}

function navigateAtMenu(dir){
  var items = atList.querySelectorAll('.at-item');
  if(items.length === 0) return false;
  if(items[atHighlightIdx]) items[atHighlightIdx].classList.remove('hl');
  atHighlightIdx = Math.max(0, Math.min(items.length - 1, atHighlightIdx + dir));
  if(items[atHighlightIdx]) items[atHighlightIdx].classList.add('hl');
  if(items[atHighlightIdx]) items[atHighlightIdx].scrollIntoView({block:'nearest'});
  return true;
}

function navigateSlashMenu(dir){
  var items = slashList.querySelectorAll('.sl-item');
  if(items.length === 0) return false;
  if(items[slashHighlightIdx]) items[slashHighlightIdx].classList.remove('hl');
  slashHighlightIdx = Math.max(0, Math.min(items.length - 1, slashHighlightIdx + dir));
  if(items[slashHighlightIdx]) items[slashHighlightIdx].classList.add('hl');
  if(items[slashHighlightIdx]) items[slashHighlightIdx].scrollIntoView({block:'nearest'});
  return true;
}

/* ═══ Toggles ═══ */
function toggleSwitch(id){
  var sw = document.getElementById(id);
  if(sw.classList.contains('on')){
    sw.classList.remove('on');
    sw.classList.add('off');
  } else {
    sw.classList.remove('off');
    sw.classList.add('on');
  }
}

function toggleSidebar(){
  var sb = document.getElementById('sidebar');
  // Desktop: toggle collapsed class
  if(window.innerWidth > 768){
    sb.classList.toggle('collapsed');
  } else {
    closeMobileSidebar();
  }
}

function toggleMobileSidebar(){
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sbOverlay');
  if(sb.classList.contains('mobile-open')){
    closeMobileSidebar();
  } else {
    sb.classList.add('mobile-open');
    sb.classList.remove('collapsed');
    ov.classList.add('open');
  }
}

function closeMobileSidebar(){
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sbOverlay');
  sb.classList.remove('mobile-open');
  ov.classList.remove('open');
  ov.onclick = function(){ closeMobileSidebar(); };
}

/* ═══ Model Picker ═══ */
var modelDD = document.getElementById('modelDropdown');
var modelLabel = document.getElementById('modelLabel');
var modelListEl = document.getElementById('modelList');

function renderModelList(){
  modelListEl.innerHTML = '';
  var tierOrder = ['auto','pro','flash','flash-lite'];
  var tierLabels = {auto:'Recommended',pro:'Pro',flash:'Flash','flash-lite':'Flash Lite'};
  var groups = {};
  MODELS.forEach(function(m){
    var t = m.tier || 'other';
    if(!groups[t]) groups[t] = [];
    groups[t].push(m);
  });
  tierOrder.forEach(function(tier){
    var items = groups[tier];
    if(!items || items.length === 0) return;
    var hdr = document.createElement('div');
    hdr.className = 'model-group';
    hdr.textContent = tierLabels[tier] || tier;
    modelListEl.appendChild(hdr);
    items.forEach(function(m){
      var el = document.createElement('div');
      el.className = 'model-opt' + (m.id === selectedModel ? ' active' : '');
      var isPreview = m.id.indexOf('preview') > -1 || m.id.indexOf('auto-gemini-3') > -1;
      var hasThinking = m.id.indexOf('pro') > -1 || m.id.indexOf('auto') > -1;
      var displayName = m.label || m.id;
      var nameHtml = '<span>' + esc(displayName) + '</span>';
      if(isPreview) nameHtml += '<span class="mo-badge preview">Preview</span>';
      if(hasThinking) nameHtml += '<span class="mo-badge thinking">Thinking</span>';
      var descText = m.desc && m.desc !== m.tier ? m.desc : '';
      el.innerHTML = '<div class="mo-info"><div class="mo-name">' + nameHtml + '</div>' +
        (descText ? '<div class="mo-desc">' + esc(descText) + '</div>' : '') +
        '</div><svg class="ic xs check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
      el.onclick = function(){ selectModel(m.id, displayName); };
      modelListEl.appendChild(el);
    });
  });
  Object.keys(groups).forEach(function(tier){
    if(tierOrder.indexOf(tier) > -1) return;
    groups[tier].forEach(function(m){
      var el = document.createElement('div');
      el.className = 'model-opt' + (m.id === selectedModel ? ' active' : '');
      el.innerHTML = '<div class="mo-info"><div class="mo-name"><span>' + esc(m.label || m.id) + '</span></div></div>' +
        '<svg class="ic xs check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
      el.onclick = function(){ selectModel(m.id, m.label || m.id); };
      modelListEl.appendChild(el);
    });
  });
}

function selectModel(id, label){
  selectedModel = id;
  localStorage.setItem('gcw_model', id);
  modelLabel.textContent = label;
  closeModelPicker();
}

function toggleModelPicker(){
  if(modelDD.classList.contains('open')){
    closeModelPicker();
  } else {
    renderModelList();
    modelDD.classList.add('open');
    setExpandedState('modelBtn', true);
    // On mobile, show overlay behind bottom sheet
    if(window.innerWidth <= 768){
      var ov = document.getElementById('sbOverlay');
      ov.classList.add('open');
      ov.onclick = function(){ closeModelPicker(); ov.onclick = function(){ closeMobileSidebar(); }; };
    }
  }
}

function closeModelPicker(){
  modelDD.classList.remove('open');
  setExpandedState('modelBtn', false);
  if(window.innerWidth <= 768){
    var ov = document.getElementById('sbOverlay');
    ov.classList.remove('open');
    ov.onclick = function(){ closeMobileSidebar(); };
  }
}

// Close model picker on outside click (desktop)
document.addEventListener('click', function(e){
  if(!e.target.closest('.model-wrap') && modelDD.classList.contains('open')) closeModelPicker();
  if(!e.target.closest('.fp-actions')) {
    if(openFileMenuPath !== null){
      openFileMenuPath = null;
      updateFilesPanel();
    }
  }
});

/* ═══ Slash Command Actions ═══ */
function execSlashCmd(cmd){
  if(cmd === '/clear'){ newChat(); return true; }
  if(cmd === '/model'){ toggleModelPicker(); return true; }
  if(cmd === '/resume'){ openResumeBrowser(); return true; }
  if(cmd === '/stats'){ showPanel('stats'); return true; }
  if(cmd === '/tools'){ showPanel('tools'); return true; }
  if(cmd === '/memory'){ showPanel('memory'); return true; }
  if(cmd === '/about'){ showPanel('about'); return true; }
  if(cmd === '/theme'){ openThemePicker(); return true; }
  if(cmd === '/copy'){ copyLastMessage(); return true; }
  if(cmd === '/docs'){ window.open('https://github.com/google-gemini/gemini-cli/blob/main/docs/README.md','_blank'); return true; }
  if(cmd === '/corgi'){ runRemoteCmd('corgi'); return true; }
  if(cmd === '/compress'){ runRemoteCmd('compress'); return true; }
  if(cmd === '/help'){ runRemoteCmd('help'); return true; }
  if(cmd === '/init'){ runInit(); return true; }
  return false;
}

async function openResumeBrowser(){
  var found = await fetchCliSessions(true);
  if(window.innerWidth > 768){
    document.getElementById('sidebar').classList.remove('collapsed');
  } else {
    toggleMobileSidebar();
  }
  var search = document.getElementById('searchInput');
  if(search){
    search.value = '';
    search.focus();
  }
  renderSessions();
  if(!found || found.length === 0){
    addMsg('system', 'No saved CLI sessions were found for this workspace.');
    showToast('info', 'No CLI sessions found in this workspace');
  } else {
    addMsg('system', 'Choose a saved CLI session from the sidebar to resume it in the web UI.');
    showToast('info', 'Select a session in the sidebar to resume');
  }
}

async function runInit(){
  addMsg('system', 'Initializing GEMINI.md...');
  var r = await apiCmd('init');
  if(!r.ok){
    addMsg('system', '<span class="err-msg">' + esc(r.text) + '</span>');
    return;
  }
  addMsg('system', esc(r.text));
  if(r.prompt){
    // Auto-send the analysis prompt as a chat message — same as CLI submit_prompt
    chatInput.value = r.prompt;
    sendMessage();
  }
}

/* ═══ Panel Navigation ═══ */
var currentView = 'chat';

function showPanel(view){
  currentView = view;
  var panels = ['panelStats','panelTools','panelMemory','panelAbout'];
  var chatEl = document.getElementById('chatArea');
  var inpArea = document.querySelector('.inp-area');
  var emptyEl = document.getElementById('emptyState');

  // Hide all panels
  panels.forEach(function(id){ document.getElementById(id).style.display = 'none'; });

  if(view === 'chat'){
    chatEl.style.display = '';
    if(inpArea) inpArea.style.display = '';
    if(emptyEl) emptyEl.style.display = isChatEmpty() ? '' : 'none';
    scrollChatToBottom();
    return;
  }

  // Hide chat, show target panel
  closeTransientUi();
  chatEl.style.display = 'none';
  if(inpArea) inpArea.style.display = 'none';

  var target = document.getElementById('panel' + view.charAt(0).toUpperCase() + view.slice(1));
  if(target){
    target.style.display = 'block';
    // Load data
    if(view === 'stats') loadStats();
    if(view === 'tools') loadTools();
    if(view === 'memory') loadMemory();
    if(view === 'about') loadAbout();
  }
}

/* ═══ API Command Helper ═══ */
async function apiCmd(command){
  try {
    var resp = await fetch('/api/command', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({command: command})
    });
    return await resp.json();
  } catch(e){
    return {ok:false, type:'error', text:'Failed to connect to CLI.'};
  }
}

function runRemoteCmd(command){
  apiCmd(command).then(function(r){
    if(!r.ok){
      addMsg('system', r.text || 'Command failed.');
      return;
    }
    if(command === 'corgi'){
      addMsg('assistant', '<pre>' + esc(r.text) + '</pre>');
    } else {
      addMsg('assistant', '<pre>' + esc(r.text) + '</pre>');
    }
  });
}

/* ═══ Load Stats ═══ */
async function loadStats(){
  var el = document.getElementById('statsContent');
  el.innerHTML = '<div class="stat-card"><div class="stat-row"><span class="stat-label">Loading...</span></div></div>';
  var r = await apiCmd('stats');
  if(!r.ok){ el.innerHTML = '<div class="stat-card"><div class="stat-row"><span class="stat-label" style="color:var(--red)">' + esc(r.text) + '</span></div></div>'; return; }
  var d = r.data || {};
  var html = '';

  // Session info
  html += '<div class="stat-card">';
  html += '<div class="stat-section-title">Session</div>';
  if(d.sessionId) html += '<div class="stat-row"><span class="stat-label">Session ID</span><span class="stat-value" style="font-family:var(--font-mono);font-size:11px;opacity:.7">' + esc(String(d.sessionId).substring(0,20)) + '</span></div>';
  html += '<div class="stat-row"><span class="stat-label">Auth</span><span class="stat-value">' + esc(String(d.authType || 'unknown')) + '</span></div>';
  html += '<div class="stat-row"><span class="stat-label">Tier</span><span class="stat-value">' + esc(String(d.tier || 'unknown')) + '</span></div>';
  html += '</div>';

  // Model info
  html += '<div class="stat-card">';
  html += '<div class="stat-section-title">Model</div>';
  html += '<div class="stat-row"><span class="stat-label">Active</span><span class="stat-value" style="color:var(--md-sys-color-primary)">' + esc(String(d.activeModel || d.model || 'unknown')) + '</span></div>';
  if(d.model && d.model !== d.activeModel) html += '<div class="stat-row"><span class="stat-label">Configured</span><span class="stat-value">' + esc(String(d.model)) + '</span></div>';
  if(d.availableModels && d.availableModels.length > 0){
    html += '<div style="margin-top:10px;border-top:1px solid var(--md-sys-color-outline-variant);padding-top:10px">';
    d.availableModels.forEach(function(m){
      var isActive = m === (d.activeModel || d.model);
      html += '<div class="stat-row" style="padding:4px 0"><span class="stat-label">' + esc(m) + '</span><span class="stat-value">' + (isActive ? '<span style="color:var(--md-sys-color-primary);font-size:11px">\\u25CF active</span>' : '') + '</span></div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Quota
  if(d.quotaLimit != null && d.quotaRemaining != null){
    var pct = d.quotaPct || 0;
    html += '<div class="stat-card">';
    html += '<div class="stat-section-title">Quota</div>';
    html += '<div class="stat-row"><span class="stat-label">Remaining</span><span class="stat-value">' + d.quotaRemaining + ' / ' + d.quotaLimit + '</span></div>';
    html += '<div style="margin-top:8px"><div style="background:var(--md-sys-color-surface-container-highest);border-radius:8px;height:6px;overflow:hidden"><div style="background:' + (pct >= 80 ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)') + ';height:100%;width:' + pct + '%;border-radius:8px;transition:width .3s ease"></div></div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:4px"><span>' + pct + '% used</span>' + (d.quotaReset ? '<span>Resets ' + esc(String(d.quotaReset)) + '</span>' : '') + '</div></div>';
    html += '</div>';
  }

  el.innerHTML = html;
}

/* ═══ Load Tools ═══ */
async function loadTools(){
  var el = document.getElementById('toolsContent');
  el.innerHTML = '<div class="tool-item"><span class="stat-label">Loading...</span></div>';
  var r = await apiCmd('tools');
  if(!r.ok){ el.innerHTML = '<div class="tool-item"><span class="stat-label" style="color:var(--red)">' + esc(r.text) + '</span></div>'; return; }
  var tools = (r.data && r.data.tools) || [];
  if(tools.length === 0){ el.innerHTML = '<div class="tool-item"><span class="stat-label">No tools registered.</span></div>'; return; }
  var html = '';
  tools.forEach(function(t){
    html += '<div class="tool-item"><div class="tool-icon">⚡</div><div><div class="tool-name">' + esc(t.name) + '</div>';
    if(t.description) html += '<div class="tool-desc">' + esc(t.description) + '</div>';
    html += '</div></div>';
  });
  el.innerHTML = html;
}

/* ═══ Load Memory ═══ */
async function loadMemory(){
  var el = document.getElementById('memoryContent');
  el.innerHTML = '<div class="mem-section"><span class="stat-label">Loading...</span></div>';
  var r = await apiCmd('memory');
  if(!r.ok){ el.innerHTML = '<div class="mem-section"><span class="stat-label" style="color:var(--red)">' + esc(r.text) + '</span></div>'; return; }
  var sections = (r.data && r.data.sections) || [];
  if(sections.length === 0){ el.innerHTML = '<div class="mem-section"><span class="stat-label">No memory configured.</span></div>'; return; }
  var html = '';
  sections.forEach(function(s){
    html += '<div class="mem-section"><div class="mem-title">' + esc(s.name) + '</div><pre class="mem-content">' + esc(s.content) + '</pre></div>';
  });
  el.innerHTML = html;
}

/* ═══ Load About ═══ */
async function loadAbout(){
  var el = document.getElementById('aboutContent');
  el.innerHTML = '<div class="stat-card"><div class="stat-row"><span class="stat-label">Loading...</span></div></div>';
  var r = await apiCmd('about');
  if(!r.ok){ el.innerHTML = '<div class="stat-card"><div class="stat-row"><span class="stat-label" style="color:var(--red)">' + esc(r.text) + '</span></div></div>'; return; }
  var d = r.data || {};
  var html = '<div class="stat-card">';
  html += '<div class="stat-row"><span class="stat-label">Version</span><span class="stat-value">' + esc(String(d.version || 'unknown')) + '</span></div>';
  html += '<div class="stat-row"><span class="stat-label">Model</span><span class="stat-value">' + esc(String(d.model || 'unknown')) + '</span></div>';
  html += '<div class="stat-row"><span class="stat-label">Auth Type</span><span class="stat-value">' + esc(String(d.authType || 'unknown')) + '</span></div>';
  html += '<div class="stat-row"><span class="stat-label">OS</span><span class="stat-value">' + esc(String(d.os || 'unknown')) + '</span></div>';
  html += '</div>';
  el.innerHTML = html;
}

/* ═══ Theme Picker ═══ */
var THEMES = [
  {id:'dark',    name:'Dark',    bg:'#141218', primary:'#D0BCFF'},
  {id:'light',   name:'Light',   bg:'#FEF7FF', primary:'#6750A4'},
  {id:'ocean',   name:'Ocean',   bg:'#0D1B2A', primary:'#8CB8FF'},
  {id:'forest',  name:'Forest',  bg:'#1A2E1A', primary:'#9DDFAD'},
];
var currentTheme = localStorage.getItem('gcw_theme') || 'dark';

function openThemePicker(){
  var grid = document.getElementById('themeGrid');
  grid.innerHTML = '';
  THEMES.forEach(function(t){
    var card = document.createElement('div');
    card.className = 'theme-card' + (t.id === currentTheme ? ' active' : '');
    card.style.background = t.bg;
    card.style.border = '2px solid ' + (t.id === currentTheme ? t.primary : 'var(--outline)');
    card.innerHTML = '<div style="width:24px;height:24px;border-radius:50%;background:' + t.primary + ';margin-bottom:8px"></div><span style="color:' + t.primary + ';font-size:12px;font-weight:500">' + t.name + '</span>';
    card.onclick = function(){ applyTheme(t.id); };
    grid.appendChild(card);
  });
  document.getElementById('themeModal').classList.add('open');
}

function closeThemePicker(){
  document.getElementById('themeModal').classList.remove('open');
}

function applyTheme(id){
  currentTheme = id;
  localStorage.setItem('gcw_theme', id);
  document.documentElement.setAttribute('data-theme', id);
  closeThemePicker();
}

/* ═══ Copy Last Message ═══ */
function copyLastMessage(){
  var msgs = chatArea.querySelectorAll('.a-msg:not(.system)');
  if(msgs.length === 0){
    addMsg('system', 'No assistant message to copy.');
    return;
  }
  var last = msgs[msgs.length - 1];
  var textEl = last.querySelector('.a-text');
  var text = textEl ? textEl.innerText : '';
  navigator.clipboard.writeText(text).then(function(){
    addMsg('system', 'Copied to clipboard!');
    showToast('success', 'Copied last assistant message');
  }).catch(function(){
    addMsg('system', 'Failed to copy to clipboard.');
    showToast('error', 'Failed to copy assistant message');
  });
}

/* ═══ Fetch Models from CLI ═══ */
async function fetchModels(){
  try {
    var resp = await fetch('/api/models');
    if(!resp.ok) return;
    var data = await resp.json();
    if(data.models && data.models.length > 0){
      MODELS = data.models;
      var saved = localStorage.getItem('gcw_model');
      var pick = saved || data.current || '';
      var inList = MODELS.some(function(m){ return m.id === pick; });
      selectedModel = inList ? pick : MODELS[0].id;
      var cur = MODELS.find(function(m){ return m.id === selectedModel; });
      modelLabel.textContent = cur ? cur.label : selectedModel;
    }
    if(data.cwd) currentCwd = data.cwd;
  } catch(e){ /* ignore — will use empty list */ }
}

/* ═══ Directory Picker ═══ */
var dirSelectedIdx = 0;

function getRecentDirs(){
  var seen = {};
  var dirs = [];
  sessions.forEach(function(s){
    if(s.cwd && !seen[s.cwd]){ seen[s.cwd] = true; dirs.push(s.cwd); }
  });
  return dirs;
}

function homePath(p){
  if(!p) return p;
  var home = '/Users/';
  var idx = p.indexOf(home);
  if(idx === 0){
    var parts = p.split('/');
    return '~/' + parts.slice(3).join('/');
  }
  return p;
}

function openDirPicker(){
  dirSelectedIdx = 0;
  document.getElementById('dirInput').value = '';
  renderDirList('');
  document.getElementById('dirOverlay').classList.add('open');
  setTimeout(function(){ document.getElementById('dirInput').focus(); }, 50);
}

function closeDirPicker(){
  document.getElementById('dirOverlay').classList.remove('open');
}

function renderDirList(query){
  var list = document.getElementById('dirList');
  list.innerHTML = '';
  var q = query.toLowerCase();
  var items = [];

  if(currentCwd && (!q || currentCwd.toLowerCase().indexOf(q) > -1)){
    items.push({path:currentCwd, type:'current'});
  }

  var recent = getRecentDirs().filter(function(d){
    return d !== currentCwd && (!q || d.toLowerCase().indexOf(q) > -1);
  });
  items = items.concat(recent.map(function(d){ return {path:d, type:'recent'}; }));

  if(q && q.indexOf('/') > -1){
    var alreadyListed = items.some(function(i){ return i.path.toLowerCase() === q; });
    if(!alreadyListed) items.push({path:query, type:'custom'});
  }

  if(dirSelectedIdx >= items.length) dirSelectedIdx = Math.max(0, items.length - 1);

  var lastType = '';
  items.forEach(function(item, idx){
    if(item.type !== lastType){
      lastType = item.type;
      var lbl = document.createElement('div');
      lbl.className = 'dir-group-label';
      lbl.textContent = item.type === 'current' ? 'Current Directory' : item.type === 'recent' ? 'Recent Directories' : 'Custom Path';
      list.appendChild(lbl);
    }
    var el = document.createElement('div');
    el.className = 'dir-item' + (idx === dirSelectedIdx ? ' selected' : '');
    var iconSvg = item.type === 'current'
      ? '<svg class="ic xs" viewBox="0 0 24 24"><path d="M15 21v-8a1 1 0 00-1-1h-4a1 1 0 00-1 1v8"/><path d="M3 10a2 2 0 01.709-1.528l7-6a2 2 0 012.582 0l7 6A2 2 0 0121 10v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>'
      : '<svg class="ic xs" viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
    el.innerHTML = iconSvg + '<span class="dir-item-path">' + esc(homePath(item.path)) + '</span><span class="dir-item-key">\\u21B5</span>';
    el.onclick = function(){ selectDir(item.path); };
    list.appendChild(el);
  });

  list._items = items;
}

function filterDirs(){
  dirSelectedIdx = 0;
  renderDirList(document.getElementById('dirInput').value);
}

function dirKey(e){
  var list = document.getElementById('dirList');
  var items = list._items || [];
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    dirSelectedIdx = Math.min(dirSelectedIdx + 1, items.length - 1);
    renderDirList(document.getElementById('dirInput').value);
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    dirSelectedIdx = Math.max(dirSelectedIdx - 1, 0);
    renderDirList(document.getElementById('dirInput').value);
  } else if(e.key === 'Enter'){
    e.preventDefault();
    if(items[dirSelectedIdx]) selectDir(items[dirSelectedIdx].path);
    else if(document.getElementById('dirInput').value) selectDir(document.getElementById('dirInput').value);
  } else if(e.key === 'Escape'){
    closeDirPicker();
  }
}

function selectDir(dirPath){
  closeDirPicker();
  currentCwd = dirPath;
  curId = Date.now().toString();
  curMsgs = [];
  closeTransientUi();
  chatArea.innerHTML = '';
  chatArea.appendChild(emptyState);
  emptyState.style.display = '';
  document.getElementById('topTitle').textContent = homePath(dirPath);
  renderSessions();
  refreshMobileStatus();
  chatInput.focus();
}

/* ═══ Context Tracking ═══ */
var ctxData = {input:0, cacheRead:0, cacheWrite:0, output:0, limit:1048576};

function fmtTokens(n){
  if(n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if(n >= 1000) return Math.round(n/1000) + 'K';
  return String(n);
}

function updateCtx(usage){
  if(usage){
    ctxData.input = usage.input || 0;
    ctxData.output = usage.output || 0;
  }
  var total = ctxData.input + ctxData.cacheRead + ctxData.cacheWrite;
  var pct = ctxData.limit > 0 ? (total / ctxData.limit * 100) : 0;
  var pctStr = pct < 10 ? pct.toFixed(1) : Math.round(pct);

  var pctEl = document.getElementById('ctxPct');
  if(pctEl) pctEl.textContent = pctStr + '% context';
  var chip = document.getElementById('contextChip');
  if(chip){
    chip.classList.remove('warn','danger');
    if(pct >= 80) chip.classList.add('danger');
    else if(pct >= 60) chip.classList.add('warn');
  }

  var ringEl = document.getElementById('ctxRing');
  if(ringEl) ringEl.setAttribute('stroke-dashoffset', String(62.83 * (1 - pct / 100)));

  var pctLg = document.getElementById('ctxPctLg');
  if(pctLg) pctLg.textContent = pctStr + '%';

  var tokensEl = document.getElementById('ctxTokens');
  if(tokensEl) tokensEl.textContent = fmtTokens(total) + ' / ' + fmtTokens(ctxData.limit);

  var fillEl = document.getElementById('ctxFill');
  if(fillEl) fillEl.style.width = Math.min(pct, 100) + '%';

  var inputReg = document.getElementById('ctxInputReg');
  if(inputReg) inputReg.textContent = fmtTokens(ctxData.input);

  var cacheR = document.getElementById('ctxCacheR');
  if(cacheR) cacheR.textContent = fmtTokens(ctxData.cacheRead);

  var cacheW = document.getElementById('ctxCacheW');
  if(cacheW) cacheW.textContent = fmtTokens(ctxData.cacheWrite);

  var inputTotal = document.getElementById('ctxInputTotal');
  if(inputTotal) inputTotal.textContent = fmtTokens(total);

  var outputGen = document.getElementById('ctxOutputGen');
  if(outputGen) outputGen.textContent = fmtTokens(ctxData.output);
  refreshMobileStatus();
}

function toggleCtxPanel(){
  var panel = document.getElementById('ctxPanel');
  if(!panel) return;
  if(panel.classList.contains('open')){
    panel.classList.remove('open');
    setExpandedState('contextChip', false);
    setPanelHidden('ctxPanel', true);
  } else {
    closeFilesPanel();
    closeModelPicker();
    panel.classList.add('open');
    setExpandedState('contextChip', true);
    setPanelHidden('ctxPanel', false);
  }
}

function closeCtxPanel(){
  var panel = document.getElementById('ctxPanel');
  if(panel) panel.classList.remove('open');
  setExpandedState('contextChip', false);
  setPanelHidden('ctxPanel', true);
}

function closeFilesPanel(){
  var panel = document.getElementById('filesPanel');
  if(panel) panel.classList.remove('open');
  setExpandedState('filesChip', false);
  setPanelHidden('filesPanel', true);
}

function closeAllFileMenus(){
  if(openFileMenuPath !== null){
    openFileMenuPath = null;
    updateFilesPanel();
  }
}

// Close context panel on outside click
document.addEventListener('click', function(e){
  var panel = document.getElementById('ctxPanel');
  if(panel && panel.classList.contains('open') && !e.target.closest('.ctx-wrap')){
    panel.classList.remove('open');
  }
});

/* ═══ Init ═══ */
renderSessions();
fetchCliSessions(false);
fetchModels();
chatInput.focus();
syncViewportHeight();
autoLoadSessionFromUrl();
window.addEventListener('resize', syncViewportHeight);
window.addEventListener('orientationchange', syncViewportHeight);
// Restore saved theme
if(currentTheme && currentTheme !== 'dark'){
  document.documentElement.setAttribute('data-theme', currentTheme);
}
// Hide panels initially
['panelStats','panelTools','panelMemory','panelAbout'].forEach(function(id){
  document.getElementById(id).style.display = 'none';
});
`;
}
