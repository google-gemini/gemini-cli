// Tifo Studio editor UI.
import * as M from './model.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import {
  exportPro, exportRealtime, supportsWebCodecs, snapshotPNG, buildSRT, projectDuration, RESOLUTIONS,
} from './exporter.js';
import { stylizeImage } from './image.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const r2 = (v) => Math.round(v * 100) / 100;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

const canvas = $('#stage');
const R = new Renderer(canvas);
const A = new AudioEngine();
R.onImageLoad = () => draw();

const S = {
  project: null, si: 0, t: 0, sel: [], tool: 'select', drag: null, temp: null,
  playing: null, previewCam: true, undo: [], redo: [], pending: null, recording: false,
  exporting: null, clip: null, voices: [], busy: '',
};
const scene = () => S.project.scenes[S.si];
const findObj = (id) => scene().objects.find((o) => o.id === id);
const prevOf = (si) => (si > 0 ? { scene: S.project.scenes[si - 1], t: S.project.scenes[si - 1].duration } : null);

// ---------- undo / autosave ----------

function snapshot() {
  const { assets, ...rest } = S.project;
  return JSON.stringify({ p: rest, si: S.si });
}
function pushUndo(snap = snapshot()) {
  S.undo.push(snap);
  if (S.undo.length > 150) S.undo.shift();
  S.redo = [];
}
function restore(snap) {
  const { p, si } = JSON.parse(snap);
  p.assets = S.project.assets;
  S.project = p;
  S.si = Math.min(si, p.scenes.length - 1);
  S.t = Math.min(S.t, scene().duration);
  S.sel = [];
  refreshAll();
  autosave();
}
function undo() {
  if (!S.undo.length) return;
  S.redo.push(snapshot());
  restore(S.undo.pop());
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(snapshot());
  restore(S.redo.pop());
}

let saveTimer = 0;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem('tifo-autosave', JSON.stringify(S.project));
    } catch {
      try {
        localStorage.setItem('tifo-autosave', JSON.stringify({ ...S.project, assets: {} }));
      } catch { /* storage unavailable */ }
    }
  }, 600);
}

function pruneAssets(p) {
  const used = new Set([p.music]);
  for (const s of p.scenes) {
    used.add(s.audio).add(s.image).add(s.image2);
    for (const o of s.objects) if (o.photo) used.add(o.photo);
  }
  for (const k of Object.keys(p.assets)) if (!used.has(k)) delete p.assets[k];
  return p;
}

function setProject(p) {
  stop();
  M.migrateProject(p);
  S.project = p;
  S.si = Math.min(1, p.scenes.length - 1);
  S.t = 0;
  S.sel = [];
  S.undo = [];
  S.redo = [];
  A.preload(p).then(() => renderProps());
  refreshAll();
  autosave();
}

function changed() {
  autosave();
  draw();
}
function changedAll() {
  autosave();
  refreshAll();
}

// ---------- drawing ----------

function draw() {
  if (S.exporting === 'realtime') return;
  R.draw(S.project, scene(), S.t, {
    editor: !S.playing,
    sel: S.sel,
    useCamera: S.previewCam || !!S.playing,
    temp: S.temp,
    showCaptions: S.project.showCaptions,
    prev: S.playing ? prevOf(S.si) : null,
  });
}

function refreshAll() {
  renderScenes();
  renderProps();
  updateTimeline();
  updateTools();
  draw();
}

function status(msg) {
  S.busy = msg || '';
  $('#status').textContent = S.busy;
  $('#status').hidden = !S.busy;
}

// ---------- scenes panel ----------

const KIND_LABEL = { card: 'CARD', chart: 'CHART', pitch: 'PITCH' };
function renderScenes() {
  const total = projectDuration(S.project);
  $('#sceneList').innerHTML = S.project.scenes
    .map((sc, i) => `<li class="${i === S.si ? 'active' : ''}" data-i="${i}">
      <span class="idx">${i + 1}</span><span class="nm">${esc(sc.name)}</span>
      <span class="kind">${KIND_LABEL[sc.kind] || 'PITCH'}</span>
      <span class="dur">${sc.duration.toFixed(1)}s${sc.audio ? ' · 🎙 voice' : ''}${sc.narration && !sc.audio ? ' · script' : ''}${sc.transition !== 'cut' ? ` · ${sc.transition}` : ''}</span></li>`)
    .join('');
  $('#totalTime').textContent = `${S.project.scenes.length} · ${fmtTime(total)}`;
}

function gotoScene(i) {
  stop();
  S.si = M.clamp(i, 0, S.project.scenes.length - 1);
  S.t = 0;
  S.sel = [];
  refreshAll();
}

$('#sceneList').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) gotoScene(+li.dataset.i);
});

function insertScene(sc) {
  pushUndo();
  M.migrateProject({ scenes: [sc] });
  S.project.scenes.splice(S.si + 1, 0, sc);
  gotoScene(S.si + 1);
  autosave();
}
$('#scAddPitch').onclick = () => insertScene(M.newPitchScene(`Scene ${S.project.scenes.length + 1}`));
$('#scAddCard').onclick = () => insertScene(M.newCardScene('Card'));
$('#scAddChart').onclick = () => insertScene(M.newChartScene('Chart'));
$('#scDup').onclick = () => {
  const c = structuredClone(scene());
  c.id = M.uid();
  c.name += ' copy';
  insertScene(c);
};
$('#scCont').onclick = () => {
  if (scene().kind !== 'pitch') return alert('“Continue” works on pitch scenes.');
  insertScene(M.continueScene(scene()));
};
function moveScene(d) {
  const j = S.si + d;
  const arr = S.project.scenes;
  if (j < 0 || j >= arr.length) return;
  pushUndo();
  [arr[S.si], arr[j]] = [arr[j], arr[S.si]];
  S.si = j;
  changedAll();
}
$('#scUp').onclick = () => moveScene(-1);
$('#scDown').onclick = () => moveScene(1);
$('#scDel').onclick = () => {
  if (S.project.scenes.length < 2) return;
  if (!confirm(`Delete scene “${scene().name}”?`)) return;
  pushUndo();
  S.project.scenes.splice(S.si, 1);
  gotoScene(Math.min(S.si, S.project.scenes.length - 1));
  autosave();
};

// ---------- toolbar ----------

$('#formSel').innerHTML = Object.keys(M.FORMATIONS).map((f) => `<option>${f}</option>`).join('');

function setTool(t) {
  S.tool = t;
  updateTools();
}
function updateTools() {
  $$('#tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === S.tool));
  canvas.classList.toggle('select', S.tool === 'select');
  $('.dot.home').style.background = S.project.teams.home.color;
  $('.dot.away').style.background = S.project.teams.away.color;
  $('#formTeam').options[0].text = S.project.teams.home.name;
  $('#formTeam').options[1].text = S.project.teams.away.name;
}
$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setTool(b.dataset.tool);
});

