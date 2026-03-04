/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Forever Bridge — Zero-dependency Pub/Sub Google Chat bridge.
 *
 * Runs Gemini CLI in forever mode, pulls Chat messages from Pub/Sub,
 * forwards to the agent via A2A JSON-RPC, sends responses back via Chat API.
 * Auto-restarts the CLI on crash. Auth via GCE metadata server.
 *
 * Just: node main.mjs
 */

import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

let A2A_URL = null;
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '8081', 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '1000', 10);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GEMINI_NPX_PACKAGE =
  process.env.GEMINI_NPX_PACKAGE ||
  'https://github.com/google-gemini/gemini-cli#forever';

const PUBSUB_API = 'https://pubsub.googleapis.com/v1';
const CHAT_API = 'https://chat.googleapis.com/v1';
const METADATA_BASE = 'http://metadata.google.internal/computeMetadata/v1';
const METADATA_TOKEN_URL = `${METADATA_BASE}/instance/service-accounts/default/token`;
const A2A_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_CHAT_TEXT_LENGTH = 4000;

let PUBSUB_SUBSCRIPTION;

function log(msg) {
  console.log(`[${new Date().toISOString()}] [Bridge] ${msg}`);
}

function logError(msg) {
  console.error(`[${new Date().toISOString()}] [Bridge] ${msg}`);
}

// ---------------------------------------------------------------------------
// GCE metadata — project ID + auth tokens (zero dependencies)
// ---------------------------------------------------------------------------

async function getProjectId() {
  const res = await fetch(`${METADATA_BASE}/project/project-id`, {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!res.ok) throw new Error(`Failed to get project ID: ${res.status}`);
  return (await res.text()).trim();
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken(scope) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const url = scope
    ? `${METADATA_TOKEN_URL}?scopes=${encodeURIComponent(scope)}`
    : METADATA_TOKEN_URL;
  const res = await fetch(url, {
    headers: { 'Metadata-Flavor': 'Google' },
  });

  if (!res.ok) throw new Error(`Metadata token request failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

// ---------------------------------------------------------------------------
// Process manager — spawn/restart Gemini CLI forever session
// ---------------------------------------------------------------------------

const PM_MIN_BACKOFF_MS = 1_000;
const PM_MAX_BACKOFF_MS = 60_000;
const PM_STABLE_UPTIME_MS = 30_000;
const PM_READY_POLL_MS = 2_000;
const PM_READY_TIMEOUT_MS = 120_000;

let pmStopping = false;
let pmBackoffMs = PM_MIN_BACKOFF_MS;
let pmReadyResolve = null;
let agentReady = false;

function hasExistingSession() {
  const tmpDir = join(homedir(), '.gemini', 'tmp');
  try {
    for (const project of readdirSync(tmpDir)) {
      const chatsDir = join(tmpDir, project, 'chats');
      try {
        if (readdirSync(chatsDir).some(f => f.endsWith('.json'))) return true;
      } catch { /* no chats dir for this project */ }
    }
  } catch { /* no tmp dir yet */ }
  return false;
}

const TMUX_SESSION = 'gemini-forever';

function buildCommand() {
  const cliArgs = [
    GEMINI_NPX_PACKAGE,
    '--forever', '-y', '-m', GEMINI_MODEL,
  ];

  if (hasExistingSession()) {
    cliArgs.push('-r');
    log('Resuming previous session');
  }

  const npxCmd = `npx -y ${cliArgs.join(' ')}`;

  // Run inside a tmux session so Ink gets a real TTY without overpainting the bridge
  return {
    cmd: 'tmux',
    args: ['new-session', '-d', '-s', TMUX_SESSION, '-x', '200', '-y', '50', npxCmd],
  };
}

function discoverPort() {
  const sessionsDir = join(homedir(), '.gemini', 'sessions');
  try {
    const files = readdirSync(sessionsDir).filter(f => f.endsWith('.port'));
    for (const f of files) {
      const port = parseInt(readFileSync(join(sessionsDir, f), 'utf-8').trim(), 10);
      if (port > 0) return port;
    }
  } catch {
    // directory may not exist yet
  }
  return null;
}

async function waitForA2AReady() {
  const deadline = Date.now() + PM_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const port = discoverPort();
    if (port) {
      const url = `http://127.0.0.1:${port}`;
      try {
        const res = await fetch(`${url}/.well-known/agent-card.json`);
        if (res.ok) {
          A2A_URL = url;
          log(`Agent ready at ${A2A_URL} (port ${port} from file)`);
          return true;
        }
      } catch {
        // port file exists but agent not responding yet
      }
    }
    await new Promise(r => setTimeout(r, PM_READY_POLL_MS));
  }

  logError(`Agent did not become ready within ${PM_READY_TIMEOUT_MS / 1000}s`);
  return false;
}

