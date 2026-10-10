// Data model for Tifo Studio: projects, scenes, objects, keyframes.
// All pitch coordinates are in metres on a 105 x 68 pitch (x → right, y → down).

export const PITCH = { w: 105, h: 68 };
export const FPS = 30;
export const FADE = 0.3;

export const uid = () => Math.random().toString(36).slice(2, 10);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeInOut = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
export const snapT = (t) => Math.round(t * FPS) / FPS;
export const CAM_KEYS = ['cx', 'cy', 'zoom', 'tilt', 'rot'];
export const DEFAULT_CAM = { cx: 52.5, cy: 34, zoom: 1, tilt: 0, rot: 0 };

// ---------- keyframes ----------

export function sampleKF(kf, t, keys = ['x', 'y']) {
  if (!kf || !kf.length) return null;
  const pick = (k) => Object.fromEntries(keys.map((n) => [n, k[n] ?? 0]));
  if (t <= kf[0].t) return pick(kf[0]);
  const last = kf[kf.length - 1];
  if (t >= last.t) return pick(last);
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i];
    const b = kf[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = easeInOut((t - a.t) / Math.max(1e-6, b.t - a.t));
      return Object.fromEntries(keys.map((n) => [n, (a[n] ?? 0) + ((b[n] ?? 0) - (a[n] ?? 0)) * p]));
    }
  }
  return pick(last);
}

export function setKF(kf, t, values) {
  t = snapT(t);
  const hit = kf.find((k) => Math.abs(k.t - t) < 0.5 / FPS);
  if (hit) Object.assign(hit, values);
  else {
    kf.push({ t, ...values });
    kf.sort((a, b) => a.t - b.t);
  }
}

export function removeKF(kf, t) {
  const i = kf.findIndex((k) => Math.abs(k.t - t) < 1.5 / FPS);
  if (i >= 0 && kf.length > 1) {
    kf.splice(i, 1);
    return true;
  }
  return false;
}

// ---------- visibility ----------

export const inWindow = (o, t) => t >= (o.in || 0) && t <= (o.out ?? Infinity);

export function alphaAt(o, t) {
  const tin = o.in || 0;
  const tout = o.out ?? Infinity;
  if (t < tin || t > tout) return 0;
  let a = tin > 0 ? Math.min(1, (t - tin) / FADE) : 1;
  if (Number.isFinite(tout)) a = Math.min(a, (tout - t) / FADE);
  return clamp(a, 0, 1);
}

// ---------- geometry ----------

export function arrowCtrl(o) {
  const dx = o.x2 - o.x1;
  const dy = o.y2 - o.y1;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const bend = o.bend || 0;
  return { cx: (o.x1 + o.x2) / 2 + nx * bend, cy: (o.y1 + o.y2) / 2 + ny * bend, nx, ny, L };
}

// Points along the (quadratic bezier) arrow path, up to progress p (0..1).
export function arrowPath(o, p = 1) {
  const { cx, cy, nx, ny, L } = arrowCtrl(o);
  const N = 64;
  const end = Math.max(1, Math.round(N * clamp(p, 0, 1)));
  const pts = [];
  for (let i = 0; i <= end; i++) {
    const u = i / N;
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    let x = a * o.x1 + b * cx + c * o.x2;
    let y = a * o.y1 + b * cy + c * o.y2;
    if (o.style === 'dribble') {
      const taper = Math.min(1, u * 6, (1 - u) * 6);
      const w = Math.sin(((u * L) / 1.8) * Math.PI * 2) * 0.55 * taper;
      x += nx * w;
      y += ny * w;
    }
    pts.push([x, y]);
  }
  return pts;
}

export function curveMid(o) {
  const { cx, cy } = arrowCtrl(o);
  return { x: 0.25 * o.x1 + 0.5 * cx + 0.25 * o.x2, y: 0.25 * o.y1 + 0.5 * cy + 0.25 * o.y2 };
}