$('#formInsert').onclick = () => {
  const sc = scene();
  if (sc.kind !== 'pitch') return alert('Select a pitch scene first.');
  const team = $('#formTeam').value;
  const f = M.FORMATIONS[$('#formSel').value];
  const removed = new Set(sc.objects.filter((o) => o.type === 'player' && o.team === team).map((o) => o.id));
  if (removed.size && !confirm(`Replace the ${removed.size} existing ${S.project.teams[team].name} players?`)) return;
  pushUndo();
  sc.objects = sc.objects.filter((o) => !removed.has(o.id) && !refsGone(o, removed));
  for (const [x, y, n] of f) {
    sc.objects.push(M.makePlayer(team, n, team === 'home' ? x : M.PITCH.w - x, team === 'home' ? y : M.PITCH.h - y));
  }
  S.sel = [];
  changedAll();
};

function refsGone(o, gone) {
  if (o.type === 'chain') return o.ids.some((i) => gone.has(i));
  if (o.type === 'shadow') return gone.has(o.pid) || gone.has(o.bid);
  if (o.type === 'spot' && o.pid) return gone.has(o.pid);
  return false;
}

$('#previewCam').onchange = (e) => {
  S.previewCam = e.target.checked;
  draw();
};
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;

// ---------- timeline ----------

function updateTimeline() {
  const sc = scene();
  const scrub = $('#scrub');
  scrub.max = sc.duration;
  scrub.value = S.t;
  $('#timeLabel').textContent = `${S.t.toFixed(2)} / ${sc.duration.toFixed(2)}s`;
  $('#btnPlay').textContent = S.playing && !S.playing.all ? '❚❚' : '▶';
  $('#btnPlayAll').textContent = S.playing?.all ? '❚❚ All' : '▶▶ All';
  if (S.playing) return;
  const o = S.sel.length === 1 && findObj(S.sel[0]);
  let marks = [];
  if (o) {
    if (o.kf) marks = o.kf.map((k) => ({ t: k.t, cls: 'kf', title: 'keyframe' }));
    marks.push({ t: o.in || 0, cls: 'in', title: 'appears' });
    if (o.out != null) marks.push({ t: o.out, cls: 'out', title: 'disappears' });
  } else if (sc.kind === 'pitch') {
    marks = sc.camera.map((k) => ({ t: k.t, cls: 'cam', title: 'camera keyframe' }));
  }
  $('#kfTrack').innerHTML = marks
    .map((m) => `<i class="${m.cls}" title="${m.title} @ ${m.t.toFixed(2)}s" style="left:${(m.t / sc.duration) * 100}%" data-t="${m.t}"></i>`)
    .join('');
}

$('#kfTrack').addEventListener('click', (e) => {
  const t = e.target.dataset?.t;
  if (t == null) return;
  stop();
  S.t = +t;
  updateTimeline();
  renderCamSliders();
  draw();
});
$('#scrub').addEventListener('input', (e) => {
  stop();
  S.t = parseFloat(e.target.value);
  updateTimeline();
  renderCamSliders();
  draw();
});

function play(all = false, { mute = false } = {}) {
  if (S.playing) return stop();
  if (S.t >= scene().duration - 0.02) S.t = 0;
  const startScene = S.si;
  const startT = S.t;
  if (!mute) A.play(S.project, startScene, startT, all);
  const t0 = performance.now();
  S.playing = { all, raf: 0 };
  S.temp = null;
  const tick = () => {
    if (!S.playing) return;
    let el = (performance.now() - t0) / 1000 + startT;
    let si = startScene;
    const scenes = S.project.scenes;
    if (all) {
      while (si < scenes.length && el >= scenes[si].duration) {
        el -= scenes[si].duration;
        si++;
      }
      if (si >= scenes.length) {
        S.si = scenes.length - 1;
        S.t = scene().duration;
        return stop();
      }
    } else if (el >= scenes[si].duration) {
      S.t = scenes[si].duration;
      return stop();
    }
    if (si !== S.si) {
      S.si = si;
      S.sel = [];
      renderScenes();
      renderProps();
    }
    S.t = el;
    updateTimeline();
    draw();
    S.playing.raf = requestAnimationFrame(tick);
  };
  updateTimeline();
  tick();
}

function stop() {
  if (!S.playing) return;
  cancelAnimationFrame(S.playing.raf);
  S.playing = null;
  A.stop();
  window.speechSynthesis?.cancel();
  updateTimeline();
  renderCamSliders();
  draw();
}

$('#btnPlay').onclick = () => play(false);
$('#btnPlayAll').onclick = () => play(true);

function keyAtPlayhead() {
  const t = M.snapT(S.t);
  const objs = S.sel.map(findObj).filter((o) => o?.kf);
  if (!objs.length) return alert('Select a player or ball first.');
  pushUndo();
  for (const o of objs) M.setKF(o.kf, t, M.sampleKF(o.kf, t));
  updateTimeline();
  changed();
}
$('#btnKey').onclick = keyAtPlayhead;
$('#btnDelKey').onclick = () => {
  const snap = snapshot();
  let did = false;
  const objs = S.sel.map(findObj).filter((o) => o?.kf);
  if (objs.length) for (const o of objs) did = M.removeKF(o.kf, S.t) || did;
  else if (scene().kind === 'pitch') did = M.removeKF(scene().camera, S.t);
  if (did) {
    pushUndo(snap);
    updateTimeline();
    renderProps();
    changed();
  }
};
$('#btnCamReset').onclick = () => setCam({ cx: M.PITCH.w / 2, cy: M.PITCH.h / 2, zoom: 1, tilt: 0, rot: 0 });

// ---------- camera ----------

function camHere() {
  return M.sampleKF(scene().camera, S.t, M.CAM_KEYS);
}
function setCam(values, undoable = true) {
  const sc = scene();
  if (sc.kind !== 'pitch') return;
  if (undoable) pushUndo();
  M.setKF(sc.camera, S.t, { ...camHere(), ...values });
  updateTimeline();
  renderProps();
  changed();
}

const CAM_PRESETS = {
  'Top-down': { tilt: 0, rot: 0 },
  Broadcast: { tilt: 38, rot: 0 },
  Dramatic: { tilt: 55, rot: 0 },
  'From left goal': { tilt: 50, rot: 90 },
  'From right goal': { tilt: 50, rot: -90 },
};

function renderCamSliders() {
  const box = $('#camSliders');
  if (!box || scene().kind !== 'pitch') return;
  const c = camHere();
  for (const inp of box.querySelectorAll('input[data-cam]')) {
    inp.value = c[inp.dataset.cam];
    inp.nextElementSibling.textContent = inp.dataset.cam === 'zoom' ? `${c.zoom.toFixed(2)}×` : `${Math.round(c[inp.dataset.cam])}°`;
  }
}

// ---------- canvas interaction ----------

function evScreen(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
}
function evWorld(e) {
  const [X, Y] = evScreen(e);
  return R.viewFor(scene(), S.t, S.previewCam).unproject(X, Y);
}