function scheduleRestart() {
  if (pmStopping) return;
  log(`Restarting in ${pmBackoffMs}ms...`);
  setTimeout(() => {
    pmBackoffMs = Math.min(pmBackoffMs * 2, PM_MAX_BACKOFF_MS);
    spawnAgent();
  }, pmBackoffMs);
}

function isTmuxSessionAlive() {
  try {
    const result = spawnSync('tmux', ['has-session', '-t', TMUX_SESSION], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

function spawnAgent() {
  if (pmStopping) return;

  // Kill stale tmux session if it exists
  spawnSync('tmux', ['kill-session', '-t', TMUX_SESSION], { stdio: 'ignore' });

  const { cmd, args } = buildCommand();
  log(`Spawning: ${cmd} ${args.join(' ')}`);

  const startTime = Date.now();
  agentReady = false;

  const result = spawnSync(cmd, args, {
    env: { ...process.env },
    stdio: 'ignore',
  });

  if (result.status !== 0) {
    logError(`Failed to start tmux session (exit ${result.status})`);
    scheduleRestart();
    return;
  }

  log(`tmux session '${TMUX_SESSION}' started`);

  // Monitor the tmux session
  const monitor = setInterval(() => {
    if (pmStopping) { clearInterval(monitor); return; }

    if (!isTmuxSessionAlive()) {
      clearInterval(monitor);
      const uptime = Date.now() - startTime;
      log(`Agent tmux session died: uptime=${uptime}ms`);
      if (uptime > PM_STABLE_UPTIME_MS) pmBackoffMs = PM_MIN_BACKOFF_MS;
      agentReady = false;
      if (!pmStopping) scheduleRestart();
    }
  }, 5000);

  waitForA2AReady().then(ready => {
    if (ready) {
      agentReady = true;
      pmBackoffMs = PM_MIN_BACKOFF_MS;
      if (pmReadyResolve) { pmReadyResolve(); pmReadyResolve = null; }
    } else if (!pmStopping) {
      logError('Killing agent (A2A port never became ready)');
      spawnSync('tmux', ['kill-session', '-t', TMUX_SESSION], { stdio: 'ignore' });
    }
  });
}

function startAgent() {
  pmStopping = false;
  const p = new Promise(resolve => { pmReadyResolve = resolve; });
  spawnAgent();
  return p;
}

function stopAgent() {
  pmStopping = true;
  log('Killing tmux session');
  spawnSync('tmux', ['kill-session', '-t', TMUX_SESSION], { stdio: 'ignore' });
}

function isReady() {
  return agentReady;
}

// ---------------------------------------------------------------------------
// Pub/Sub pull (REST API)
// ---------------------------------------------------------------------------

let polling = true;

async function pullMessages() {
  const token = await getAccessToken();
  const res = await fetch(`${PUBSUB_API}/${PUBSUB_SUBSCRIPTION}:pull`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxMessages: 10 }),
  });

  if (!res.ok) throw new Error(`Pub/Sub pull failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.receivedMessages || [];
}

async function ackMessages(ackIds) {
  if (ackIds.length === 0) return;
  const token = await getAccessToken();
  await fetch(`${PUBSUB_API}/${PUBSUB_SUBSCRIPTION}:acknowledge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ackIds }),
  });
}

// ---------------------------------------------------------------------------
// Google Chat API
// ---------------------------------------------------------------------------

async function sendChatMessage(spaceName, threadName, text, isDm = false) {
  const chunks = splitText(text || '(no response)');

  for (const chunk of chunks) {
    const message = { text: chunk };
    if (!isDm && threadName) message.thread = { name: threadName };

    const queryParam = isDm ? '' : '?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';
    const url = `${CHAT_API}/${spaceName}/messages${queryParam}`;

    try {
      const token = await getAccessToken('https://www.googleapis.com/auth/chat.bot');
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!res.ok) logError(`Chat API ${res.status}: ${await res.text()}`);
      else log(`Sent to ${spaceName} (${chunk.length} chars)`);
    } catch (err) {
      logError(`Chat API error: ${err.message}`);
    }
  }
}