export function handlesFor(o) {
  if (o.type === 'arrow') {
    const m = curveMid(o);
    return [
      { k: 'p1', x: o.x1, y: o.y1 },
      { k: 'p2', x: o.x2, y: o.y2 },
      { k: 'bend', x: m.x, y: m.y },
    ];
  }
  if (o.type === 'zone') return [{ k: 'size', x: o.x + o.w, y: o.y + o.h }];
  if (o.type === 'spot' && !o.pid) return [{ k: 'radius', x: o.x + o.r, y: o.y }];
  return [];
}

// Shortest duration that still shows all of a scene's animation.
export function minSceneDuration(sc) {
  if (sc.kind === 'chart') return 0.3 + parseChart(sc.data).length * 0.12 + 2;
  if (sc.kind === 'card') return 2.5;
  let end = 0;
  for (const o of sc.objects) {
    if (o.kf) end = Math.max(end, o.kf[o.kf.length - 1].t);
    end = Math.max(end, (o.in || 0) + (o.dur || 0), o.out ?? 0);
  }
  for (const k of sc.camera || []) end = Math.max(end, k.t);
  return end + 0.8;
}

export function objPos(scene, id, t) {
  const o = scene.objects.find((p) => p.id === id);
  return o?.kf ? sampleKF(o.kf, t) : null;
}

export function firstBall(scene) {
  return scene.objects.find((o) => o.type === 'ball');
}

// "*Label, 7.2" → highlighted row. Accepts comma, tab or semicolon separators.
export function parseChart(text) {
  return String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/\s*[,;\t]\s*/);
      let label = parts[0] || '';
      const hi = label.startsWith('*');
      if (hi) label = label.slice(1).trim();
      const raw = (parts[1] || '0').replace(/[^0-9.\-]/g, '');
      return { label, value: parseFloat(raw) || 0, decimals: (raw.split('.')[1] || '').length, hi };
    });
}

export function chainPts(scene, o, t) {
  return o.ids
    .map((id) => scene.objects.find((p) => p.id === id))
    .filter((p) => p && p.kf)
    .map((p) => {
      const q = sampleKF(p.kf, t);
      return [q.x, q.y];
    });
}

// ---------- factories ----------

export function newPitchScene(name = 'Scene') {
  return {
    id: uid(), kind: 'pitch', name, duration: 6, transition: 'cut',
    caption: '', narration: '', audio: null, audioName: '',
    camera: [{ t: 0, ...DEFAULT_CAM }], objects: [],
  };
}

export function newCardScene(name = 'Title') {
  return {
    id: uid(), kind: 'card', name, duration: 4, transition: 'fade',
    caption: '', narration: '', audio: null, audioName: '',
    title: 'Title', subtitle: 'Subtitle', kicker: '', layout: 'title', motion: 'in',
    bg: '#e8dfc8', image: null, image2: null,
    camera: [{ t: 0, ...DEFAULT_CAM }], objects: [],
  };
}

export function newChartScene(name = 'Chart') {
  return {
    id: uid(), kind: 'chart', name, duration: 6, transition: 'wipe',
    caption: '', narration: '', audio: null, audioName: '',
    title: 'Passes allowed per defensive action', subtitle: 'Lower = more intense press',
    data: '*Reds, 7.2\nGreens, 9.1\nBlues, 10.4\nWhites, 11.8\nBlacks, 13.5', unit: '', bg: '#e8dfc8',
    camera: [{ t: 0, ...DEFAULT_CAM }], objects: [],
  };
}

// Fill in fields added in later versions so old projects keep working.
export function migrateProject(p) {
  p.assets ||= {};
  p.sfx ??= true;
  p.sfxVolume ??= 0.5;
  p.voice ??= '';
  p.voiceRate ??= 1;
  for (const sc of p.scenes) {
    sc.kind ||= 'pitch';
    sc.transition ||= 'cut';
    sc.camera = (sc.camera?.length ? sc.camera : [{ t: 0 }]).map((k) => ({ ...DEFAULT_CAM, ...k }));
    sc.objects ||= [];
    if (sc.kind === 'card') {
      sc.layout ||= 'title';
      sc.motion ||= 'in';
      sc.kicker ??= '';
    }
    if (sc.kind === 'chart') {
      sc.data ??= '';
      sc.unit ??= '';
    }
  }
  return p;
}