function nextNum(team) {
  const used = new Set(scene().objects.filter((o) => o.team === team).map((o) => +o.num));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function selectOnly(ids) {
  S.sel = ids;
  renderProps();
  updateTimeline();
  draw();
}

function addObject(o) {
  pushUndo();
  scene().objects.push(o);
  S.sel = [o.id];
  changedAll();
}

canvas.addEventListener('pointerdown', (e) => {
  const sc = scene();
  if (sc.kind !== 'pitch' || S.exporting) return;
  stop();
  const [X, Y] = evScreen(e);
  const w = evWorld(e);
  canvas.setPointerCapture(e.pointerId);
  const t = M.snapT(S.t);
  const tin = t > 0.01 ? t : 0;
  const tool = S.tool;
  const hitAt = () => R.hitTest(S.project, sc, t, X, Y, S.previewCam);

  if (tool === 'select') {
    if (S.sel.length === 1) {
      const o = findObj(S.sel[0]);
      const h = o && R.handleAt(sc, t, o, X, Y, S.previewCam);
      if (h) {
        S.drag = { kind: 'handle', h: { ...h, id: o.id }, snap: snapshot(), moved: false };
        return;
      }
    }
    const o = hitAt();
    if (!o || !w) return selectOnly([]);
    if (e.shiftKey) S.sel = S.sel.includes(o.id) ? S.sel.filter((i) => i !== o.id) : [...S.sel, o.id];
    else if (!S.sel.includes(o.id)) S.sel = [o.id];
    S.drag = {
      kind: 'move', start: w, snap: snapshot(), moved: false,
      orig: S.sel.map((id) => {
        const x = findObj(id);
        return { id, pos: x.kf ? M.sampleKF(x.kf, t) : null, o: structuredClone(x) };
      }),
    };
    return selectOnly(S.sel);
  }
  if (!w) return;
  if (tool === 'home' || tool === 'away') {
    const o = M.makePlayer(tool, nextNum(tool), w.x, w.y);
    o.in = tin;
    return addObject(o);
  }
  if (tool === 'ball') {
    const o = M.makeBall(w.x, w.y);
    o.in = tin;
    return addObject(o);
  }
  if (tool === 'text') {
    const txt = prompt('Label text:', 'Half-space');
    if (!txt) return;
    return addObject(M.makeText(txt, w.x, w.y, tin, 2.6));
  }
  if (tool === 'shadow') {
    const p = hitAt();
    if (p?.type !== 'player') return alert('Click on a player to cast their cover shadow (away from the ball).');
    const ball = M.firstBall(sc);
    if (!ball) return alert('Add a ball first — the shadow points away from it.');
    return addObject(M.makeShadow(p.id, ball.id, tin));
  }
  if (tool === 'spot') {
    const p = hitAt();
    if (p?.type === 'player') {
      const q = M.sampleKF(p.kf, t);
      return addObject(M.makeSpot(q.x, q.y, p.id, tin));
    }
    return addObject(M.makeSpot(w.x, w.y, null, tin));
  }
  if (['pass', 'run', 'dribble', 'line', 'measure'].includes(tool)) {
    S.temp = M.makeArrow(tool, w.x, w.y, w.x, w.y, tin);
    S.drag = { kind: 'create' };
    return draw();
  }
  if (tool === 'zone' || tool === 'ellipse') {
    S.temp = M.makeZone(tool === 'zone' ? 'rect' : 'ellipse', w.x, w.y, 0, 0, tin);
    S.drag = { kind: 'create', ox: w.x, oy: w.y };
    return draw();
  }
  if (tool === 'camera') {
    S.temp = { type: 'camrect', x: w.x, y: w.y, w: 0, h: 0 };
    S.drag = { kind: 'create', ox: w.x, oy: w.y };
    return draw();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const d = S.drag;
  if (!d) return;
  const w = evWorld(e);
  if (!w) return;
  const t = M.snapT(S.t);
  if (d.kind === 'move') {
    const dx = w.x - d.start.x;
    const dy = w.y - d.start.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 0.2) return;
      pushUndo(d.snap);
      d.moved = true;
    }
    for (const it of d.orig) {
      const o = findObj(it.id);
      if (!o) continue;
      if (o.kf) M.setKF(o.kf, t, { x: it.pos.x + dx, y: it.pos.y + dy });
      else if (o.type === 'arrow') Object.assign(o, { x1: it.o.x1 + dx, y1: it.o.y1 + dy, x2: it.o.x2 + dx, y2: it.o.y2 + dy });
      else if (o.type === 'zone' || o.type === 'text' || (o.type === 'spot' && !o.pid)) Object.assign(o, { x: it.o.x + dx, y: it.o.y + dy });
    }
    draw();
  } else if (d.kind === 'handle') {
    const o = findObj(d.h.id);
    if (!d.moved) {
      pushUndo(d.snap);
      d.moved = true;
    }
    if (d.h.k === 'p1') Object.assign(o, { x1: w.x, y1: w.y });
    else if (d.h.k === 'p2') Object.assign(o, { x2: w.x, y2: w.y });
    else if (d.h.k === 'bend') {
      const { nx, ny } = M.arrowCtrl(o);
      o.bend = r2(((w.x - (o.x1 + o.x2) / 2) * nx + (w.y - (o.y1 + o.y2) / 2) * ny) * 2);
    } else if (d.h.k === 'size') Object.assign(o, { w: Math.max(1, w.x - o.x), h: Math.max(1, w.y - o.y) });
    else if (d.h.k === 'radius') o.r = r2(Math.max(1, Math.hypot(w.x - o.x, w.y - o.y)));
    draw();
  } else if (d.kind === 'create') {
    const o = S.temp;
    if (o.type === 'arrow') Object.assign(o, { x2: w.x, y2: w.y });
    else Object.assign(o, { x: Math.min(d.ox, w.x), y: Math.min(d.oy, w.y), w: Math.abs(w.x - d.ox), h: Math.abs(w.y - d.oy) });
    draw();
  }
});

canvas.addEventListener('pointerup', () => {
  const d = S.drag;
  S.drag = null;
  if (!d) return;
  const sc = scene();
  if (d.kind === 'create') {
    const o = S.temp;
    S.temp = null;
    if (o.type === 'camrect') {
      if (o.w > 2 && o.h > 2) {
        const v = R.viewSize(1);
        const zoom = r2(M.clamp(Math.min(v.w / o.w, v.h / o.h), 1, 5));
        setCam({ cx: r2(o.x + o.w / 2), cy: r2(o.y + o.h / 2), zoom });
      }
      return draw();
    }
    const ok = o.type === 'arrow' ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) > 1 : o.w > 1 && o.h > 1;
    if (ok) {
      pushUndo();
      sc.objects.push(o);
      S.sel = [o.id];
    }
    return changedAll();
  }
  if (d.moved) {
    autosave();
    renderProps();
    updateTimeline();
  }
});

// ---------- keyboard, clipboard ----------