function splitText(text) {
  if (text.length <= MAX_CHAT_TEXT_LENGTH) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > MAX_CHAT_TEXT_LENGTH) {
    let splitAt = remaining.lastIndexOf('\n\n', MAX_CHAT_TEXT_LENGTH);
    if (splitAt < MAX_CHAT_TEXT_LENGTH * 0.3) splitAt = remaining.lastIndexOf('\n', MAX_CHAT_TEXT_LENGTH);
    if (splitAt < MAX_CHAT_TEXT_LENGTH * 0.3) splitAt = MAX_CHAT_TEXT_LENGTH;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

// ---------------------------------------------------------------------------
// Event normalization
// ---------------------------------------------------------------------------

function isObj(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(obj, key) {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

function getSpaceType(space) {
  // Google Chat uses 'type' or 'spaceType' depending on API version
  return str(space, 'type') || str(space, 'spaceType');
}

function normalizeEvent(raw) {
  if (typeof raw.type === 'string') {
    const message = isObj(raw.message) ? raw.message : {};
    const space = isObj(raw.space) ? raw.space : isObj(message.space) ? message.space : {};
    const thread = isObj(message.thread) ? message.thread : {};
    return { type: raw.type, text: str(message, 'text'), spaceName: str(space, 'name'), threadName: str(thread, 'name'), spaceType: getSpaceType(space) };
  }

  const chat = raw.chat;
  if (!isObj(chat)) return null;

  if (isObj(chat.messagePayload)) {
    const payload = chat.messagePayload;
    const message = isObj(payload.message) ? payload.message : {};
    const space = isObj(payload.space) ? payload.space : isObj(message.space) ? message.space : {};
    const thread = isObj(message.thread) ? message.thread : {};
    return { type: 'MESSAGE', text: str(message, 'text'), spaceName: str(space, 'name'), threadName: str(thread, 'name'), spaceType: getSpaceType(space) };
  }

  if (isObj(chat.addedToSpacePayload)) {
    const space = isObj(chat.addedToSpacePayload.space) ? chat.addedToSpacePayload.space : {};
    return { type: 'ADDED_TO_SPACE', text: '', spaceName: str(space, 'name'), threadName: '', spaceType: getSpaceType(space) };
  }

  return null;
}

// ---------------------------------------------------------------------------
// A2A JSON-RPC
// ---------------------------------------------------------------------------

async function sendToAgent(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), A2A_TIMEOUT_MS);

  try {
    const res = await fetch(A2A_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'message/send',
        params: { message: { role: 'user', parts: [{ kind: 'text', text }] } },
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Agent ${res.status}: ${await res.text()}`);
    const result = await res.json();
    if (result.error) throw new Error(`Agent error: ${result.error.message}`);

    const parts = result.result?.status?.message?.parts ?? [];
    return parts.filter(p => p.kind === 'text' && p.text).map(p => p.text).join('\n') || '(no response)';
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

// Track last active Chat space for unsolicited response forwarding
let lastChatSpace = null;
let lastChatThread = null;
let lastChatIsDm = false;

async function handleMessage(data) {
  let raw;
  try {
    raw = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
  } catch (err) {
    logError(`Bad message data: ${err.message}`);
    return;
  }

  const event = normalizeEvent(raw);
  if (!event) return;

  const isDm = event.spaceType === 'DM';
  log(`${event.type}: space=${event.spaceName} type=${event.spaceType || 'unknown'} text="${event.text.substring(0, 100)}"`);

  if (event.type === 'ADDED_TO_SPACE') {
    await sendChatMessage(event.spaceName, '', 'Gemini CLI forever agent connected. Send me a task!', isDm);
    return;
  }

  if (event.type !== 'MESSAGE' || !event.text) return;

  // Track last active space for unsolicited response forwarding
  lastChatSpace = event.spaceName;
  lastChatThread = event.threadName;
  lastChatIsDm = isDm;

  if (!isReady()) {
    await sendChatMessage(event.spaceName, event.threadName, '⏳ Agent is starting up, please try again in a moment.', isDm);
    return;
  }

  try {
    log(`→ Agent: "${event.text.substring(0, 100)}"`);
    const responseText = await sendToAgent(event.text);
    log(`← Agent: ${responseText.length} chars`);
    await sendChatMessage(event.spaceName, event.threadName, responseText, isDm);
  } catch (err) {
    logError(`Error: ${err.message}`);
    await sendChatMessage(event.spaceName, event.threadName, `❌ Error: ${err.message}`, isDm);
  }
}

// ---------------------------------------------------------------------------
// Poll unsolicited responses (Sisyphus auto-resume output, etc.)
// ---------------------------------------------------------------------------

const UNSOLICITED_POLL_MS = 5000;

async function pollUnsolicitedResponses() {
  while (polling) {
    if (isReady() && A2A_URL && lastChatSpace) {
      try {
        const res = await fetch(A2A_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'responses/poll',
            params: {},
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const responses = data.result?.responses ?? [];
          for (const text of responses) {
            if (text) {
              log(`← Unsolicited (${text.length} chars) → ${lastChatSpace}`);
              await sendChatMessage(lastChatSpace, lastChatThread, text, lastChatIsDm);
            }
          }
        }
      } catch {
        // agent may be restarting
      }
    }
    await new Promise(r => setTimeout(r, UNSOLICITED_POLL_MS));
  }
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

async function pollLoop() {
  while (polling) {
    try {
      const messages = await pullMessages();

      if (messages.length > 0) {
        await ackMessages(messages.map(m => m.ackId));

        for (const msg of messages) {
          await handleMessage(msg.message.data);
        }
      }
    } catch (err) {
      logError(`Poll error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const code = isReady() ? 200 : 503;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: isReady() ? 'ok' : 'agent_starting', agentReady: isReady(), a2aUrl: A2A_URL || 'discovering...' }));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });
  server.listen(HEALTH_PORT, '0.0.0.0', () => log(`Health check on :${HEALTH_PORT}`));
  return server;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const WORKSPACE_DIR = join(homedir(), 'forever-workspace');