export function newProject() {
  return {
    version: 1,
    title: 'Untitled',
    teams: {
      home: { name: 'Home', color: '#d64545', text: '#ffffff' },
      away: { name: 'Away', color: '#2f6fb5', text: '#ffffff' },
    },
    showCaptions: true,
    music: null,
    musicName: '',
    musicVolume: 0.15,
    sfx: true,
    sfxVolume: 0.5,
    voice: '',
    voiceRate: 1,
    assets: {},
    scenes: [newCardScene('Intro'), newPitchScene('Scene 1')],
  };
}

export const makePlayer = (team, num, x, y, name = '') => ({
  id: uid(), type: 'player', team, num: String(num), name,
  kf: [{ t: 0, x, y }], in: 0, out: null, highlight: false, color: '',
});
export const makeBall = (x, y) => ({ id: uid(), type: 'ball', kf: [{ t: 0, x, y }], in: 0, out: null });
export const makeArrow = (style, x1, y1, x2, y2, tin = 0, bend = 0) => ({
  id: uid(), type: 'arrow', style, x1, y1, x2, y2, bend, in: tin, dur: 0.8, out: null, color: '',
});
export const makeZone = (shape, x, y, w, h, tin = 0) => ({
  id: uid(), type: 'zone', shape, x, y, w, h, color: '#f2c14e', in: tin, out: null,
});
export const makeText = (text, x, y, tin = 0, size = 3) => ({
  id: uid(), type: 'text', text, x, y, size, color: '#ffffff', in: tin, out: null,
});
export const makeChain = (ids, tin = 0) => ({
  id: uid(), type: 'chain', ids, color: '#ffffff', fill: false, in: tin, out: null,
});
export const makeShadow = (pid, bid, tin = 0) => ({
  id: uid(), type: 'shadow', pid, bid, len: 14, spread: 30, in: tin, out: null,
});
export const makeSpot = (x, y, pid = null, tin = 0) => ({
  id: uid(), type: 'spot', x, y, r: 7, pid, dim: 0.55, in: tin, out: null,
});

// "Continue" a scene: new scene whose players/ball start where the old one ended.
export function continueScene(sc) {
  const n = newPitchScene(sc.name + ' (cont.)');
  const end = sc.duration;
  const keep = new Set();
  for (const o of sc.objects) {
    if ((o.type === 'player' || o.type === 'ball') && alphaAt(o, end) > 0) {
      const c = structuredClone(o);
      c.kf = [{ t: 0, ...sampleKF(o.kf, end) }];
      c.in = 0;
      c.out = null;
      keep.add(o.id);
      n.objects.push(c);
    }
  }
  for (const o of sc.objects) {
    const refs = o.type === 'chain' ? o.ids : o.type === 'shadow' ? [o.pid, o.bid] : o.type === 'spot' && o.pid ? [o.pid] : null;
    if (refs && alphaAt(o, end) > 0 && refs.every((id) => !id || keep.has(id))) {
      n.objects.push({ ...structuredClone(o), in: 0, out: null });
    }
  }
  n.camera = [{ t: 0, ...sampleKF(sc.camera, end, CAM_KEYS) }];
  return n;
}

// Formations for the home side attacking left → right: [x, y, shirt number].
// The away side is mirrored automatically.
export const FORMATIONS = {
  '4-3-3': [[5, 34, 1], [20, 56, 2], [18, 42, 5], [18, 26, 4], [20, 12, 3], [32, 34, 6], [38, 48, 8], [38, 20, 10], [48, 58, 7], [50, 34, 9], [48, 10, 11]],
  '4-4-2': [[5, 34, 1], [20, 58, 2], [18, 42, 5], [18, 26, 4], [20, 10, 3], [34, 58, 7], [33, 41, 8], [33, 27, 6], [34, 10, 11], [48, 42, 9], [48, 26, 10]],
  '4-2-3-1': [[5, 34, 1], [20, 58, 2], [18, 42, 5], [18, 26, 4], [20, 10, 3], [30, 42, 6], [30, 26, 8], [40, 56, 7], [40, 34, 10], [40, 12, 11], [49, 34, 9]],
  '3-5-2': [[5, 34, 1], [18, 48, 4], [17, 34, 5], [18, 20, 6], [36, 62, 2], [34, 46, 8], [30, 34, 14], [34, 22, 10], [36, 6, 3], [48, 42, 9], [48, 26, 11]],
  '3-4-3': [[5, 34, 1], [18, 48, 4], [17, 34, 5], [18, 20, 6], [34, 60, 2], [32, 42, 8], [32, 26, 16], [34, 8, 3], [47, 54, 7], [49, 34, 9], [47, 14, 11]],
  '5-3-2': [[5, 34, 1], [24, 62, 2], [18, 48, 4], [17, 34, 5], [18, 20, 6], [24, 6, 3], [34, 48, 8], [32, 34, 14], [34, 20, 10], [48, 42, 9], [48, 26, 11]],
};