const TOOL_KEYS = {
  v: 'select', h: 'home', a: 'away', b: 'ball', p: 'pass', r: 'run', d: 'dribble', l: 'line', m: 'measure',
  z: 'zone', e: 'ellipse', t: 'text', s: 'shadow', o: 'spot', c: 'camera',
};
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') {
    e.preventDefault();
    return e.shiftKey ? redo() : undo();
  }
  if (mod && k === 'y') return redo();
  if (mod && k === 'c') return copySel();
  if (mod && k === 'v') return paste();
  if (mod && k === 'd') {
    e.preventDefault();
    copySel();
    return paste();
  }
  if (mod && k === 'a' && scene().kind === 'pitch') {
    e.preventDefault();
    return selectOnly(scene().objects.map((o) => o.id));
  }
  if (mod || e.altKey) return;
  if (k === ' ') {
    e.preventDefault();
    return play(e.shiftKey);
  }
  if (k === 'delete' || k === 'backspace') return deleteSelected();
  if (k === 'escape') return selectOnly([]);
  if (k === 'k') return keyAtPlayhead();
  if (k === 'arrowleft' || k === 'arrowright') {
    e.preventDefault();
    stop();
    const step = e.shiftKey ? 1 : 1 / M.FPS;
    S.t = M.clamp(M.snapT(S.t + (k === 'arrowleft' ? -step : step)), 0, scene().duration);
    updateTimeline();
    renderCamSliders();
    return draw();
  }
  if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
});

function copySel() {
  const objs = S.sel.map(findObj).filter(Boolean);
  if (objs.length) S.clip = { from: scene().id, objs: structuredClone(objs) };
}

function paste() {
  if (!S.clip || scene().kind !== 'pitch') return;
  const sc = scene();
  const same = S.clip.from === sc.id;
  const off = same ? 2 : 0;
  const map = new Map(S.clip.objs.map((o) => [o.id, M.uid()]));
  const exists = (id) => map.has(id) || sc.objects.some((o) => o.id === id);
  const re = (id) => map.get(id) || id;
  const out = [];
  for (const src of S.clip.objs) {
    const o = structuredClone(src);
    o.id = map.get(src.id);
    if (o.kf) o.kf.forEach((k) => { k.x += off; k.y += off; });
    if (o.type === 'arrow') { o.x1 += off; o.y1 += off; o.x2 += off; o.y2 += off; }
    if (['zone', 'text'].includes(o.type) || (o.type === 'spot' && !o.pid)) { o.x += off; o.y += off; }
    if (o.type === 'chain') {
      o.ids = o.ids.filter(exists).map(re);
      if (o.ids.length < 2) continue;
    }
    if (o.type === 'shadow') {
      if (!exists(o.pid) || !exists(o.bid)) continue;
      o.pid = re(o.pid);
      o.bid = re(o.bid);
    }
    if (o.type === 'spot' && o.pid) {
      if (!exists(o.pid)) o.pid = null;
      else o.pid = re(o.pid);
    }
    if (o.in > sc.duration) o.in = 0;
    out.push(o);
  }
  if (!out.length) return;
  pushUndo();
  sc.objects.push(...out);
  S.sel = out.map((o) => o.id);
  changedAll();
}

function deleteSelected() {
  if (!S.sel.length) return;
  pushUndo();
  const sc = scene();
  const gone = new Set(S.sel);
  sc.objects = sc.objects.filter((o) => !gone.has(o.id));
  for (const o of sc.objects) if (o.type === 'chain') o.ids = o.ids.filter((i) => !gone.has(i));
  sc.objects = sc.objects.filter((o) => (o.type !== 'chain' || o.ids.length > 1) && !refsGone(o, gone));
  S.sel = [];
  changedAll();
}

// ---------- properties panel ----------

const field = (label, k, v, type = 'text', extra = '') =>
  `<label class="f"><span>${label}</span><input data-k="${k}" type="${type}" ${type === 'number' ? 'data-t="num" step="0.1"' : ''} value="${esc(v ?? '')}" ${extra}></label>`;
const range = (label, k, v, min, max, step) =>
  `<label class="f"><span>${label}</span><input data-k="${k}" data-t="num" type="range" min="${min}" max="${max}" step="${step}" value="${esc(v ?? '')}"></label>`;
const area = (label, k, v, rows = 4, extra = '') =>
  `<label class="f stack"><span>${label}</span><textarea data-k="${k}" rows="${rows}" ${extra}>${esc(v ?? '')}</textarea></label>`;
const select = (label, k, v, opts) =>
  `<label class="f"><span>${label}</span><select data-k="${k}">${opts.map(([val, txt]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${txt}</option>`).join('')}</select></label>`;
const check = (label, k, v) => `<label class="chk"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${label}</label>`;
const STYLE_OPTS = '<option value="none">Original</option><option value="poster" selected>Illustrated (poster)</option><option value="duotone">Duotone (team colour)</option>';
const imagePicker = (label, act, has, clearAct) => `<div class="f"><span>${label}</span><div class="imgpick">
  <select data-style-for="${act}">${STYLE_OPTS}</select>
  <input type="file" accept="image/*" data-act="${act}" hidden><button type="button" data-act="pick">${has ? 'Replace…' : 'Choose…'}</button>
  ${has ? `<button type="button" data-act="${clearAct}">✕</button>` : ''}</div></div>`;
const timing = (o) => `<div class="section"><h3>Timing</h3>
  ${field('Appears (s)', 'in', o.in ?? 0, 'number', 'min="0"')}
  ${field('Disappears', 'out', o.out ?? '', 'number', 'min="0" placeholder="end of scene"')}
  <div class="btnrow"><button data-act="inHere">In = playhead</button><button data-act="outHere">Out = playhead</button><button data-act="clearOut">Stay to end</button></div></div>`;
const playerOpts = () => [['', '— none (fixed position) —'], ...scene().objects.filter((o) => o.type === 'player')
  .map((o) => [o.id, `${esc(S.project.teams[o.team]?.name || o.team)} #${esc(o.num)}${o.name ? ' ' + esc(o.name) : ''}`])];