function setupWorkspace() {
  const home = homedir();
  const userGemini = join(home, '.gemini');

  // Create a clean workspace directory for the agent
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  const wsGemini = join(WORKSPACE_DIR, '.gemini');
  mkdirSync(wsGemini, { recursive: true });

  // Pre-trust the workspace directory
  const trustFile = join(userGemini, 'trustedFolders.json');
  try {
    mkdirSync(userGemini, { recursive: true });
    const existing = (() => { try { return JSON.parse(readFileSync(trustFile, 'utf-8')); } catch { return {}; } })();
    existing[WORKSPACE_DIR] = 'TRUST_FOLDER';
    writeFileSync(trustFile, JSON.stringify(existing, null, 2));
    log(`Trusted folder: ${WORKSPACE_DIR}`);
  } catch (err) {
    logError(`Failed to write trust config: ${err.message}`);
  }

  // Disable interactive prompts via settings
  const settings = {
    security: {
      folderTrust: { enabled: false },
      auth: { selectedType: 'gemini-api-key', useExternal: true },
    },
    general: { sessionRetention: { enabled: true, maxAge: '30d', warningAcknowledged: true } },
    experimental: { enableAgents: true },
  };
  for (const dir of [userGemini, wsGemini]) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
    } catch { /* best effort */ }
  }

  // Change to workspace so the agent runs there
  process.chdir(WORKSPACE_DIR);
  log(`Working directory: ${WORKSPACE_DIR}`);
}

async function main() {
  log('=== Forever Bridge starting ===');

  setupWorkspace();

  const projectId = await getProjectId();
  PUBSUB_SUBSCRIPTION = `projects/${projectId}/subscriptions/gcli-agent-sub`;
  log(`Project: ${projectId}`);
  log(`Subscription: ${PUBSUB_SUBSCRIPTION}`);

  const healthServer = startHealthServer();

  log('Starting Gemini CLI...');
  await startAgent();
  log(`Agent ready at ${A2A_URL}`);

  log('Polling Pub/Sub for Chat messages...');
  pollLoop();
  pollUnsolicitedResponses();

  const shutdown = () => {
    log('Shutting down...');
    polling = false;
    stopAgent();
    healthServer.close();
    setTimeout(() => process.exit(0), 2000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  logError(`Fatal: ${err.message}`);
  process.exit(1);
});
