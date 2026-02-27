#!/usr/bin/env node
// Event-driven headless E2E: react to each response immediately.
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const BUNDLE = path.resolve(__dirname, 'bundle/gemini.js');
let id = 0;
const rpc = (m, p) => JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) + '\n';

const child = spawn(process.execPath, [BUNDLE, '--experimental-acp'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, A2A_SERVER: 'true' },
});
child.stderr.on('data', () => { }); // discard stderr

const rl = readline.createInterface({ input: child.stdout });
let sessionId = null;
let phase = 'init'; // init -> session -> mode -> prompt -> collecting
const toolCalls = [];

rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    // Track tool_calls in ALL session/update notifications
    if (msg.method === 'session/update') {
        const u = msg.params?.update;
        if (u?.sessionUpdate === 'tool_call') {
            const hasRaw = 'rawInput' in u && u.rawInput !== undefined && u.rawInput !== null;
            toolCalls.push({ id: u.toolCallId, title: u.title, status: u.status, hasRaw });
            console.log(`[TOOL] ${u.toolCallId} "${u.title}" status=${u.status} hasRawInput=${hasRaw}`);
            if (hasRaw) console.log(`  rawInput=${JSON.stringify(u.rawInput).slice(0, 150)}`);
        }
    }

    // State machine
    if (phase === 'init' && msg.id && msg.result?.protocolVersion !== undefined) {
        console.log('[OK] initialize');
        phase = 'session';
        child.stdin.write(rpc('session/new', { cwd: process.cwd(), mcpServers: [] }));
    }
    else if (phase === 'session' && msg.id && msg.result?.sessionId) {
        sessionId = msg.result.sessionId;
        console.log(`[OK] session: ${sessionId}`);
        phase = 'mode';
        child.stdin.write(rpc('session/set_mode', { sessionId, modeId: 'yolo' }));
    }
    else if (phase === 'mode' && msg.id && !msg.error) {
        console.log('[OK] yolo mode set');
        phase = 'prompt';
        child.stdin.write(rpc('session/prompt', {
            sessionId,
            prompt: [{ type: 'text', text: '현재 프로젝트의 package.json을 분석하고 보안 취약점이 있는 패키지가 있는지 확인해줘' }],
        }));
        console.log('[OK] prompt sent, waiting for tool calls...');
        phase = 'collecting';
    }
    else if (phase === 'mode' && msg.id && msg.error) {
        console.log(`[ERR] set_mode failed: ${JSON.stringify(msg.error)}`);
        // Try prompt anyway
        phase = 'prompt';
        child.stdin.write(rpc('session/prompt', {
            sessionId,
            prompt: [{ type: 'text', text: '현재 프로젝트의 package.json을 분석하고 보안 취약점이 있는 패키지가 있는지 확인해줘' }],
        }));
        phase = 'collecting';
    }

    // Prompt complete
    if (phase === 'collecting' && msg.id && (msg.result?.stopReason || msg.error)) {
        console.log(`[OK] prompt done: ${msg.result?.stopReason || JSON.stringify(msg.error)}`);
        report();
    }
});

function report() {
    console.log('\n===== RESULTS =====');
    const withRaw = toolCalls.filter(t => t.hasRaw);
    const withoutRaw = toolCalls.filter(t => !t.hasRaw);
    console.log(`Total tool_calls: ${toolCalls.length}`);
    console.log(`WITH rawInput: ${withRaw.length}`);
    console.log(`WITHOUT rawInput: ${withoutRaw.length}`);
    if (withRaw.length) { console.log('✅ rawInput IS present!'); withRaw.forEach(t => console.log(`  ${t.id}`)); }
    if (withoutRaw.length) { console.log('❌ rawInput MISSING'); withoutRaw.forEach(t => console.log(`  ${t.id} "${t.title}"`)); }
    if (!toolCalls.length) console.log('⚠️  No tool calls detected');
    child.kill();
    process.exit(withoutRaw.length > 0 ? 1 : 0);
}

// Timeout after 120s
setTimeout(() => { console.log('[TIMEOUT] 120s reached'); report(); }, 120000);

// Start
child.stdin.write(rpc('initialize', {
    clientInfo: { name: 'test', version: '1' },
    capabilities: {}, protocolVersion: 1
}));
console.log('[START] initialize sent, waiting...');