function renderProps() {
  const el = $('#props');
  el.className = 'right panel props';
  const sc = scene();
  const objs = S.sel.map(findObj).filter(Boolean);
  if (objs.length > 1) {
    const players = objs.filter((o) => o.type === 'player');
    el.innerHTML = `<h3>${objs.length} selected</h3>
      <p class="hint">Drag to move them together (creates keyframes for players at the playhead). Ctrl+C / Ctrl+V copies them to another scene.</p>
      <div class="btnrow">
        ${players.length > 1 ? '<button data-act="chain">Connect with line</button><button data-act="shape">Team shape</button>' : ''}
        <button data-act="keyAll">◆ Key all</button>
        <button data-act="deleteObj" class="danger">Delete</button></div>
      <p class="hint">“Connect with line” draws a line that follows the players (back four, pressing line…). “Team shape” fills the area between them. Shift-click players in the order the line should run.</p>`;
    return;
  }
  if (objs.length === 1) return renderObjProps(el, objs[0]);

  let html = `<h3>Scene ${S.si + 1}</h3>
    ${field('Name', 'name', sc.name)}
    ${select('Type', 'kind', sc.kind, [['pitch', 'Tactics pitch'], ['card', 'Title / illustration card'], ['chart', 'Stat chart']])}
    ${field('Duration (s)', 'duration', sc.duration, 'number', 'min="0.5"')}
    ${select('Transition in', 'transition', sc.transition, [['cut', 'Cut'], ['fade', 'Fade from black'], ['crossfade', 'Crossfade'], ['wipe', 'Tifo wipe']])}`;
  if (sc.kind === 'pitch') {
    const c = camHere();
    html += `<div class="section"><h3>Camera at ${S.t.toFixed(2)}s</h3>
      <div id="camSliders">
        <label class="f"><span>Zoom</span><span class="rng"><input type="range" data-cam="zoom" min="1" max="5" step="0.05" value="${c.zoom}"><b>${c.zoom.toFixed(2)}×</b></span></label>
        <label class="f"><span>Tilt (3D)</span><span class="rng"><input type="range" data-cam="tilt" min="0" max="65" step="1" value="${c.tilt}"><b>${Math.round(c.tilt)}°</b></span></label>
        <label class="f"><span>Rotate</span><span class="rng"><input type="range" data-cam="rot" min="-180" max="180" step="1" value="${c.rot}"><b>${Math.round(c.rot)}°</b></span></label>
      </div>
      <div class="btnrow">${Object.keys(CAM_PRESETS).map((n) => `<button data-act="camPreset" data-p="${n}">${n}</button>`).join('')}</div>
      <p class="hint">Changing these creates a camera keyframe at the playhead; the camera glides between keyframes. The 🎥 tool sets zoom and position by dragging a frame. Untick “Camera view” to edit on the flat full pitch.</p>
      <ul class="camlist">${sc.camera.map((k, i) => `<li><span>${k.t.toFixed(2)}s · ${k.zoom.toFixed(2)}× · tilt ${Math.round(k.tilt || 0)}° · rot ${Math.round(k.rot || 0)}°</span><button data-act="delCam" data-i="${i}" ${sc.camera.length < 2 ? 'disabled' : ''}>✕</button></li>`).join('')}</ul></div>`;
  }
  if (sc.kind === 'card') {
    html += `<div class="section"><h3>Card</h3>
      ${select('Layout', 'layout', sc.layout, [['title', 'Title'], ['chapter', 'Chapter (big number)'], ['quote', 'Quote'], ['lower', 'Image + lower third']])}
      ${sc.layout === 'chapter' || sc.layout === 'title' ? field(sc.layout === 'chapter' ? 'Number' : 'Kicker', 'kicker', sc.kicker, 'text', 'placeholder="01"') : ''}
      ${sc.layout === 'quote' ? area('Quote', 'title', sc.title, 3) : field('Title', 'title', sc.title)}
      ${field(sc.layout === 'quote' ? 'Attribution' : 'Subtitle', 'subtitle', sc.subtitle)}
      ${field('Background', 'bg', sc.bg, 'color')}
      ${imagePicker('Illustration', 'imageFile', !!sc.image, 'clearImage')}
      ${imagePicker('Foreground', 'image2File', !!sc.image2, 'clearImage2')}
      ${select('Motion', 'motion', sc.motion, [['in', 'Slow push in'], ['out', 'Slow pull out'], ['left', 'Pan left'], ['right', 'Pan right'], ['none', 'Still']])}
      <p class="hint">“Illustrated” turns a photo into flat colours with ink outlines. A transparent PNG as Foreground moves faster than the background: parallax depth like Tifo's illustrations.</p></div>`;
  }
  if (sc.kind === 'chart') {
    html += `<div class="section"><h3>Chart</h3>
      ${field('Title', 'title', sc.title)}
      ${area('Data', 'data', sc.data, 6, 'placeholder="Label, value — one per line. Start with * to highlight."')}
      ${field('Unit', 'unit', sc.unit, 'text', 'placeholder="% or m…"')}
      ${field('Source / note', 'subtitle', sc.subtitle)}
      ${field('Background', 'bg', sc.bg, 'color')}
      <p class="hint">One row per line: <code>Team, 7.2</code>. Put <code>*</code> before a label to highlight it in your team colour.</p></div>`;
  }
  const dur = sc.audio ? A.duration(sc.audio) : null;
  const voiceOpts = S.voices.map((v) => [v.id, esc(v.name)]);
  html += `<div class="section"><h3>Narration</h3>
    ${area('Script for this scene', 'narration', sc.narration, 5)}
    <div class="hint" id="wordHint">${words(sc.narration)} words ≈ ${(words(sc.narration) / 2.6).toFixed(1)}s spoken</div>
    <div class="btnrow"><button data-act="speak">🔊 Quick preview</button><button data-act="fitWords">Fit to script</button></div>
    ${area('On-screen caption', 'caption', sc.caption, 2)}
    <h3>Voiceover</h3>
    <div class="hint">${sc.audio ? `🎙 ${esc(sc.audioName || 'recording')} ${dur ? `(${dur.toFixed(1)}s)` : ''}` : 'No voiceover yet.'}</div>
    ${S.voices.length ? `<label class="f"><span>AI voice</span><select id="voiceSel">${voiceOpts.map(([v, n]) => `<option value="${v}" ${v === S.project.voice ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f"><span>Speed</span><select id="voiceRate">${[0.85, 0.92, 1, 1.08, 1.15].map((r) => `<option value="${r}" ${r === (S.project.voiceRate || 1) ? 'selected' : ''}>${r}×</option>`).join('')}</select></label>
      <div class="btnrow"><button data-act="tts" class="primary">🤖 Generate voice</button><button data-act="ttsAll">🤖 Voice all scenes</button></div>`
    : '<p class="hint">No local AI voices found. Run the installer to add the free Piper neural voice, or record with your mic.</p>'}
    <div class="btnrow">
      <button data-act="rec" class="${S.recording ? 'rec' : ''}">${S.recording ? '■ Stop recording' : '● Record mic'}</button>
      <span><input type="file" accept="audio/*" data-act="audioFile" hidden><button type="button" data-act="pick">Upload audio</button></span>
      ${sc.audio ? '<button data-act="fitAudio">Fit to audio</button><button data-act="clearAudio">Remove</button>' : ''}
    </div></div>`;
  el.innerHTML = html;
}

function renderObjProps(el, o) {
  const titles = { player: 'Player', ball: 'Ball', arrow: 'Arrow', zone: 'Zone', text: 'Label', chain: 'Connected line', shadow: 'Cover shadow', spot: 'Spotlight' };
  let html = `<h3>${titles[o.type]}</h3>`;
  if (o.type === 'player') {
    html += select('Team', 'team', o.team, [['home', esc(S.project.teams.home.name)], ['away', esc(S.project.teams.away.name)]]) +
      field('Number', 'num', o.num) + field('Name', 'name', o.name, 'text', 'placeholder="optional name tag"') +
      field('Colour', 'color', o.color || S.project.teams[o.team].color, 'color') +
      `<div class="btnrow">${check('Highlight (pulse)', 'highlight', o.highlight)} ${check('Movement trail', 'trail', o.trail)}<button data-act="resetColor">Team colour</button></div>` +
      imagePicker('Portrait', 'photoFile', !!o.photo, 'clearPhoto') +
      '<p class="hint">A portrait replaces the number on the disc, like Tifo’s illustrated heads.</p>';
  }
  if (o.kf) {
    html += `<div class="section"><h3>Motion</h3>
      <p class="hint">${o.kf.length} keyframe${o.kf.length > 1 ? 's' : ''}. Move the playhead, then drag the ${o.type} — a keyframe is created there. Press ◆ Key (K) first to hold a position until that moment.</p>
      <div class="btnrow"><button data-act="keyAll">◆ Key here</button><button data-act="clearMotion">Clear motion</button></div></div>`;
  }
  if (o.type === 'arrow') {
    html += select('Style', 'style', o.style, [['pass', 'Pass (dashed)'], ['run', 'Run (solid)'], ['dribble', 'Dribble (wavy)'], ['line', 'Line (no head)'], ['measure', 'Distance (metres)']]) +
      field('Colour', 'color', o.color || { pass: '#f4f1e6', run: '#f2c14e', dribble: '#f4f1e6', line: '#ffffff', measure: '#ffffff' }[o.style], 'color') +
      field('Curve', 'bend', o.bend, 'number') +
      field('Draw time (s)', 'dur', o.dur, 'number', 'min="0.05"') +
      '<p class="hint">Drag the round handles to move the ends or bend the arrow.</p>';
  }
  if (o.type === 'zone') {
    html += select('Shape', 'shape', o.shape, [['rect', 'Rectangle'], ['ellipse', 'Ellipse']]) + field('Colour', 'color', o.color, 'color');
  }
  if (o.type === 'text') {
    html += field('Text', 'text', o.text) + field('Size (m)', 'size', o.size, 'number', 'min="0.5"') + field('Colour', 'color', o.color, 'color') +
      `<div class="btnrow">${check('Painted on the pitch (flat)', 'flat', o.flat)}</div>`;
  }
  if (o.type === 'chain') html += field('Colour', 'color', o.color, 'color') + `<div class="btnrow">${check('Fill as team shape', 'fill', o.fill)}</div>`;
  if (o.type === 'shadow') {
    html += field('Length (m)', 'len', o.len, 'number', 'min="2"') + field('Width (°)', 'spread', o.spread, 'number', 'min="5" max="120"') +
      '<p class="hint">The area behind the player that the ball can’t be passed into. It follows the player and the ball automatically.</p>';
  }
  if (o.type === 'spot') {
    html += select('Follow', 'pid', o.pid || '', playerOpts()) + field('Radius (m)', 'r', o.r, 'number', 'min="1"') +
      range('Darkness', 'dim', o.dim ?? 0.55, 0.1, 0.9, 0.05) +
      '<p class="hint">Darkens everything except this circle, to focus the viewer. It can follow a player.</p>';
  }
  html += timing(o);
  html += `<div class="btnrow"><button data-act="deleteObj" class="danger">Delete</button></div>`;
  el.innerHTML = html;
}

function propTarget() {
  if (S.sel.length === 1) return findObj(S.sel[0]);
  return S.sel.length ? null : scene();
}

const props = $('#props');
props.addEventListener('focusin', () => (S.pending = snapshot()));
props.addEventListener('input', (e) => {
  const inp = e.target;
  if (inp.dataset.cam) {
    if (S.pending) {
      pushUndo(S.pending);
      S.pending = null;
    }
    const sc = scene();
    M.setKF(sc.camera, S.t, { ...camHere(), [inp.dataset.cam]: parseFloat(inp.value) });
    renderCamSliders();
    updateTimeline();
    return changed();
  }
  if (inp.id === 'voiceSel' || inp.id === 'voiceRate') {
    S.project[inp.id === 'voiceSel' ? 'voice' : 'voiceRate'] = inp.id === 'voiceSel' ? inp.value : +inp.value;
    return autosave();
  }
  const k = inp.dataset.k;
  const tgt = propTarget();
  if (!k || !tgt) return;
  let v;
  if (inp.type === 'checkbox') v = inp.checked;
  else if (inp.dataset.t === 'num') {
    v = inp.value === '' ? null : parseFloat(inp.value);
    if (v !== null && Number.isNaN(v)) return;
  } else v = inp.value;
  if (k === 'duration') v = Math.max(0.5, v ?? 0.5);
  if (k === 'pid') v = v || null;
  if (S.pending) {
    pushUndo(S.pending);
    S.pending = null;
  }
  const before = tgt[k];
  tgt[k] = v;
  if (tgt.type === 'spot' && k === 'pid') {
    // keep the spotlight where the player was (or jump to the newly followed player)
    const p = M.objPos(scene(), v || before, S.t);
    if (p) Object.assign(tgt, { x: r2(p.x), y: r2(p.y) });
  }
  if (k === 'duration') S.t = Math.min(S.t, v);
  if (k === 'name' || k === 'duration' || k === 'narration' || k === 'transition') renderScenes();
  if (k === 'narration') $('#wordHint').textContent = `${words(v)} words ≈ ${(words(v) / 2.6).toFixed(1)}s spoken`;
  updateTimeline();
  changed();
});
props.addEventListener('change', (e) => {
  if (e.target.tagName === 'SELECT' && e.target.dataset.k) {
    if (e.target.dataset.k === 'kind') M.migrateProject({ scenes: [scene()] });
    renderProps();
  }
  if (e.target.type === 'file') onPropFile(e.target);
});

props.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const sc = scene();
  const o = S.sel.length === 1 ? findObj(S.sel[0]) : null;
  const t = M.snapT(S.t);
  const edit = (fn) => {
    pushUndo();
    fn();
    renderProps();
    renderScenes();
    updateTimeline();
    changed();
  };
  switch (act) {
    case 'inHere': return edit(() => (o.in = t));
    case 'outHere': return edit(() => (o.out = t));
    case 'clearOut': return edit(() => (o.out = null));
    case 'resetColor': return edit(() => (o.color = ''));
    case 'clearMotion': return edit(() => (o.kf = [{ t: 0, ...M.sampleKF(o.kf, t) }]));
    case 'clearPhoto': return edit(() => (o.photo = null));
    case 'keyAll': return keyAtPlayhead();
    case 'deleteObj': return deleteSelected();
    case 'chain':
    case 'shape': {
      pushUndo();
      const ids = S.sel.filter((id) => findObj(id)?.type === 'player');
      const c = M.makeChain(ids, S.t > 0.01 ? t : 0);
      if (act === 'shape') {
        c.fill = true;
        c.color = S.project.teams[findObj(ids[0]).team]?.color || '#ffffff';
      }
      sc.objects.push(c);
      S.sel = [c.id];
      return changedAll();
    }
    case 'camPreset': return setCam(CAM_PRESETS[b.dataset.p]);
    case 'delCam': return edit(() => sc.camera.splice(+b.dataset.i, 1));
    case 'fitWords': return edit(() => (sc.duration = Math.max(2, r2(words(sc.narration) / 2.6 + 0.6))));
    case 'fitAudio': {
      const d = A.duration(sc.audio);
      if (d) edit(() => (sc.duration = r2(d + 0.3)));
      return;
    }
    case 'clearAudio': return edit(() => { sc.audio = null; sc.audioName = ''; });
    case 'clearImage': return edit(() => (sc.image = null));
    case 'clearImage2': return edit(() => (sc.image2 = null));
    case 'pick': return b.previousElementSibling.click();
    case 'speak': {
      if (!sc.narration) return alert('Write some narration first.');
      stop();
      S.t = 0;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sc.narration);
      u.rate = 1.02;
      speechSynthesis.speak(u);
      return play(false, { mute: true });
    }
    case 'rec': return toggleRecord();
    case 'tts': return generateVoice([S.si]);
    case 'ttsAll': {
      const idx = S.project.scenes.map((s, i) => (s.narration?.trim() ? i : -1)).filter((i) => i >= 0);
      const missing = idx.filter((i) => !S.project.scenes[i].audio);
      const which = missing.length && missing.length < idx.length && confirm(`Voice only the ${missing.length} scenes without a voiceover? (Cancel = redo all ${idx.length})`) ? missing : idx;
      return generateVoice(which);
    }
  }
});

// ---------- voice ----------

async function loadVoices() {
  try {
    S.voices = await (await fetch('/api/tts/voices')).json();
    if (!S.voices.some((v) => v.id === S.project.voice)) S.project.voice = S.voices[0]?.id || '';
  } catch {
    S.voices = [];
  }
  $('#scriptVoice').disabled = !S.voices.length;
  renderProps();
}

async function ttsToAsset(text) {
  const r = await fetch('/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice: S.project.voice, text, rate: S.project.voiceRate || 1 }),
  });
  if (!r.ok) throw new Error(await r.text());
  const id = M.uid();
  S.project.assets[id] = await blobToDataURL(await r.blob());
  return id;
}

async function generateVoice(indices) {
  const list = indices.filter((i) => S.project.scenes[i].narration?.trim());
  if (!list.length) return alert('Write the narration for this scene first.');
  stop();
  pushUndo();
  const vname = S.voices.find((v) => v.id === S.project.voice)?.name.split(' · ')[0] || 'AI voice';
  try {
    for (const [n, i] of list.entries()) {
      status(`🤖 Generating voice ${n + 1} / ${list.length}…`);
      const sc = S.project.scenes[i];
      const id = await ttsToAsset(sc.narration);
      sc.audio = id;
      sc.audioName = `${vname}`;
      await A.preload(S.project);
      const d = A.duration(id);
      if (d) sc.duration = r2(Math.max(d + 0.5, M.minSceneDuration(sc)));
    }
  } catch (err) {
    alert('Voice generation failed: ' + err.message);
  }
  status('');
  changedAll();
}

// ---------- mic / files ----------

async function toggleRecord() {
  const sc = scene();
  if (!S.recording) {
    try {
      await A.recStart();
    } catch (err) {
      return alert('Microphone not available: ' + err.message);
    }
    S.recording = true;
    stop();
    S.t = 0;
    renderProps();
    play(false, { mute: true });
    return;
  }
  const blob = await A.recStop();
  S.recording = false;
  stop();
  if (blob?.size) {
    const id = M.uid();
    pushUndo();
    S.project.assets[id] = await blobToDataURL(blob);
    sc.audio = id;
    sc.audioName = `mic take ${new Date().toLocaleTimeString()}`;
    await A.preload(S.project);
    const d = A.duration(id);
    if (d && confirm(`Recorded ${d.toFixed(1)}s. Set the scene duration to match?`)) sc.duration = r2(d + 0.3);
  }
  changedAll();
}

async function onPropFile(input) {
  const f = input.files?.[0];
  if (!f) return;
  const sc = scene();
  const act = input.dataset.act;
  const id = M.uid();
  let url = await blobToDataURL(f);
  if (act !== 'audioFile') {
    const style = input.closest('.imgpick')?.querySelector('select')?.value || 'none';
    status('🎨 Processing image…');
    try {
      url = await stylizeImage(url, style, {
        accent: S.project.teams.home.color, paper: sc.bg || '#e8dfc8', max: act === 'photoFile' ? 480 : 2400,
        outline: act !== 'photoFile' || style !== 'duotone',
      });
    } catch (err) {
      console.warn(err);
    }
    status('');
  }
  pushUndo();
  S.project.assets[id] = url;
  if (act === 'imageFile') sc.image = id;
  else if (act === 'image2File') sc.image2 = id;
  else if (act === 'photoFile') findObj(S.sel[0]).photo = id;
  else {
    sc.audio = id;
    sc.audioName = f.name;
    await A.preload(S.project);
    const d = A.duration(id);
    if (d && confirm(`Audio is ${d.toFixed(1)}s. Set the scene duration to match?`)) sc.duration = r2(d + 0.3);
  }
  changedAll();
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
const slug = (s) => String(s || 'project').replace(/[^a-z0-9_\- ]/gi, '').trim().replace(/\s+/g, '-') || 'project';

// ---------- top bar ----------

$('#btnNew').onclick = () => confirm('Start a new empty project? (Unsaved changes are lost.)') && setProject(M.newProject());
$('#btnSample').onclick = () => confirm('Load the sample “High Press” project? (Unsaved changes are lost.)') && setProject(M.sampleProject());
$('#btnExportJson').onclick = () =>
  download(new Blob([JSON.stringify(pruneAssets(S.project))], { type: 'application/json' }), `${slug(S.project.title)}.tifo.json`);
$('#btnImport').onclick = () => $('#fileImport').click();
$('#fileImport').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    setProject(JSON.parse(await f.text()));
  } catch (err) {
    alert('Could not read project: ' + err.message);
  }
  e.target.value = '';
};

$('#btnSave').onclick = async () => {
  const name = prompt('Save project as:', S.project.title);
  if (!name) return;
  S.project.title = name;
  try {
    const r = await fetch(`/api/projects/${encodeURIComponent(slug(name))}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pruneAssets(S.project)),
    });
    if (!r.ok) throw new Error(await r.text());
    status(`✓ Saved to projects/${slug(name)}.json`);
    setTimeout(() => status(''), 2500);
  } catch (err) {
    alert('Save failed (is the server running?): ' + err.message);
  }
};

