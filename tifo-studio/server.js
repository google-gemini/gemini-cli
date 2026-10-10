#!/usr/bin/env node
// Zero-dependency local server for Tifo Studio.
//  • serves ./public
//  • stores projects as JSON in ./projects
//  • local text-to-speech: Piper neural voices (./tts), macOS `say`, Windows SAPI, espeak
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.join(__dirname, 'public');
const PROJECTS = path.join(__dirname, 'projects');
const TTS_DIR = process.env.TIFO_TTS_DIR || path.join(__dirname, 'tts');
const MAX_BODY = 500 * 1024 * 1024;
const IS_WIN = process.platform === 'win32';
fs.mkdirSync(PROJECTS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const safeName = (n) => String(n).replace(/[^a-z0-9_\- ]/gi, '').trim().slice(0, 80);

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readBody(req, limit = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Body too large'), { code: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ---------- text-to-speech ----------

function which(cmd) {
  const exts = IS_WIN ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch { /* not here */ }
    }
  }
  return null;
}

function piperBin() {
  const local = path.join(TTS_DIR, 'piper', IS_WIN ? 'piper.exe' : 'piper');
  for (const p of [process.env.PIPER_BIN, local]) if (p && fs.existsSync(p)) return p;
  return which('piper');
}

function run(cmd, args, { input, timeout = 180000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let err = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stderr.on('data', (d) => (err += d));
    child.stdout.on('data', () => {});
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with ${code}: ${err.slice(-400)}`));
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

const execText = (cmd, args) => new Promise((res) => execFile(cmd, args, { timeout: 15000, windowsHide: true }, (e, out) => res(e ? '' : String(out))));

let voiceCache = null;
async function listVoices() {
  if (voiceCache) return voiceCache;
  const voices = [];
  const pb = piperBin();
  const vdir = path.join(TTS_DIR, 'voices');
  if (pb && fs.existsSync(vdir)) {
    for (const f of fs.readdirSync(vdir).filter((f) => f.endsWith('.onnx')).sort()) {
      if (!fs.existsSync(path.join(vdir, f + '.json'))) continue;
      const base = f.replace(/\.onnx$/, '');
      const m = base.match(/^([a-z]{2})[_-]([a-z]{2})-(.+?)-(x_low|low|medium|high)$/i);
      const name = m ? `${m[3][0].toUpperCase()}${m[3].slice(1)} (${m[1]}-${m[2].toUpperCase()}, ${m[4]})` : base;
      voices.push({ id: `piper:${f}`, name: `${name} · Piper neural`, engine: 'piper' });
    }
  }
  if (process.platform === 'darwin' && which('say')) {
    const out = await execText('say', ['-v', '?']);
    const pref = ['Daniel', 'Arthur', 'Oliver', 'Serena', 'Kate', 'Alex', 'Samantha'];
    const found = [];
    for (const line of out.split('\n')) {
      const m = line.match(/^(.+?)\s{2,}([a-z]{2}[_-][A-Z]{2})\s/);
      if (m && m[2].startsWith('en')) found.push({ id: `say:${m[1].trim()}`, name: `${m[1].trim()} (${m[2]}) · macOS`, engine: 'say' });
    }
    found.sort((a, b) => ((pref.indexOf(a.id.slice(4)) + 1 || 99) - (pref.indexOf(b.id.slice(4)) + 1 || 99)));
    voices.push(...found);
  }
  if (IS_WIN) {
    const out = await execText('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture }']);
    for (const line of out.split(/\r?\n/)) {
      const [name, culture] = line.trim().split('|');
      if (name) voices.push({ id: `sapi:${name}`, name: `${name} (${culture}) · Windows`, engine: 'sapi' });
    }
  }
  const espeak = which('espeak-ng') || which('espeak');
  if (espeak) {
    voices.push({ id: 'espeak:en-gb', name: 'English UK · eSpeak (robotic)', engine: 'espeak' });
    voices.push({ id: 'espeak:en-us', name: 'English US · eSpeak (robotic)', engine: 'espeak' });
  }
  voiceCache = voices;
  return voices;
}

async function synthesize(voiceId, text, rate = 1) {
  const voices = await listVoices();
  const voice = voices.find((v) => v.id === voiceId) || voices[0];
  if (!voice) throw Object.assign(new Error('No text-to-speech voice installed. Run the installer to add the Piper voice.'), { code: 501 });
  rate = Math.min(1.6, Math.max(0.6, Number(rate) || 1));
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 20000);
  if (!text) throw Object.assign(new Error('No text'), { code: 400 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tifo-tts-'));
  const out = path.join(tmp, 'out.wav');
  const txt = path.join(tmp, 'in.txt');
  fs.writeFileSync(txt, text, 'utf8');
  try {
    const [engine, name] = [voice.engine, voice.id.slice(voice.id.indexOf(':') + 1)];
    if (engine === 'piper') {
      const bin = piperBin();
      const model = path.join(TTS_DIR, 'voices', path.basename(name));
      await run(bin, ['--model', model, '--output_file', out, '--length_scale', (1 / rate).toFixed(3), '--sentence_silence', '0.25'], { input: text + '\n', cwd: path.dirname(bin) });
    } else if (engine === 'say') {
      await run('say', ['-v', name, '-r', String(Math.round(180 * rate)), '-o', out, '--file-format=WAVE', '--data-format=LEI16@22050', '-f', txt]);
    } else if (engine === 'sapi') {
      const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
      const ps1 = path.join(tmp, 'tts.ps1');
      fs.writeFileSync(ps1, [
        'Add-Type -AssemblyName System.Speech',
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        `$s.SelectVoice(${q(name)})`,
        `$s.Rate = ${Math.round((rate - 1) * 10)}`,
        `$s.SetOutputToWaveFile(${q(out)})`,
        `$s.Speak([IO.File]::ReadAllText(${q(txt)}))`,
        '$s.Dispose()',
      ].join('\r\n'), 'utf8');
      await run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1]);
    } else if (engine === 'espeak') {
      await run(which('espeak-ng') || which('espeak'), ['-v', name, '-s', String(Math.round(165 * rate)), '-w', out, '-f', txt]);
    }
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- API ----------

async function api(req, res, p) {
  if (p === '/api/info' && req.method === 'GET') {
    const voices = await listVoices();
    return send(res, 200, JSON.stringify({ app: 'tifo-studio', voices: voices.length, piper: !!piperBin() }), TYPES['.json']);
  }
  if (p === '/api/tts/voices' && req.method === 'GET') {
    if (new URL(req.url, 'http://x').searchParams.has('refresh')) voiceCache = null;
    return send(res, 200, JSON.stringify(await listVoices()), TYPES['.json']);
  }
  if (p === '/api/tts' && req.method === 'POST') {
    const { voice, text, rate } = JSON.parse(await readBody(req, 1e6));
    const wav = await synthesize(voice, text, rate);
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
    return res.end(wav);
  }
  if (p === '/api/projects' && req.method === 'GET') {
    const items = fs.readdirSync(PROJECTS)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const st = fs.statSync(path.join(PROJECTS, f));
        return { name: f.slice(0, -5), mtime: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return send(res, 200, JSON.stringify(items), TYPES['.json']);
  }
  const m = p.match(/^\/api\/projects\/(.+)$/);
  if (!m) return send(res, 404, 'Not found');
  const name = safeName(decodeURIComponent(m[1]));
  if (!name) return send(res, 400, 'Bad name');
  const file = path.join(PROJECTS, name + '.json');

  if (req.method === 'GET') {
    if (!fs.existsSync(file)) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method === 'DELETE') {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return send(res, 204, '');
  }
  if (req.method === 'PUT') {
    const body = await readBody(req);
    try {
      JSON.parse(body);
    } catch {
      return send(res, 400, 'Invalid JSON');
    }
    fs.writeFileSync(file + '.tmp', body);
    fs.renameSync(file + '.tmp', file);
    return send(res, 200, JSON.stringify({ ok: true, name }), TYPES['.json']);
  }
  return send(res, 405, 'Method not allowed');
}

// Only answer requests addressed to this machine (blocks DNS-rebinding attacks),
// and only accept writes from our own pages.
function allowed(req) {
  if (HOST === '0.0.0.0' || HOST === '::') return true;
  const host = String(req.headers.host || '');
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) return false;
  const origin = req.headers.origin;
  if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!allowed(req)) return send(res, 403, 'Forbidden');
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) return await api(req, res, p);
    const file = path.normalize(path.join(ROOT, p === '/' ? 'index.html' : p));
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'Not found');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
  } catch (err) {
    if (!res.headersSent) send(res, err.code >= 400 && err.code < 600 ? err.code : 500, String(err.message || err));
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  Port ${PORT} is busy — Tifo Studio is probably already running at http://localhost:${PORT}\n`);
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, HOST, async () => {
  const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n  ⚽ Tifo Studio running at  ${url}\n`);
  console.log(`  Projects are saved in ${PROJECTS}`);
  const voices = await listVoices();
  console.log(`  Voices: ${voices.length ? voices.slice(0, 3).map((v) => v.name).join(', ') + (voices.length > 3 ? ` (+${voices.length - 3} more)` : '') : 'none (record with your mic, or run the installer to add Piper)'}\n`);
  if (process.argv.includes('--open')) {
    const opener = IS_WIN ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try {
      const child = spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' });
      child.on('error', () => console.log(`  Open ${url} in your browser.`));
      child.unref();
    } catch { /* no browser opener */ }
  }
});
