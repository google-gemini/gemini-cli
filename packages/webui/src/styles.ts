/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CSS styles for the web GUI dashboard.
 * Material Design 3 compliant with embedded theme variants.
 */

import {
  darkColorScheme,
  lightColorScheme,
  oceanColorScheme,
  forestColorScheme,
  generateMD3CSSVariables,
  generateLegacyAliases,
} from './tokens.js';

export function getStyles(): string {
  return `
/* ═══════════════════════════════════════════════════════════════════════════
   MD3 FOUNDATION - Reset & Base
   ═══════════════════════════════════════════════════════════════════════════ */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 DESIGN TOKENS - Default (Dark Theme)
   ═══════════════════════════════════════════════════════════════════════════ */
:root{
${generateMD3CSSVariables(darkColorScheme)}
${generateLegacyAliases()}
  --app-vh:100vh;
  --shell-max:1180px;
  --chat-max:960px;
  --content-max:820px;
  --composer-max:960px;
}

html,body{height:100%;min-height:var(--app-vh)}
body{
  font-family:'Inter',system-ui,sans-serif;
  background:var(--md-sys-color-background);
  color:var(--md-sys-color-on-background);
  overflow:hidden;
  font-size:15px;
  display:flex;
  line-height:1.6;
}

/* Background with MD3 surface tints */
body::before{
  content:'';
  position:fixed;
  inset:0;
  pointer-events:none;
  background:
    radial-gradient(ellipse at 20% 0%, color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent), transparent 50%),
    radial-gradient(ellipse at 80% 0%, color-mix(in srgb, var(--md-sys-color-secondary) 6%, transparent), transparent 50%),
    radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--md-sys-color-tertiary) 4%, transparent), transparent 50%);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Sidebar (Navigation Drawer)
   ═══════════════════════════════════════════════════════════════════════════ */
.sidebar{
  width:288px;
  min-width:288px;
  background:var(--md-sys-color-surface-container-low);
  backdrop-filter:blur(18px);
  display:flex;
  flex-direction:column;
  border-right:1px solid var(--md-sys-color-outline-variant);
  transition:width var(--md-sys-motion-duration-medium1) var(--md-sys-motion-easing-standard),
             min-width var(--md-sys-motion-duration-medium1) var(--md-sys-motion-easing-standard),
             opacity var(--md-sys-motion-duration-medium1) var(--md-sys-motion-easing-standard);
  overflow:hidden;
  z-index:20;
}
.sidebar.collapsed{width:0;min-width:0;border-right:none;opacity:0;pointer-events:none}

/* Sidebar Header */
.sb-header{
  padding:20px 20px 16px;
  display:flex;
  align-items:center;
  gap:12px;
}
.brand-av{
  width:40px;
  height:40px;
  border-radius:var(--md-sys-shape-corner-medium);
  object-fit:cover;
  flex-shrink:0;
  box-shadow:var(--md-sys-elevation-level2);
}
.brand-name{
  font-weight:600;
  font-size:14px;
  white-space:nowrap;
  letter-spacing:0.01em;
  color:var(--md-sys-color-on-surface);
}
.brand-ver{
  font-size:11px;
  color:var(--md-sys-color-on-surface-variant);
  margin-left:2px;
  text-transform:uppercase;
  letter-spacing:0.08em;
}

/* Sidebar Sections */
.sb-section{
  padding:2px 20px 10px;
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.sb-label{
  font-size:11px;
  font-weight:700;
  letter-spacing:0.12em;
  color:var(--md-sys-color-on-surface-variant);
  text-transform:uppercase;
}
.sb-actions{display:flex;gap:4px}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Icon Button
   ═══════════════════════════════════════════════════════════════════════════ */
.ib{
  background:transparent;
  border:none;
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  padding:8px;
  border-radius:var(--md-sys-shape-corner-full);
  display:flex;
  align-items:center;
  justify-content:center;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             transform var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
  overflow:hidden;
}
.ib::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.ib:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.ib:focus-visible::before{opacity:var(--md-sys-state-focus-opacity)}
.ib:active::before{opacity:var(--md-sys-state-press-opacity)}
.ib:hover{color:var(--md-sys-color-on-surface)}
.ib:active{transform:scale(0.95)}
.ib-disabled,.ib:disabled{opacity:var(--md-sys-state-disabled-opacity);cursor:not-allowed;pointer-events:none}
.ib-disabled:hover,.ib:disabled:hover{background:transparent}

/* Sidebar List */
.sb-list{flex:1;overflow-y:auto;padding:4px 10px 10px}
.sb-list::-webkit-scrollbar{width:5px}
.sb-list::-webkit-scrollbar-thumb{
  background:var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-full);
}

/* Session Item - MD3 List Item */
.si{
  padding:12px 14px;
  margin:4px 0;
  border-radius:var(--md-sys-shape-corner-large);
  cursor:pointer;
  display:flex;
  justify-content:space-between;
  align-items:center;
  font-size:14px;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  color:var(--md-sys-color-on-surface);
  border:1px solid transparent;
  background:transparent;
  position:relative;
  overflow:hidden;
}
.si::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.si:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.si:focus-visible::before{opacity:var(--md-sys-state-focus-opacity)}
.si:active::before{opacity:var(--md-sys-state-press-opacity)}
.si.active{
  background:var(--md-sys-color-secondary-container);
  color:var(--md-sys-color-on-secondary-container);
  font-weight:500;
}
.si-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
.si-t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.si-src{
  display:inline-flex;
  align-items:center;
  padding:2px 6px;
  border-radius:var(--md-sys-shape-corner-full);
  font-size:10px;
  font-weight:700;
  letter-spacing:0.06em;
  text-transform:uppercase;
  flex-shrink:0;
}
.si-src.cli{
  background:var(--md-sys-color-primary-container);
  color:var(--md-sys-color-on-primary-container);
}
.si-src.draft{
  background:var(--md-sys-color-secondary-container);
  color:var(--md-sys-color-on-secondary-container);
}
.si-d{font-size:11px;opacity:0.65;flex-shrink:0;margin-left:8px;color:var(--md-sys-color-on-surface-variant)}

/* Sidebar Footer */
.sb-footer{
  padding:14px 16px;
  display:flex;
  justify-content:space-between;
  border-top:1px solid var(--md-sys-color-outline-variant);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Main Layout
   ═══════════════════════════════════════════════════════════════════════════ */
.main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative}
.app-shell{
  flex:1;
  display:flex;
  flex-direction:column;
  min-width:0;
  min-height:0;
  padding:20px 24px 18px;
  gap:14px;
}

/* Top App Bar - MD3 Center-aligned */
.topbar{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  max-width:var(--shell-max);
  width:100%;
  margin:0 auto;
  padding:0 4px;
  flex-shrink:0;
}
.topbar-l{display:flex;flex-direction:column;gap:4px;min-width:0}
.topbar-kicker{
  font-size:11px;
  font-weight:700;
  letter-spacing:0.14em;
  text-transform:uppercase;
  color:var(--md-sys-color-on-surface-variant);
}
.topbar-title{
  font:500 var(--md-sys-typescale-headline-medium) 'Inter', sans-serif;
  letter-spacing:-0.03em;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width:min(72vw,760px);
  line-height:1.08;
  color:var(--md-sys-color-on-surface);
}
.topbar-r{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  flex-wrap:wrap;
  max-width:min(46%,420px);
}

/* MD3 Assist Chip */
.folder-chip{
  display:flex;
  align-items:center;
  gap:8px;
  background:var(--md-sys-color-surface-container-high);
  backdrop-filter:blur(16px);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-full);
  padding:10px 14px;
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  max-width:320px;
  font-size:14px;
  font-family:inherit;
  position:relative;
  overflow:hidden;
}
.folder-chip::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.folder-chip:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.folder-chip:hover{
  background:var(--md-sys-color-surface-container-highest);
  border-color:var(--md-sys-color-outline);
  color:var(--md-sys-color-on-surface);
}
.folder-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.chat-stage{flex:1;min-height:0;display:flex;justify-content:center;width:100%}
.chat-column{
  width:min(100%,var(--chat-max));
  display:flex;
  flex-direction:column;
  flex:1;
  min-height:0;
  gap:14px;
  margin:0 auto;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Chat Surface
   ═══════════════════════════════════════════════════════════════════════════ */
.chat,.panel{
  flex:1;
  min-height:0;
  overflow-y:auto;
  scroll-behavior:smooth;
  background:var(--md-sys-color-surface-container);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-extra-large);
  backdrop-filter:blur(18px);
  box-shadow:var(--md-sys-elevation-level1);
}
.chat{padding:28px 0 24px}
.chat::-webkit-scrollbar,.panel::-webkit-scrollbar{width:6px}
.chat::-webkit-scrollbar-thumb,.panel::-webkit-scrollbar-thumb{
  background:var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-full);
}
.mw{max-width:var(--content-max);margin:0 auto;padding:0 28px}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Message Bubbles
   ═══════════════════════════════════════════════════════════════════════════ */
.u-row{display:flex;justify-content:flex-end;margin-bottom:24px}
.u-bub{
  background:var(--md-sys-color-primary-container);
  color:var(--md-sys-color-on-primary-container);
  padding:14px 18px;
  border-radius:var(--md-sys-shape-corner-large);
  border-bottom-right-radius:var(--md-sys-shape-corner-small);
  max-width:78%;
  font-size:15px;
  line-height:1.6;
  word-break:break-word;
  box-shadow:var(--md-sys-elevation-level1);
}
.a-msg{margin-bottom:28px}
.a-label{
  display:flex;
  align-items:center;
  gap:6px;
  font-size:11px;
  font-weight:700;
  color:var(--md-sys-color-primary);
  letter-spacing:0.14em;
  margin-bottom:12px;
  text-transform:uppercase;
}
.a-text{
  font-size:15px;
  line-height:1.72;
  color:var(--md-sys-color-on-surface);
  padding:0 4px;
  margin-top:8px;
}
.a-text h1,.a-text h2,.a-text h3{
  margin:18px 0 10px;
  font-weight:700;
  letter-spacing:-0.02em;
  color:var(--md-sys-color-on-surface);
}
.a-text h1{font-size:1.55rem}
.a-text h2{font-size:1.28rem}
.a-text h3{font-size:1.08rem}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Thinking Block
   ═══════════════════════════════════════════════════════════════════════════ */
.think{margin-bottom:10px}
.think-h{
  display:flex;
  align-items:center;
  gap:6px;
  cursor:pointer;
  padding:4px 0;
  font-size:14px;
  color:var(--md-sys-color-on-surface-variant);
  transition:color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.think-h:hover{color:var(--md-sys-color-on-surface)}
.think-sparkle{flex-shrink:0;color:var(--md-sys-color-tertiary);opacity:0.7;transition:color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard)}
.think-h:hover .think-sparkle{opacity:1}
.think-label{font-style:italic}
.think-chev{flex-shrink:0;color:var(--md-sys-color-on-surface-variant);opacity:0.5;transition:transform var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard)}
.think:not(.has-details) .think-h{cursor:default}
.think:not(.has-details) .think-h:hover{color:var(--md-sys-color-on-surface-variant)}
.think:not(.has-details) .think-h:hover .think-sparkle{opacity:0.7}
.think:not(.has-details) .think-chev{display:none}
.think-chev.open{transform:rotate(90deg)}
.think-body{
  display:none;
  padding:10px 0 4px 18px;
  margin-top:6px;
  border-left:2px solid var(--md-sys-color-outline-variant);
  font-size:13px;
  line-height:1.65;
  color:var(--md-sys-color-on-surface-variant);
  white-space:normal;
}
.think-body.open{display:block}
.think.done .think-label{font-style:normal}
.think.error .think-label,.think.error .think-sparkle{color:var(--md-sys-color-error);opacity:1}

/* Action Block */
.act{
  background:var(--md-sys-color-surface-container-high);
  border-radius:var(--md-sys-shape-corner-large);
  overflow:hidden;
  margin-bottom:8px;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  border:1px solid var(--md-sys-color-outline-variant);
}
.act-h{
  padding:12px 16px;
  display:flex;
  align-items:center;
  gap:10px;
  cursor:pointer;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.act-h:hover{background:var(--md-sys-color-surface-container-highest)}
.act-chev{color:var(--md-sys-color-on-surface-variant);flex-shrink:0;transition:transform var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard)}
.act-chev.open{transform:rotate(90deg)}
.act-iw{
  background:var(--md-sys-color-surface-container-highest);
  border-radius:var(--md-sys-shape-corner-full);
  padding:6px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
}
.act-title{
  flex:1;
  font-size:14px;
  font-weight:500;
  color:var(--md-sys-color-on-surface);
  letter-spacing:0.01em;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.act-st{flex-shrink:0}
.act-body{
  display:none;
  padding:12px 16px;
  background:var(--md-sys-color-surface-container-highest);
  font-family:'JetBrains Mono',monospace;
  font-size:12px;
  line-height:1.6;
  color:var(--md-sys-color-on-surface-variant);
  overflow-x:auto;
  white-space:pre-wrap;
  border-top:1px solid var(--md-sys-color-outline-variant);
  margin:0 4px 4px;
  border-radius:0 0 var(--md-sys-shape-corner-medium) var(--md-sys-shape-corner-medium);
}
.act-body.open{display:block}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Code Blocks & Tool Cards
   ═══════════════════════════════════════════════════════════════════════════ */
.cb{
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-medium);
  overflow:hidden;
  margin:10px 0;
  font-size:13px;
}
.cb-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:8px 12px;
  background:var(--md-sys-color-surface-container-highest);
  border-bottom:1px solid var(--md-sys-color-outline-variant);
}
.cb-lang{
  font-size:11px;
  color:var(--md-sys-color-on-surface-variant);
  font-family:'JetBrains Mono',monospace;
}
.cb-copy{
  background:transparent;
  border:none;
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  font-size:11px;
  padding:4px 8px;
  border-radius:var(--md-sys-shape-corner-small);
  font-family:inherit;
  transition:color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.cb-copy:hover{
  color:var(--md-sys-color-on-surface);
  background:var(--md-sys-color-surface-container-high);
}
.cb-pre{padding:12px 14px;overflow-x:auto;margin:0}
.cb-pre pre{
  margin:0;
  font-family:'JetBrains Mono',monospace;
  line-height:1.55;
  color:var(--md-sys-color-on-surface-variant);
}

/* Inline Code */
code.il{
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-extra-small);
  padding:1px 6px;
  font-family:'JetBrains Mono',monospace;
  font-size:0.88em;
  color:var(--md-sys-color-primary);
}

/* Tool Call Card - MD3 Filled Card */
.tool-call{
  margin-bottom:10px;
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-medium);
  background:var(--md-sys-color-surface-container-high);
  overflow:hidden;
}
.tool-call-hdr{
  display:flex;
  align-items:center;
  gap:10px;
  padding:12px 14px;
  cursor:pointer;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  user-select:none;
}
.tool-call-hdr:hover{background:var(--md-sys-color-surface-container-highest)}
.tool-call-icon{flex-shrink:0;color:var(--md-sys-color-on-surface-variant);display:flex;align-items:center}
.tool-call-icon svg{width:16px;height:16px}
.tool-call-title{
  flex:1;
  font-size:14px;
  font-weight:500;
  color:var(--md-sys-color-on-surface);
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.tool-call-meta{
  font-size:11px;
  color:var(--md-sys-color-on-surface-variant);
  flex-shrink:0;
  margin-left:8px;
  max-width:200px;
  overflow:hidden;
  text-overflow:ellipsis;
}
.tool-call-status{flex-shrink:0;display:flex;align-items:center;gap:6px}
.tool-call-status svg{width:14px;height:14px}
.tool-call-chev{
  flex-shrink:0;
  color:var(--md-sys-color-on-surface-variant);
  transition:transform var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  width:14px;
  height:14px;
}
.tool-call-chev.open{transform:rotate(90deg)}
.tool-call-body{
  display:none;
  border-top:1px solid var(--md-sys-color-outline-variant);
  background:var(--md-sys-color-surface-container-highest);
}
.tool-call-body.open{display:block}
.tool-call-body pre{
  margin:0;
  padding:12px 14px;
  overflow-x:auto;
  font-family:'JetBrains Mono',monospace;
  font-size:12px;
  line-height:1.55;
  color:var(--md-sys-color-on-surface-variant);
  white-space:pre-wrap;
  word-break:break-word;
}
.tool-call.check .tool-call-status svg{color:var(--md-sys-color-secondary)}
.tool-call.error .tool-call-status svg{color:var(--md-sys-color-error)}
.tool-call.error .tool-call-hdr{background:color-mix(in srgb, var(--md-sys-color-error) 8%, transparent)}
.tool-call.check .tool-call-hdr{background:color-mix(in srgb, var(--md-sys-color-secondary) 8%, transparent)}

/* File Card with approval actions */
.file-card .tool-call-hdr{background:var(--md-sys-color-surface-container)}
.file-card .tool-call-hdr:hover{background:var(--md-sys-color-surface-container-high)}
.file-card.approved .tool-call-hdr{background:color-mix(in srgb, var(--md-sys-color-secondary) 12%, transparent)}
.file-card.declined .tool-call-hdr{background:color-mix(in srgb, var(--md-sys-color-error) 12%, transparent)}
.file-card .fc-dot{
  width:8px;
  height:8px;
  border-radius:50%;
  background:var(--md-sys-color-primary);
  flex-shrink:0;
  animation:fc-pulse 1.5s ease-in-out infinite;
}
.file-card.approved .fc-dot,.file-card.declined .fc-dot{animation:none}
.file-card.approved .fc-dot{background:var(--md-sys-color-secondary)}
.file-card.declined .fc-dot{background:var(--md-sys-color-error)}
@keyframes fc-pulse{
  0%,100%{opacity:1;box-shadow:0 0 0 0 color-mix(in srgb, var(--md-sys-color-primary) 36%, transparent)}
  50%{opacity:0.7;box-shadow:0 0 8px color-mix(in srgb, var(--md-sys-color-primary) 38%, transparent)}
}
.fc-body .fc-path{
  background:var(--md-sys-color-surface-container);
  border-radius:0;
  border:none;
  margin:0;
  padding:10px 14px;
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  color:var(--md-sys-color-on-surface-variant);
  white-space:pre-wrap;
  overflow-x:auto;
}
.fc-body .fc-path code{
  background:var(--md-sys-color-surface-container-highest);
  padding:2px 6px;
  border-radius:var(--md-sys-shape-corner-extra-small);
  font-size:11px;
}
.fc-body .fc-preview{
  background:var(--md-sys-color-surface-container-highest);
  max-height:200px;
  overflow:auto;
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  line-height:1.5;
  color:var(--md-sys-color-on-surface-variant);
  border-top:1px solid var(--md-sys-color-outline-variant);
}
.fc-body .fc-preview::-webkit-scrollbar{width:4px;height:4px}
.fc-body .fc-preview::-webkit-scrollbar-thumb{background:var(--md-sys-color-outline-variant);border-radius:2px}
.fc-body .fc-btns{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
  padding:10px 14px;
  background:var(--md-sys-color-surface-container);
  border-top:1px solid var(--md-sys-color-outline-variant);
}

/* MD3 Filled Button */
.fc-btn{
  display:inline-flex;
  align-items:center;
  gap:4px;
  border:1px solid var(--md-sys-color-outline-variant);
  background:var(--md-sys-color-surface-container-high);
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  font-size:12px;
  font-weight:500;
  padding:6px 12px;
  border-radius:var(--md-sys-shape-corner-full);
  font-family:inherit;
  transition:all var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  white-space:nowrap;
  position:relative;
  overflow:hidden;
}
.fc-btn::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.fc-btn:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.fc-btn:hover{background:var(--md-sys-color-surface-container-highest);color:var(--md-sys-color-on-surface)}
.fc-btn.primary{
  background:var(--md-sys-color-primary);
  color:var(--md-sys-color-on-primary);
  border-color:transparent;
}
.fc-btn.primary::before{background:var(--md-sys-color-on-primary)}
.fc-btn.primary:hover{filter:brightness(1.05)}
.fc-btn.danger:hover{
  color:var(--md-sys-color-error);
  border-color:color-mix(in srgb, var(--md-sys-color-error) 35%, transparent);
  background:color-mix(in srgb, var(--md-sys-color-error) 8%, transparent);
}
.fc-btn kbd{
  background:var(--md-sys-color-surface-container-highest);
  color:var(--md-sys-color-on-surface-variant);
  padding:1px 5px;
  border-radius:var(--md-sys-shape-corner-extra-small);
  font-size:10px;
  font-family:inherit;
  margin-left:4px;
}
.fc-status{font-size:12px;font-weight:500;margin-top:8px;text-align:center;padding:8px}
.fc-status.ok{color:var(--md-sys-color-secondary)}
.fc-status.err{color:var(--md-sys-color-error)}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Files Panel
   ═══════════════════════════════════════════════════════════════════════════ */
.files-panel{
  display:none;
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-large);
  background:var(--md-sys-color-surface-container-low);
  backdrop-filter:blur(18px);
  max-height:200px;
  overflow:hidden;
  box-shadow:var(--md-sys-elevation-level2);
}
.fp-head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  padding:14px 14px 10px;
  border-bottom:1px solid var(--md-sys-color-outline-variant);
  background:var(--md-sys-color-surface-container);
}
.fp-title{font-size:14px;font-weight:500;color:var(--md-sys-color-on-surface)}
.fp-subtitle{margin-top:3px;font-size:12px;line-height:1.45;color:var(--md-sys-color-on-surface-variant)}
.files-panel.open{display:block}
.fp-list{overflow-y:auto;max-height:154px;padding:6px 0}
.fp-list::-webkit-scrollbar{width:4px}
.fp-list::-webkit-scrollbar-thumb{background:var(--md-sys-color-outline-variant);border-radius:2px}
.fp-item{
  display:flex;
  align-items:center;
  gap:8px;
  padding:8px 14px;
  font-size:12px;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  cursor:default;
  position:relative;
}
.fp-item:hover{background:var(--md-sys-color-surface-container-high)}
.fp-item svg{flex-shrink:0;color:var(--md-sys-color-on-surface-variant)}
.fp-adds{display:flex;align-items:center;gap:3px;flex-shrink:0;font-size:11px}
.fp-adds .add{color:var(--md-sys-color-secondary)}
.fp-path{
  flex:1;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:var(--md-sys-color-on-surface-variant);
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
}
.fp-empty{padding:14px;color:var(--md-sys-color-on-surface-variant);font-size:12px;display:flex;flex-direction:column;gap:6px}
.fp-empty strong{color:var(--md-sys-color-on-surface);font-size:12px}
.fp-actions{position:relative;flex-shrink:0}
.fp-open-btn{
  display:inline-flex;
  align-items:center;
  gap:4px;
  border:1px solid var(--md-sys-color-outline-variant);
  background:var(--md-sys-color-surface-container);
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  font-size:11px;
  font-weight:500;
  padding:5px 8px;
  border-radius:var(--md-sys-shape-corner-small);
  font-family:inherit;
  transition:all var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.fp-open-btn:hover{background:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface)}
.fp-menu{
  display:none;
  position:absolute;
  right:0;
  top:calc(100% + 6px);
  min-width:120px;
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-medium);
  padding:4px;
  box-shadow:var(--md-sys-elevation-level2);
  z-index:80;
}
.fp-menu.open{display:block}
.fp-menu-item{
  width:100%;
  display:flex;
  align-items:center;
  gap:8px;
  background:none;
  border:none;
  color:var(--md-sys-color-on-surface);
  padding:7px 8px;
  border-radius:var(--md-sys-shape-corner-small);
  font-size:12px;
  font-family:inherit;
  cursor:pointer;
  text-align:left;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.fp-menu-item:hover{background:var(--md-sys-color-surface-container-highest)}
.fp-menu-sep{height:1px;background:var(--md-sys-color-outline-variant);margin:4px 0}
.fp-cwd{
  display:flex;
  align-items:center;
  gap:6px;
  padding:8px 14px;
  border-top:1px solid var(--md-sys-color-outline-variant);
  background:var(--md-sys-color-surface-container);
  font-size:11px;
  color:var(--md-sys-color-on-surface-variant);
}
.fp-cwd svg{color:var(--md-sys-color-on-surface-variant);opacity:0.7}
.fp-cwd span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'JetBrains Mono',monospace}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Context Panel
   ═══════════════════════════════════════════════════════════════════════════ */
.ctx-wrap{position:relative;margin-left:auto}
.chip.warn{
  border-color:color-mix(in srgb, #ffd378 28%, transparent);
  color:#ffd378;
}
.chip.danger{
  border-color:color-mix(in srgb, var(--md-sys-color-error) 34%, transparent);
  color:var(--md-sys-color-error);
}
.ctx-ring{color:currentColor;flex-shrink:0}
.ctx-panel{
  display:none;
  position:absolute;
  bottom:calc(100% + 10px);
  right:0;
  width:272px;
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline);
  border-radius:var(--md-sys-shape-corner-large);
  box-shadow:var(--md-sys-elevation-level3);
  z-index:60;
  overflow:hidden;
  animation:ctx-in var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  backdrop-filter:blur(18px);
}
.ctx-panel.open{display:block}
@keyframes ctx-in{from{opacity:0;transform:translateY(4px) scale(0.97)}to{opacity:1;transform:none}}
.ctx-top{padding:14px;display:flex;flex-direction:column;gap:8px}
.ctx-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  font-size:12px;
  color:var(--md-sys-color-on-surface);
}
.ctx-mono{
  font-family:'JetBrains Mono',monospace;
  color:var(--md-sys-color-on-surface-variant);
  font-size:11px;
}
.ctx-bar{
  height:8px;
  background:var(--md-sys-color-surface-container-highest);
  border-radius:var(--md-sys-shape-corner-full);
  overflow:hidden;
  width:100%;
}
.ctx-fill{
  height:100%;
  background:linear-gradient(90deg,var(--md-sys-color-primary),var(--md-sys-color-secondary));
  border-radius:var(--md-sys-shape-corner-full);
  transition:width var(--md-sys-motion-duration-medium1) var(--md-sys-motion-easing-standard);
}
.ctx-details{
  border-top:1px solid var(--md-sys-color-outline-variant);
  padding:14px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
.ctx-section{display:flex;flex-direction:column;gap:4px}
.ctx-section + .ctx-section{border-top:1px solid var(--md-sys-color-outline-variant);padding-top:10px}
.ctx-sh{
  font-size:11px;
  font-weight:700;
  color:var(--md-sys-color-on-surface-variant);
  margin-bottom:2px;
  letter-spacing:0.06em;
  text-transform:uppercase;
}
.ctx-lbl{color:var(--md-sys-color-on-surface-variant)}
.ctx-total{
  font-weight:700;
  border-top:1px solid var(--md-sys-color-outline-variant);
  margin-top:4px;
  padding-top:6px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */
.blink{
  display:inline-block;
  width:2px;
  height:1em;
  background:var(--md-sys-color-primary);
  vertical-align:text-bottom;
  margin-left:1px;
  animation:blink-a 0.85s step-end infinite;
}
@keyframes blink-a{50%{opacity:0}}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{animation:spin 1.2s linear infinite}
.err-msg{color:var(--md-sys-color-error);font-size:13px;font-style:italic;padding:4px 0}

/* Toast - MD3 Snackbar */
.toast-host{
  position:fixed;
  right:16px;
  bottom:16px;
  display:flex;
  flex-direction:column;
  gap:8px;
  z-index:220;
  pointer-events:none;
  max-width:min(320px,calc(100vw - 32px));
}
.toast{
  padding:12px 16px;
  border-radius:var(--md-sys-shape-corner-small);
  border:1px solid var(--md-sys-color-outline-variant);
  background:var(--md-sys-color-surface-container-high);
  color:var(--md-sys-color-on-surface);
  box-shadow:var(--md-sys-elevation-level3);
  opacity:0;
  transform:translateY(8px);
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             transform var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  font-size:14px;
  line-height:1.45;
}
.toast.show{opacity:1;transform:translateY(0)}
.toast.success{border-color:color-mix(in srgb, var(--md-sys-color-secondary) 28%, transparent)}
.toast.error{border-color:color-mix(in srgb, var(--md-sys-color-error) 34%, transparent)}
.toast.info{border-color:color-mix(in srgb, var(--md-sys-color-primary) 24%, transparent)}

/* Focus Indicators */
:focus-visible{
  outline:none;
}
.chip:focus-visible,.ib:focus-visible,.send-btn:focus-visible,.model-btn:focus-visible,
.sug:focus-visible,.fp-open-btn:focus-visible,.fp-menu-item:focus-visible,
.sb-sinput:focus-visible,.chat-input:focus-visible,.dir-item:focus-visible,
.sl-item:focus-visible,.at-item:focus-visible,.back-btn:focus-visible{
  outline:none;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Empty State
   ═══════════════════════════════════════════════════════════════════════════ */
.empty{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  min-height:100%;
  gap:14px;
  padding:36px 28px 42px;
  text-align:center;
}
.empty-badge{
  padding:7px 12px;
  border-radius:var(--md-sys-shape-corner-full);
  border:1px solid color-mix(in srgb, var(--md-sys-color-primary) 18%, transparent);
  background:color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
  color:var(--md-sys-color-primary);
  font-size:12px;
  font-weight:500;
  letter-spacing:0.1em;
  text-transform:uppercase;
}
.empty-logo{
  width:60px;
  height:60px;
  border-radius:var(--md-sys-shape-corner-large);
  object-fit:cover;
  opacity:0.95;
  box-shadow:var(--md-sys-elevation-level2);
  margin-top:4px;
}
.empty h2{
  font:500 var(--md-sys-typescale-headline-medium) 'Inter', sans-serif;
  line-height:1.08;
  letter-spacing:-0.04em;
  max-width:12ch;
  color:var(--md-sys-color-on-surface);
}
.empty p{
  font-size:14px;
  line-height:1.65;
  color:var(--md-sys-color-on-surface-variant);
  max-width:620px;
}
.empty-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
  width:min(100%,760px);
  margin-top:6px;
}
.empty-card{
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-large);
  padding:16px 18px;
  text-align:left;
  box-shadow:var(--md-sys-elevation-level1);
}
.empty-card-k{
  font-size:11px;
  font-weight:700;
  letter-spacing:0.1em;
  text-transform:uppercase;
  color:var(--md-sys-color-primary);
  margin-bottom:10px;
}
.empty-list{
  list-style:none;
  display:flex;
  flex-direction:column;
  gap:8px;
  color:var(--md-sys-color-on-surface-variant);
  font-size:13px;
  line-height:1.5;
}
.empty-list li{position:relative;padding-left:16px}
.empty-list li:before{
  content:'•';
  position:absolute;
  left:0;
  color:var(--md-sys-color-secondary);
}
.sug-row{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  justify-content:center;
  margin-top:4px;
  max-width:720px;
}

/* MD3 Filled Tonal Button (Suggestion) */
.sug{
  padding:10px 16px;
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-full);
  font-size:14px;
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  background:var(--md-sys-color-surface-container-high);
  font-family:inherit;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             transform var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
  overflow:hidden;
}
.sug::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.sug:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.sug:hover{
  background:var(--md-sys-color-surface-container-highest);
  border-color:var(--md-sys-color-outline);
  color:var(--md-sys-color-on-surface);
  transform:translateY(-1px);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Input Area
   ═══════════════════════════════════════════════════════════════════════════ */
.inp-area{
  display:flex;
  flex-direction:column;
  gap:12px;
  flex-shrink:0;
  position:relative;
  z-index:1;
}
.status-bar{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
  padding:0 6px;
}
.chips-l{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

/* MD3 Filter Chip */
.chip{
  display:flex;
  align-items:center;
  gap:6px;
  padding:8px 12px;
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-full);
  font-size:12px;
  color:var(--md-sys-color-on-surface-variant);
  font-family:inherit;
  backdrop-filter:blur(14px);
  position:relative;
  overflow:hidden;
}
.chip.clk{
  cursor:pointer;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.chip.clk::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.chip.clk:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.chip.clk:hover{
  background:var(--md-sys-color-surface-container-highest);
  border-color:var(--md-sys-color-outline);
  color:var(--md-sys-color-on-surface);
}
.status-chip{color:var(--md-sys-color-on-surface)}
.st-dot{
  width:7px;
  height:7px;
  border-radius:50%;
  background:var(--md-sys-color-secondary);
  animation:pulse 2s infinite;
}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}

/* Input Box - MD3 Outlined Text Field */
.inp-box{
  background:var(--md-sys-color-surface-container-low);
  border-radius:var(--md-sys-shape-corner-extra-large);
  border:1px solid var(--md-sys-color-outline-variant);
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             box-shadow var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
  box-shadow:var(--md-sys-elevation-level1);
  overflow:visible;
  width:min(100%,var(--composer-max));
  margin:0 auto;
}
.inp-box:focus-within{
  border-color:var(--md-sys-color-outline);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Menus
   ═══════════════════════════════════════════════════════════════════════════ */
.sl-menu,.at-menu{
  position:absolute;
  bottom:calc(100% + 12px);
  left:0;
  right:0;
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline);
  border-radius:var(--md-sys-shape-corner-large);
  overflow:hidden;
  z-index:50;
  box-shadow:var(--md-sys-elevation-level3);
  display:none;
  backdrop-filter:blur(18px);
}
.sl-menu.open,.at-menu.open{display:block}
.sl-hdr,.at-hdr{
  padding:11px 18px;
  font-size:11px;
  font-weight:700;
  letter-spacing:0.12em;
  border-bottom:1px solid var(--md-sys-color-outline-variant);
  color:var(--md-sys-color-on-surface-variant);
  text-transform:uppercase;
}
.sl-list,.at-list{max-height:240px;overflow-y:auto;padding:6px 0}

/* Menu Item */
.sl-item{
  display:flex;
  align-items:flex-start;
  gap:14px;
  padding:10px 18px;
  cursor:pointer;
  font-size:14px;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
}
.sl-item::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.sl-item:hover::before,.sl-item.hl::before{opacity:var(--md-sys-state-hover-opacity)}
.sl-cmd{
  background:var(--md-sys-color-surface-container-highest);
  color:var(--md-sys-color-primary);
  padding:2px 8px;
  border-radius:var(--md-sys-shape-corner-small);
  font-family:'JetBrains Mono',monospace;
  font-size:13px;
  flex-shrink:0;
}
.sl-desc{
  color:var(--md-sys-color-on-surface-variant);
  font-size:13px;
  margin-top:1px;
  line-height:1.4;
}
.at-item{
  display:flex;
  align-items:center;
  gap:10px;
  padding:9px 18px;
  cursor:pointer;
  font-size:13px;
  font-family:'JetBrains Mono',monospace;
  color:var(--md-sys-color-on-surface-variant);
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
}
.at-item::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.at-item:hover::before,.at-item.hl::before{opacity:var(--md-sys-state-hover-opacity)}
.at-item .at-icon{color:var(--md-sys-color-primary);flex-shrink:0;font-size:14px}
.at-item .at-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.at-loading{padding:12px 20px;font-size:12px;color:var(--md-sys-color-on-surface-variant);text-align:center}

/* Attached Files */
.attached-files{padding:8px 16px 0;flex-wrap:wrap;gap:6px}
.at-chip{
  display:inline-flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  background:var(--md-sys-color-primary-container);
  color:var(--md-sys-color-on-primary-container);
  padding:8px 10px;
  border-radius:var(--md-sys-shape-corner-medium);
  font-family:inherit;
  font-size:12px;
  margin:0 2px;
  border:1px solid transparent;
  max-width:100%;
  min-width:0;
  position:relative;
}
.at-chip-main{display:flex;align-items:center;gap:8px;min-width:0}
.at-chip-icon{
  width:20px;
  height:20px;
  border-radius:var(--md-sys-shape-corner-full);
  background:var(--md-sys-color-surface-container-highest);
  display:flex;
  align-items:center;
  justify-content:center;
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  flex-shrink:0;
}
.at-chip-text{display:flex;flex-direction:column;min-width:0}
.at-chip-text strong{
  font-size:12px;
  color:var(--md-sys-color-on-primary-container);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.at-chip-meta{font-size:11px;color:var(--md-sys-color-on-surface-variant)}
.at-chip .at-x{
  cursor:pointer;
  color:var(--md-sys-color-on-surface-variant);
  margin-left:2px;
  font-size:11px;
  border-radius:var(--md-sys-shape-corner-full);
  width:18px;
  height:18px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
}
.at-chip .at-x:hover{color:var(--md-sys-color-error)}

/* Textarea */
.chat-input{
  width:100%;
  background:transparent;
  border:none;
  outline:none;
  color:var(--md-sys-color-on-surface);
  font-size:15px;
  font-family:inherit;
  resize:none;
  min-height:52px;
  max-height:220px;
  padding:16px 20px 8px;
  line-height:1.55;
  overflow-y:auto;
  caret-color:var(--md-sys-color-primary);
  scrollbar-width:thin;
  scrollbar-color:var(--md-sys-color-outline-variant) transparent;
}
.chat-input::-webkit-scrollbar{width:4px}
.chat-input::-webkit-scrollbar-thumb{background:var(--md-sys-color-outline-variant);border-radius:4px}
.chat-input::-webkit-scrollbar-track{background:transparent}
.chat-input::placeholder{color:var(--md-sys-color-on-surface-variant);opacity:.55;font-size:14px}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Toolbar
   ═══════════════════════════════════════════════════════════════════════════ */
.tb{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px 12px}
.tb-l,.tb-r{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.model-wrap{position:relative}

/* Model Button - MD3 Outlined Button */
.model-btn{
  display:flex;
  align-items:center;
  gap:6px;
  padding:8px 12px;
  background:var(--md-sys-color-surface-container-high);
  border-radius:var(--md-sys-shape-corner-full);
  border:1px solid var(--md-sys-color-outline-variant);
  color:var(--md-sys-color-on-surface-variant);
  font-size:12px;
  font-family:inherit;
  cursor:pointer;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
  overflow:hidden;
}
.model-btn::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.model-btn:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.model-btn:hover{
  background:var(--md-sys-color-surface-container-highest);
  border-color:var(--md-sys-color-outline);
  color:var(--md-sys-color-on-surface);
}

/* Model Dropdown - MD3 Menu */
.model-dd-shell{position:absolute;bottom:calc(100% + 10px);left:0;display:none;z-index:60}
.model-dd-shell:has(.model-dd.open),.model-dd-shell .model-dd.open{display:block}
.model-dd{
  display:none;
  min-width:320px;
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline);
  border-radius:var(--md-sys-shape-corner-large);
  overflow:hidden;
  box-shadow:var(--md-sys-elevation-level3);
  backdrop-filter:blur(18px);
}
.model-dd.open{display:block}
.model-dd-hdr{
  padding:11px 16px;
  font-size:11px;
  font-weight:700;
  letter-spacing:0.12em;
  color:var(--md-sys-color-on-surface-variant);
  border-bottom:1px solid var(--md-sys-color-outline-variant);
  text-transform:uppercase;
}
.model-dd-list{max-height:340px;overflow-y:auto;padding:4px 0}
.model-group{
  padding:8px 16px 4px;
  font-size:11px;
  font-weight:700;
  letter-spacing:0.1em;
  color:var(--md-sys-color-on-surface-variant);
  text-transform:uppercase;
  margin-top:4px;
}
.model-group:first-child{margin-top:0}

/* Menu Item for Model Selection */
.model-opt{
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px 16px;
  cursor:pointer;
  font-size:14px;
  color:var(--md-sys-color-on-surface-variant);
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
}
.model-opt::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.model-opt:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.model-opt.active::before{background:var(--md-sys-color-primary);opacity:0.12}
.model-opt.active{
  color:var(--md-sys-color-on-surface);
}
.model-opt .mo-info{flex:1;min-width:0}
.model-opt .mo-name{font-size:14px;display:flex;align-items:center;gap:6px}
.model-opt.active .mo-name{color:var(--md-sys-color-primary);font-weight:500}
.model-opt .mo-desc{
  font-size:12px;
  color:var(--md-sys-color-on-surface-variant);
  margin-top:2px;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.mo-badge{
  font-size:9px;
  font-weight:700;
  letter-spacing:0.04em;
  padding:2px 6px;
  border-radius:var(--md-sys-shape-corner-full);
  text-transform:uppercase;
  flex-shrink:0;
}
.mo-badge.preview{
  background:var(--md-sys-color-primary-container);
  color:var(--md-sys-color-on-primary-container);
}
.mo-badge.thinking{
  background:var(--md-sys-color-tertiary-container);
  color:var(--md-sys-color-on-tertiary-container);
}
.model-opt .check{opacity:0;color:var(--md-sys-color-primary);flex-shrink:0}
.model-opt.active .check{opacity:1}


/* MD3 Switch */
.m3sw{
  width:40px;
  height:20px;
  border-radius:var(--md-sys-shape-corner-full);
  position:relative;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  flex-shrink:0;
  display:inline-block;
}
.m3sw.off{
  background:var(--md-sys-color-surface-container-highest);
  border:2px solid var(--md-sys-color-outline);
}
.m3sw.off::after{
  content:'';
  position:absolute;
  width:12px;
  height:12px;
  background:var(--md-sys-color-outline);
  border-radius:50%;
  top:2px;
  left:2px;
  transition:all var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.m3sw.on{
  background:var(--md-sys-color-primary);
  border:none;
}
.m3sw.on::after{
  content:'';
  position:absolute;
  width:16px;
  height:16px;
  background:var(--md-sys-color-on-primary);
  border-radius:50%;
  top:2px;
  right:2px;
  box-shadow:var(--md-sys-elevation-level1);
  transition:all var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}

/* MD3 FAB (Send Button) */
.send-btn{
  width:48px;
  height:48px;
  background:var(--md-sys-color-primary);
  color:var(--md-sys-color-on-primary);
  border:none;
  border-radius:var(--md-sys-shape-corner-large);
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  transition:transform var(--md-sys-motion-duration-short2) var(--md-sys-motion-easing-standard),
             filter var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  flex-shrink:0;
  box-shadow:var(--md-sys-elevation-level3);
  position:relative;
  overflow:hidden;
}
.send-btn::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-primary);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.send-btn:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.send-btn:hover{filter:brightness(1.05)}
.send-btn:active{transform:scale(0.95)}
.send-btn:disabled{
  background:var(--md-sys-color-surface-container-highest);
  color:var(--md-sys-color-on-surface-variant);
  cursor:not-allowed;
  box-shadow:none;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar Search & View Toggle
   ═══════════════════════════════════════════════════════════════════════════ */
.view-tog{
  display:flex;
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-medium);
  overflow:hidden;
  flex-shrink:0;
  background:var(--md-sys-color-surface-container);
}
.view-tog button{
  background:transparent;
  border:none;
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  padding:6px 8px;
  display:flex;
  align-items:center;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
}
.view-tog button:not(:last-child){border-right:1px solid var(--md-sys-color-outline-variant)}
.view-tog button:hover,.view-tog button.active{
  background:var(--md-sys-color-surface-container-high);
  color:var(--md-sys-color-on-surface);
}
.sb-search-row{display:flex;align-items:center;gap:8px;padding:0 14px 12px}
.sb-sinput-wrap{flex:1;min-width:0;position:relative}
.sb-sinput-wrap svg{
  position:absolute;
  left:10px;
  top:50%;
  transform:translateY(-50%);
  color:var(--md-sys-color-on-surface-variant);
  pointer-events:none;
}
.sb-sinput{
  width:100%;
  background:var(--md-sys-color-surface-container);
  border:1px solid transparent;
  outline:none;
  border-radius:var(--md-sys-shape-corner-medium);
  padding:8px 10px 8px 30px;
  color:var(--md-sys-color-on-surface);
  font-size:12px;
  font-family:inherit;
  transition:box-shadow var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.sb-sinput::placeholder{color:var(--md-sys-color-on-surface-variant)}
.sb-sinput:focus{
  box-shadow:0 0 0 2px var(--md-sys-color-primary);
  border-color:var(--md-sys-color-primary);
  background:var(--md-sys-color-surface-container-high);
}

/* Workspace Groups */
.ws-group{margin-bottom:2px}
.ws-hdr{
  display:flex;
  align-items:center;
  padding:6px 8px;
  cursor:pointer;
  border-radius:var(--md-sys-shape-corner-medium);
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  gap:4px;
  position:relative;
}
.ws-hdr:hover{background:var(--md-sys-color-surface-container-high)}
.ws-chev{color:var(--md-sys-color-on-surface-variant);flex-shrink:0;transition:transform var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard)}
.ws-chev.closed{transform:rotate(-90deg)}
.ws-path{
  flex:1;
  font-size:11px;
  font-weight:500;
  color:var(--md-sys-color-on-surface-variant);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  min-width:0;
  text-align:left;
}
.ws-cnt{font-size:10px;color:var(--md-sys-color-on-surface-variant);opacity:0.7;flex-shrink:0}
.ws-new,.ws-add,.si-del{
  background:transparent;
  border:none;
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.ws-new{padding:4px;border-radius:var(--md-sys-shape-corner-full);opacity:0;flex-shrink:0}
.ws-group:hover .ws-new{opacity:1}
.ws-new:hover{background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
.ws-add{padding:2px;border-radius:var(--md-sys-shape-corner-extra-small);opacity:0;flex-shrink:0}
.ws-group:hover .ws-add{opacity:1}
.ws-add:hover{background:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface)}
.ws-items{padding-left:10px}
.ws-items.closed{display:none}
.si-del{padding:4px;border-radius:var(--md-sys-shape-corner-extra-small);opacity:0;flex-shrink:0}
.si:hover .si-del{opacity:1}
.si-del:hover{color:var(--md-sys-color-error)}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Icons
   ═══════════════════════════════════════════════════════════════════════════ */
svg.ic{
  width:16px;
  height:16px;
  stroke:currentColor;
  stroke-width:2;
  fill:none;
  stroke-linecap:round;
  stroke-linejoin:round;
}
svg.ic.xs{width:14px;height:14px}
svg.ic.md{width:18px;height:18px}
svg.ic.lg{width:20px;height:20px}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Panels
   ═══════════════════════════════════════════════════════════════════════════ */
.panel{display:none;padding:28px 0}
.panel.active{display:block}
.panel .mw{max-width:760px;margin:0 auto;padding:0 24px}
.panel-header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.panel-header h2{
  font:500 var(--md-sys-typescale-title-large) 'Inter', sans-serif;
  color:var(--md-sys-color-primary);
  letter-spacing:-0.02em;
}
.back-btn{
  background:transparent;
  border:none;
  color:var(--md-sys-color-on-surface-variant);
  cursor:pointer;
  padding:8px;
  border-radius:var(--md-sys-shape-corner-full);
  display:flex;
  align-items:center;
  justify-content:center;
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
  overflow:hidden;
}
.back-btn::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.back-btn:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.back-btn:hover{color:var(--md-sys-color-on-surface)}

/* Stat Card - MD3 Filled Card */
.stat-card,.mem-section,.tool-item{
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-large);
  padding:16px 18px;
  margin-bottom:12px;
}
.stat-section-title{
  font-size:11px;
  font-weight:600;
  letter-spacing:0.08em;
  text-transform:uppercase;
  color:var(--md-sys-color-on-surface-variant);
  margin-bottom:10px;
}
.stat-row{
  display:flex;
  justify-content:space-between;
  gap:12px;
  padding:10px 0;
  border-bottom:1px solid var(--md-sys-color-outline-variant);
  font-size:14px;
}
.stat-row:last-child{border-bottom:none}
.stat-label{color:var(--md-sys-color-on-surface-variant)}
.stat-value{
  color:var(--md-sys-color-on-surface);
  font-family:'JetBrains Mono',monospace;
  font-size:13px;
}
.quota-bar{
  height:8px;
  background:var(--md-sys-color-surface-container-highest);
  border-radius:var(--md-sys-shape-corner-full);
  margin-top:8px;
  overflow:hidden;
}
.quota-fill{
  height:100%;
  background:var(--md-sys-color-primary);
  border-radius:var(--md-sys-shape-corner-full);
  transition:width var(--md-sys-motion-duration-medium1) var(--md-sys-motion-easing-standard);
}
.tool-item{display:flex;align-items:flex-start;gap:12px}
.tool-icon{
  background:var(--md-sys-color-surface-container-highest);
  border-radius:var(--md-sys-shape-corner-medium);
  padding:8px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  color:var(--md-sys-color-primary);
}
.tool-name{font-weight:500;font-size:14px;color:var(--md-sys-color-on-surface)}
.tool-desc{font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:2px}
.mem-title{
  font-size:12px;
  font-weight:700;
  letter-spacing:0.08em;
  color:var(--md-sys-color-primary);
  margin-bottom:8px;
  display:flex;
  align-items:center;
  gap:6px;
  text-transform:uppercase;
}
.mem-content{
  font-family:'JetBrains Mono',monospace;
  font-size:13px;
  line-height:1.6;
  color:var(--md-sys-color-on-surface-variant);
  white-space:pre-wrap;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 COMPONENTS - Modal (Dialog)
   ═══════════════════════════════════════════════════════════════════════════ */
.modal-overlay{
  position:fixed;
  inset:0;
  background:var(--md-sys-color-scrim);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:100;
  display:none;
  backdrop-filter:blur(6px);
}
.modal-overlay.open{display:flex}
.modal{
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline);
  border-radius:var(--md-sys-shape-corner-extra-large);
  padding:24px;
  max-width:500px;
  width:min(90vw,500px);
  box-shadow:var(--md-sys-elevation-level3);
}
.modal h2{
  font:500 var(--md-sys-typescale-title-large) 'Inter', sans-serif;
  color:var(--md-sys-color-on-surface);
  margin-bottom:16px;
}
.theme-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.theme-card{
  padding:16px 12px;
  border-radius:var(--md-sys-shape-corner-medium);
  border:2px solid var(--md-sys-color-outline-variant);
  cursor:pointer;
  text-align:center;
  font-size:13px;
  transition:border-color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             transform var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
  overflow:hidden;
}
.theme-card::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.theme-card:hover::before{opacity:var(--md-sys-state-hover-opacity)}
.theme-card:hover{
  border-color:var(--md-sys-color-outline);
  transform:translateY(-1px);
}
.theme-card.active{
  border-color:var(--md-sys-color-primary);
  background:color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
}
.theme-swatch{
  width:32px;
  height:32px;
  border-radius:50%;
  margin:0 auto 8px;
  border:2px solid var(--md-sys-color-outline-variant);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Directory Picker
   ═══════════════════════════════════════════════════════════════════════════ */
.dir-overlay{
  display:none;
  position:fixed;
  inset:0;
  background:var(--md-sys-color-scrim);
  z-index:200;
  align-items:flex-start;
  justify-content:center;
  padding-top:min(18vh,120px);
  backdrop-filter:blur(6px);
}
.dir-overlay.open{display:flex}
.dir-box{
  width:min(560px,92vw);
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline);
  border-radius:var(--md-sys-shape-corner-extra-large);
  overflow:hidden;
  box-shadow:var(--md-sys-elevation-level3);
  animation:dir-in var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
@keyframes dir-in{from{opacity:0;transform:translateY(-8px) scale(0.97)}to{opacity:1;transform:none}}
.dir-input-row{
  display:flex;
  align-items:center;
  gap:10px;
  padding:16px 18px;
  border-bottom:1px solid var(--md-sys-color-outline-variant);
}
.dir-input-row svg{color:var(--md-sys-color-on-surface-variant);flex-shrink:0}
.dir-input{
  flex:1;
  background:transparent;
  border:none;
  outline:none;
  color:var(--md-sys-color-on-surface);
  font-size:14px;
  font-family:inherit;
}
.dir-input::placeholder{color:var(--md-sys-color-on-surface-variant)}
.dir-list{max-height:320px;overflow-y:auto;padding:6px 0}
.dir-list::-webkit-scrollbar{width:4px}
.dir-list::-webkit-scrollbar-thumb{background:var(--md-sys-color-outline-variant);border-radius:2px}
.dir-group-label{
  padding:8px 18px 4px;
  font-size:11px;
  font-weight:700;
  letter-spacing:0.08em;
  color:var(--md-sys-color-on-surface-variant);
  text-transform:uppercase;
}
.dir-item{
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px 18px;
  cursor:pointer;
  font-size:14px;
  color:var(--md-sys-color-on-surface);
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
  position:relative;
}
.dir-item::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--md-sys-color-on-surface);
  opacity:0;
  transition:opacity var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.dir-item:hover::before,.dir-item.selected::before{opacity:var(--md-sys-state-hover-opacity)}
.dir-item svg{color:var(--md-sys-color-on-surface-variant);flex-shrink:0}
.dir-item-path{
  flex:1;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-family:'JetBrains Mono',monospace;
  font-size:12px;
}
.dir-item-key{flex-shrink:0;font-size:11px;color:var(--md-sys-color-on-surface-variant);opacity:0.6}

/* ═══════════════════════════════════════════════════════════════════════════
   Responsive Design
   ═══════════════════════════════════════════════════════════════════════════ */
.sb-toggle{
  display:none;
  position:fixed;
  top:14px;
  left:14px;
  z-index:25;
  background:var(--md-sys-color-surface-container-high);
  border:1px solid var(--md-sys-color-outline-variant);
  border-radius:var(--md-sys-shape-corner-medium);
  width:42px;
  height:42px;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  color:var(--md-sys-color-on-surface-variant);
  transition:background var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard),
             color var(--md-sys-motion-duration-short3) var(--md-sys-motion-easing-standard);
}
.sb-toggle:hover{
  background:var(--md-sys-color-surface-container-highest);
  color:var(--md-sys-color-on-surface);
}
.sb-overlay{
  display:none;
  position:fixed;
  inset:0;
  background:var(--md-sys-color-scrim);
  z-index:15;
  backdrop-filter:blur(4px);
}

@media(max-width:1024px){
  .sidebar{width:248px;min-width:248px}
  .app-shell{padding:18px 18px 16px}
  .app-shell{gap:12px}
  .topbar-title{font-size:24px}
  .folder-chip{max-width:220px}
  .mw{max-width:100%;padding:0 20px}
  .u-bub{max-width:84%}
}

@media(max-width:768px){
  .sb-toggle{display:flex}
  .sidebar{
    position:fixed;
    top:0;
    left:0;
    height:100%;
    width:280px;
    min-width:280px;
    z-index:20;
    transform:translateX(-100%);
    transition:transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard),
               opacity var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard);
    opacity:0;
  }
  .sidebar.mobile-open{transform:translateX(0);opacity:1}
  .sidebar.collapsed{transform:translateX(-100%)}
  .sb-overlay.open{display:block}
  body{overflow:hidden}
  .app-shell{padding:14px 10px 12px;gap:10px}
  .topbar{padding:0 4px 0 48px;align-items:flex-start;gap:10px;flex-wrap:wrap}
  .topbar-l{flex:1;min-width:0}
  .topbar-title{font-size:20px;white-space:normal;max-width:none}
  .topbar-r{gap:6px;max-width:none;width:auto;flex:0 0 auto}
  .topbar-r .ib:not(:last-child){display:none}
  .folder-chip{display:none}
  .chat,.panel{border-radius:var(--md-sys-shape-corner-large)}
  .chat{padding:20px 0 16px}
  .mw{padding:0 14px}
  .empty{padding:24px 18px 30px;gap:12px}
  .empty h2{font-size:1.65rem}
  .empty p{font-size:13px}
  .empty-grid{grid-template-columns:1fr}
  .u-bub{max-width:90%;font-size:14px}
  .a-text{font-size:14px}
  .status-bar{display:flex;flex-direction:column;align-items:stretch;padding:0 2px;gap:8px}
  .ctx-wrap{margin-left:0}
  .chips-l{width:100%;justify-content:space-between;align-items:stretch}
  .chip{width:auto;min-height:38px}
  .status-chip{flex:1;min-width:0}
  .inp-area{gap:10px}
  .inp-box{
    border-radius:var(--md-sys-shape-corner-large);
    position:sticky;
    bottom:0;
    max-width:none;
  }
  .chat-input{min-height:48px;padding:14px 16px 6px;font-size:14px}
  .tb{padding:6px 8px 10px;align-items:flex-end}
  .tb-l{flex:1;min-width:0}
  .tb-r{flex-shrink:0;align-self:flex-end}
  .tb-l > *{max-width:100%}
  .model-btn span{max-width:108px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .attached-files{padding:8px 12px 0;max-height:108px;overflow:auto}
  .files-panel{max-height:240px}
  .fp-list{max-height:176px}
  .sl-menu,.at-menu{border-radius:var(--md-sys-shape-corner-medium)}
  .sl-item{padding:12px 16px;gap:10px}
  .model-dd-shell{
    position:fixed!important;
    left:0!important;
    right:0!important;
    bottom:0!important;
    top:auto!important;
    padding:0 8px 8px;
    z-index:70;
  }
  .model-dd{
    min-width:100%!important;
    border-radius:var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-medium) var(--md-sys-shape-corner-medium)!important;
    max-height:60vh;
  }
  .model-dd-list{max-height:calc(60vh - 44px)}
  .model-opt{padding:14px 16px;min-height:48px}
  .sug-row{gap:8px}
  .sug{padding:8px 12px;font-size:12px}
  .act-h{padding:10px 12px;gap:8px}
  .act-title{font-size:13px}
  .act-body{font-size:11px;padding:10px 12px}
  .ctx-panel{left:0;right:0;width:auto;bottom:calc(100% + 8px)}
}

@media(max-width:480px){
  .topbar{padding:0 2px 0 46px}
  .topbar-kicker{font-size:10px}
  .topbar-title{font-size:18px}
  .mw{padding:0 10px}
  .chat,.panel{border-radius:var(--md-sys-shape-corner-medium)}
  .topbar-r{flex-wrap:wrap;justify-content:flex-end;width:100%}
  .status-bar{gap:6px}
  .chips-l{flex-direction:column;align-items:stretch}
  .chip,.ctx-wrap{width:100%}
  .ctx-panel{left:0;right:0;width:auto}
  .u-bub{
    max-width:92%;
    padding:10px 14px;
    border-radius:var(--md-sys-shape-corner-medium);
    border-bottom-right-radius:var(--md-sys-shape-corner-extra-small);
  }
  .a-text{line-height:1.65}
  .chat-input{font-size:16px}
  .attached-files{padding:6px 10px 0;max-height:92px}
  .at-chip{width:100%;margin:0}
  .tb{padding:6px 8px 8px;gap:8px;align-items:center}
  .tb-l{gap:4px}
  .model-wrap{flex:1;min-width:0}
  .model-btn{padding:6px 10px;font-size:11px;width:100%;justify-content:space-between}
  .send-btn{width:44px;height:44px;border-radius:var(--md-sys-shape-corner-medium)}
  .empty-logo{width:48px;height:48px}
  .empty h2{font-size:1.42rem}
  .empty p{font-size:12px}
  .empty-card{padding:14px 14px}
  .empty-list{font-size:12px}
  .sug{padding:7px 10px;font-size:11px}
  .cb{font-size:12px}
  .cb-pre{padding:10px 12px}
}

@supports(padding: env(safe-area-inset-bottom)){
  .app-shell{padding-bottom:calc(18px + env(safe-area-inset-bottom))}
  .sidebar{padding-top:env(safe-area-inset-top)}
}

@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important}
}

/* ═══════════════════════════════════════════════════════════════════════════
   MD3 THEME VARIANTS
   ═══════════════════════════════════════════════════════════════════════════ */

/* Light Theme */
[data-theme="light"]{
${generateMD3CSSVariables(lightColorScheme)}
${generateLegacyAliases()}
}

/* Ocean Theme */
[data-theme="ocean"]{
${generateMD3CSSVariables(oceanColorScheme)}
${generateLegacyAliases()}
}

/* Forest Theme */
[data-theme="forest"]{
${generateMD3CSSVariables(forestColorScheme)}
${generateLegacyAliases()}
}
`;
}