$('#btnOpen').onclick = async () => {
  const list = $('#openList');
  try {
    const items = await (await fetch('/api/projects')).json();
    list.innerHTML = items.length
      ? items.map((p) => `<li><span><b>${esc(p.name)}</b><br><span class="muted">${new Date(p.mtime).toLocaleString()} · ${(p.size / 1e6).toFixed(1)} MB</span></span>
          <span><button type="button" data-open="${esc(p.name)}" class="primary">Open</button> <button type="button" data-del="${esc(p.name)}" class="danger">✕</button></span></li>`).join('')
      : '<li class="muted">No saved projects yet.</li>';
  } catch {
    list.innerHTML = '<li class="muted">Server not reachable. Start it with <code>npm start</code>.</li>';
  }
  $('#dlgOpen').showModal();
};
$('#openList').addEventListener('click', async (e) => {
  const open = e.target.dataset.open;
  const del = e.target.dataset.del;
  if (open) {
    const p = await (await fetch(`/api/projects/${encodeURIComponent(open)}`)).json();
    $('#dlgOpen').close();
    setProject(p);
  } else if (del && confirm(`Delete ${del}?`)) {
    await fetch(`/api/projects/${encodeURIComponent(del)}`, { method: 'DELETE' });
    e.target.closest('li').remove();
  }
});