// ---------- sample project ----------

function mv(o, keys) {
  for (const [t, x, y] of keys) setKF(o.kf, t, { x, y });
}

export function sampleProject() {
  const p = newProject();
  p.title = 'The High Press';
  p.teams.home = { name: 'Reds', color: '#d64545', text: '#ffffff' };
  p.teams.away = { name: 'Blues', color: '#2f6fb5', text: '#ffffff' };

  const intro = newCardScene('Intro');
  intro.title = 'The High Press';
  intro.subtitle = 'How elite teams win the ball back in seconds';
  intro.kicker = 'Tactics explained';
  intro.narration = 'Every great pressing team has a plan. It is not chaos. It is choreography.';

  const s1 = newPitchScene('The trigger');
  s1.duration = 7;
  s1.transition = 'wipe';
  s1.caption = 'Trigger: the pass out to the full-back';
  s1.narration =
    'The Blues play out from the back, and the Reds wait. The moment the ball goes wide, they pounce. The winger presses, the striker blocks the pass back inside, and the touchline does the rest.';

  const away = [['1', 101, 34], ['4', 93, 27], ['5', 93, 41], ['2', 86, 60], ['3', 86, 8], ['6', 79, 30], ['8', 79, 40], ['7', 72, 58], ['11', 72, 10], ['9', 62, 28], ['10', 62, 40]]
    .map(([n, x, y]) => makePlayer('away', n, x, y));
  const H = {};
  const home = [['1', 14, 34], ['3', 50, 10], ['5', 48, 27], ['4', 48, 41], ['2', 50, 58], ['8', 66, 22], ['6', 64, 34], ['10', 66, 46], ['11', 80, 18], ['9', 80, 33], ['7', 79, 49]]
    .map(([n, x, y]) => (H[n] = makePlayer('home', n, x, y)));
  const A2 = away[3];
  H['7'].trail = true;
  const ball = makeBall(91.2, 42.6);
  mv(ball, [[1.2, 91.2, 42.6], [2.2, 87.4, 58]]);
  mv(H['9'], [[1.4, 80, 33], [3, 87, 44]]);
  mv(H['7'], [[2, 79, 49], [3.6, 84.5, 56.5]]);
  mv(H['10'], [[2.2, 66, 46], [4, 74, 55]]);
  mv(H['6'], [[2.4, 64, 34], [4, 70, 40]]);
  mv(H['2'], [[2.4, 50, 58], [4.2, 64, 61]]);
  mv(H['4'], [[2.6, 48, 41], [4.4, 56, 44]]);

  const pass = makeArrow('pass', 90.8, 44, 87.2, 56.6, 1.2, -1);
  pass.dur = 0.9;
  pass.out = 5.5;
  const r7 = makeArrow('run', 79.6, 50.6, 84, 55.4, 2.2, -1);
  const r9 = makeArrow('run', 81, 34.6, 86.4, 42.6, 1.6, 2);
  const r10 = makeArrow('run', 67.4, 47.2, 73.4, 53.6, 2.4, 0.8);
  for (const a of [r7, r9, r10]) a.out = 5;
  const chain = makeChain([H['11'].id, H['9'].id, H['7'].id], 0.3);
  chain.out = 2.2;
  const lineLabel = makeText('Pressing line', 80, 12, 0.3, 2.2);
  lineLabel.out = 2.2;
  const zone = makeZone('ellipse', 74, 47, 20, 18, 3.8);
  const trap = makeText('The trap', 76, 44.5, 4.2, 2.6);
  trap.color = '#f2c14e';
  const spot = makeSpot(86, 60, A2.id, 2.2);
  spot.r = 6;
  spot.out = 3.9;
  const shadow9 = makeShadow(H['9'].id, ball.id, 3.1);
  s1.objects.push(zone, shadow9, chain, pass, r7, r9, r10, ...away, ...home, ball, spot, lineLabel, trap);
  s1.camera = [
    { t: 0, cx: 52.5, cy: 34, zoom: 1, tilt: 0, rot: 0 },
    { t: 1.6, cx: 60, cy: 36, zoom: 1.15, tilt: 0, rot: 0 },
    { t: 3.6, cx: 80, cy: 47, zoom: 1.7, tilt: 42, rot: 0 },
  ];

  const s2 = continueScene(s1);
  s2.name = 'The turnover';
  s2.duration = 6;
  s2.caption = 'Win it high, and the goal is twenty metres away';
  s2.narration =
    'The full-back is trapped. The ball is won, and suddenly the Reds are twenty metres from goal.';
  const f = (id) => s2.objects.find((o) => o.id === id);
  f(shadow9.id).out = 1.2;
  const b2 = f(ball.id);
  mv(b2, [[0.9, 87.4, 58], [1.1, 86, 55.4], [3, 93.4, 46.4], [3.6, 95.8, 40], [4.4, 105.4, 35]]);
  mv(f(H['7'].id), [[1, 84.5, 56.5], [3, 92, 48]]);
  mv(f(H['9'].id), [[1.6, 87, 44], [3.5, 95, 38]]);
  mv(f(A2.id), [[1.2, 86, 60], [3, 89, 55]]);
  mv(f(away[2].id), [[1.4, 93, 41], [3.2, 96, 42]]);
  const drib = makeArrow('dribble', 85, 57.6, 91.8, 48.8, 1.1);
  drib.dur = 1.4;
  const run9 = makeArrow('run', 88, 43.6, 94.6, 38.6, 1.6, 1.5);
  const p2 = makeArrow('pass', 93.6, 45.6, 95.6, 41, 3);
  p2.dur = 0.5;
  const shot = makeArrow('pass', 96.6, 39.4, 105, 35.2, 3.7);
  shot.dur = 0.6;
  shot.color = '#ffffff';
  const won = makeText('Ball won', 81, 64, 1.1, 2.4);
  won.color = '#f2c14e';
  won.out = 3.4;
  const dist = makeArrow('measure', 92.6, 45.8, 104.6, 34.4, 2.4);
  dist.dur = 0.5;
  dist.out = 3.7;
  s2.objects.unshift(drib, run9, p2, shot, dist);
  s2.objects.push(won);
  s2.camera = [
    { t: 0, cx: 80, cy: 47, zoom: 1.7, tilt: 42, rot: 0 },
    { t: 3, cx: 90, cy: 44, zoom: 1.9, tilt: 48, rot: -12 },
    { t: 5, cx: 94, cy: 40, zoom: 2.1, tilt: 52, rot: -18 },
  ];

  const chart = newChartScene('The numbers');
  chart.title = 'Passes allowed per defensive action';
  chart.subtitle = 'Illustrative numbers. Lower = more intense press.';
  chart.narration = 'The numbers agree. No side allows fewer passes before winning the ball back.';

  const quote = newCardScene('The rule');
  quote.layout = 'quote';
  quote.title = 'When we lose the ball, we have five seconds to win it back. After that, we drop and reorganise.';
  quote.subtitle = 'The five-second rule';
  quote.transition = 'crossfade';
  quote.duration = 5.5;
  quote.narration = 'The rule is simple. Five seconds to win it back.';

  const outro = newCardScene('Outro');
  outro.title = 'Tactics, explained';
  outro.subtitle = 'Made with Tifo Studio';
  outro.bg = '#1f2a24';
  outro.duration = 3.5;
  outro.transition = 'wipe';
  outro.narration = 'Tactics, explained.';

  p.scenes = [intro, s1, s2, chart, quote, outro];
  return p;
}