// Project dialog
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const setPath = (obj, path, v) => {
  const ks = path.split('.');
  const last = ks.pop();
  ks.reduce((o, k) => o[k], obj)[last] = v;
};
function fillProjectDlg() {
  $$('#dlgProject [data-pk]').forEach((inp) => {
    const v = getPath(S.project, inp.dataset.pk);
    if (inp.type === 'checkbox') inp.checked = !!v;
    else inp.value = v ?? '';
  });
  $('#musicInfo').textContent = S.project.music ? `♪ ${S.project.musicName || 'music'}` : 'No music. Tip: YouTube Audio Library has free tracks.';
}
$('#btnProject').onclick = () => {
  S.pending = snapshot();
  fillProjectDlg();
  $('#dlgProject').showModal();
};
$('#dlgProject').addEventListener('input', (e) => {
  const pk = e.target.dataset.pk;
  if (!pk) return;
  if (S.pending) {
    pushUndo(S.pending);
    S.pending = null;
  }
  const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
  setPath(S.project, pk, v);
  updateTools();
  changed();
});
$('#musicFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const id = M.uid();
  S.project.assets[id] = await blobToDataURL(f);
  S.project.music = id;
  S.project.musicName = f.name;
  await A.preload(S.project);
  fillProjectDlg();
  autosave();
  e.target.value = '';
};
$('#musicClear').onclick = () => {
  S.project.music = null;
  fillProjectDlg();
  autosave();
};
$('#dlgProject').addEventListener('close', () => refreshAll());

// Script → scenes
$('#btnScript').onclick = () => $('#dlgScript').showModal();
$('#scriptGo').onclick = async (e) => {
  const text = $('#scriptText').value;
  const paras = text.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!paras.length) {
    e.preventDefault();
    return alert('Paste a script with paragraphs separated by blank lines.');
  }
  const wps = +$('#scriptWps').value || 2.6;
  const carry = $('#scriptCarry').checked;
  const caps = $('#scriptCaptions').checked;
  const voice = $('#scriptVoice').checked && S.voices.length;
  pushUndo();
  let base = scene();
  let at = S.si + 1;
  const created = [];
  for (const p of paras) {
    const sc = carry && base.kind === 'pitch' ? M.continueScene(base) : M.newPitchScene();
    sc.name = p.split(' ').slice(0, 4).join(' ') + (words(p) > 4 ? '…' : '');
    sc.narration = p;
    if (caps) sc.caption = p;
    sc.duration = Math.max(3, r2(words(p) / wps + 0.6));
    created.push(at);
    S.project.scenes.splice(at++, 0, sc);
    base = sc;
  }
  gotoScene(S.si + 1);
  autosave();
  if (voice) await generateVoice(created);
};

$('#btnSrt').onclick = () => {
  const srt = buildSRT(S.project);
  if (!srt) return alert('No narration text in any scene yet.');
  download(new Blob([srt], { type: 'text/plain' }), `${slug(S.project.title)}.srt`);
};

$('#btnSnap').onclick = async () => {
  stop();
  const [w, h] = RESOLUTIONS[$('#expRes').value] || RESOLUTIONS['1080p'];
  status('📷 Rendering snapshot…');
  const blob = await snapshotPNG(S.project, scene(), S.t, w, h, R.images, null);
  status('');
  download(blob, `${slug(S.project.title)}-scene${S.si + 1}-${S.t.toFixed(1)}s.png`);
};

// ---------- export ----------

let exportAbort = null;
function exportInfo() {
  const [w, h] = RESOLUTIONS[$('#expRes').value];
  const fps = +$('#expFps').value;
  const total = projectDuration(S.project);
  const pro = supportsWebCodecs();
  $('#expEngine').innerHTML = pro
    ? `✓ <b>Pro renderer</b>: frame-accurate, H.264 MP4 (hardware-accelerated where available). ${w}×${h} @ ${fps} fps, ${fmtTime(total)} long — ${Math.round(total * fps)} frames.`
    : '⚠ This browser lacks WebCodecs: falls back to real-time recording at 1080p. Use Chrome or Edge for 4K / 60 fps.';
  $('#expDiskRow').hidden = !(pro && 'showSaveFilePicker' in window);
}
$('#btnVideo').onclick = () => {
  stop();
  $('#expProgress').value = 0;
  $('#expStatus').textContent = '';
  $('#expStart').disabled = false;
  exportInfo();
  $('#dlgExport').showModal();
};
['#expRes', '#expFps'].forEach((s) => $(s).addEventListener('change', exportInfo));
$('#expCancel').onclick = () => {
  if (exportAbort) exportAbort.abort();
  else $('#dlgExport').close();
};
$('#dlgExport').addEventListener('cancel', (e) => exportAbort && e.preventDefault());
$('#expStart').onclick = async () => {
  const [width, height] = RESOLUTIONS[$('#expRes').value];
  const fps = +$('#expFps').value;
  const quality = +$('#expQuality').value;
  const pro = supportsWebCodecs();
  let fileHandle = null;
  if (pro && !$('#expDiskRow').hidden && $('#expDisk').checked) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: `${slug(S.project.title)}-${$('#expRes').value}.mp4`,
        types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
      });
    } catch {
      return; // picker cancelled
    }
  }
  $('#expStart').disabled = true;
  exportAbort = new AbortController();
  S.exporting = pro ? 'pro' : 'realtime';
  S.sel = [];
  const started = performance.now();
  const onProgress = (p, info = {}) => {
    $('#expProgress').value = p;
    const eta = info.eta != null ? ` · ${fmtTime(info.eta)} left` : '';
    const speed = info.speed ? ` · ${info.speed.toFixed(1)}× real-time` : '';
    $('#expStatus').textContent = `${info.phase || 'Working…'}${eta}${speed}`;
  };
  try {
    const res = pro
      ? await exportPro({ project: S.project, audio: A, width, height, fps, bitrate: Math.round(width * height * fps * quality), onProgress, signal: exportAbort.signal, fileHandle, images: R.images })
      : await exportRealtime({ project: S.project, renderer: R, audio: A, fps: 30, bitrate: 16e6, onProgress, signal: exportAbort.signal });
    const took = fmtTime((performance.now() - started) / 1000);
    if (!res) $('#expStatus').textContent = 'Export cancelled.';
    else if (res.savedToDisk) $('#expStatus').textContent = `✓ Done in ${took} — saved to the file you chose (${res.codec}).`;
    else {
      download(res.blob, `${slug(S.project.title)}-${pro ? $('#expRes').value : '1080p'}.${res.ext}`);
      $('#expStatus').textContent = `✓ Done in ${took} — ${(res.blob.size / 1e6).toFixed(1)} MB ${res.ext.toUpperCase()} downloaded${res.codec ? ` (${res.codec})` : ''}.` +
        (res.ext === 'webm' ? ' Convert to MP4 with: ffmpeg -i in.webm -c:v libx264 -crf 18 -c:a aac out.mp4' : '');
    }
  } catch (err) {
    console.error(err);
    $('#expStatus').textContent = 'Export failed: ' + (err.message || err);
  }
  S.exporting = null;
  exportAbort = null;
  $('#expStart').disabled = false;
  refreshAll();
};

// ---------- boot ----------

function boot() {
  let p = null;
  try {
    const saved = localStorage.getItem('tifo-autosave');
    if (saved) p = JSON.parse(saved);
  } catch { /* ignore */ }
  setProject(p?.scenes?.length ? p : M.sampleProject());
  document.fonts?.ready.then(draw);
  loadVoices();
}
boot();

// Handy for debugging from the console.
window.tifo = { S, R, A, M };
