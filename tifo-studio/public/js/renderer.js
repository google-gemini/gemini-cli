// Canvas renderer: draws a scene at time t in a flat, textured "Tifo" style.
// Pitch scenes are projected through a perspective camera (zoom, tilt, rotate),
// so the same scene can be shown top-down or at a broadcast angle.
import {
  PITCH, CAM_KEYS, DEFAULT_CAM, sampleKF, alphaAt, inWindow, arrowPath, handlesFor, chainPts,
  objPos, firstBall, parseChart, clamp, easeInOut,
} from './model.js';

export const FONT = '"Oswald", "Bebas Neue", Impact, "Arial Narrow", sans-serif';
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const DIST = 110; // camera distance in metres (controls perspective strength)
const NEAR = 4;
const LINE = '#ece6d3';
const ACCENT = '#f2c14e';
const STYLE_COLORS = { pass: '#f4f1e6', run: ACCENT, dribble: '#f4f1e6', line: '#ffffff', measure: '#ffffff' };
const LAYER = { zone: 0, shadow: 1, chain: 2, arrow: 3, player: 4, ball: 5, spot: 6, text: 7 };
const SEL = '#5ad1ff';
const PUCK_H = 0.45;
const TS = 20; // text is drawn TS× larger then scaled down, keeping glyphs crisp
export const TRANSITION_TIME = 0.6;

function rgb(hex) {
  let c = String(hex || '#000').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, amt) {
  const f = (v) => Math.round(clamp(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt, 0, 255));
  const [r, g, b] = rgb(hex);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export const withAlpha = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
export const luminance = (hex) => {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

function makeNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = Math.random() * 28;
  }
  g.putImageData(d, 0, 0);
  return c;
}

function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- perspective camera ----------

export class View {
  constructor(W, H, base, cam) {
    this.W = W;
    this.H = H;
    this.cx = cam.cx;
    this.cy = cam.cy;
    this.zoom = cam.zoom || 1;
    this.tilt = clamp(cam.tilt || 0, 0, 65);
    const th = this.tilt * DEG;
    const ph = (cam.rot || 0) * DEG;
    this.st = Math.sin(th);
    this.ct = Math.cos(th);
    this.sp = Math.sin(ph);
    this.cp = Math.cos(ph);
    this.F = base * this.zoom * DIST;
  }
  depth(x, y, z = 0) {
    const v = -(x - this.cx) * this.sp + (y - this.cy) * this.cp;
    return DIST - v * this.st - z * this.ct;
  }
  // world (x, y, height z) → [screenX, screenY, pixels-per-metre, depth]
  project(x, y, z = 0) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const u = dx * this.cp + dy * this.sp;
    const v = -dx * this.sp + dy * this.cp;
    const d = Math.max(DIST - v * this.st - z * this.ct, 0.5);
    const k = this.F / d;
    return [this.W / 2 + u * k, this.H / 2 + (v * this.ct - z * this.st) * k, k, d];
  }
  // screen → ground point, or null above the horizon
  unproject(X, Y) {
    const a = (X - this.W / 2) / this.F;
    const b = (Y - this.H / 2) / this.F;
    const den = this.ct + b * this.st;
    if (den <= 1e-4) return null;
    const v = (b * DIST) / den;
    const u = a * (DIST - v * this.st);
    return { x: this.cx + u * this.cp - v * this.sp, y: this.cy + u * this.sp + v * this.cp };
  }
  k(x, y, z = 0) {
    return this.project(x, y, z)[2];
  }
  // Local affine map of the ground plane at a point (world-aligned).
  ground(x, y, z = 0) {
    const h = 0.05;
    const [X, Y] = this.project(x, y, z);
    const [X1, Y1] = this.project(x + h, y, z);
    const [X2, Y2] = this.project(x, y + h, z);
    return [(X1 - X) / h, (Y1 - Y) / h, (X2 - X) / h, (Y2 - Y) / h, X, Y];
  }
  // Same, but aligned with the camera so text/numbers stay upright at any rotation.
  flat(x, y, z = 0) {
    const [a, b, c, d, e, f] = this.ground(x, y, z);
    const { cp, sp } = this;
    return [a * cp + c * sp, b * cp + d * sp, -a * sp + c * cp, -b * sp + d * cp, e, f];
  }
  // Clip a ground polygon/polyline against the near plane; returns projected points.
  clip(pts, closed) {
    const out = [];
    const n = pts.length;
    const inside = (p) => this.depth(p[0], p[1]) >= NEAR;
    const cross = (a, b) => {
      const da = this.depth(a[0], a[1]) - NEAR;
      const db = this.depth(b[0], b[1]) - NEAR;
      const s = da / (da - db);
      return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
    };
    const segs = closed ? n : n - 1;
    if (!n) return out;
    if (!closed && inside(pts[0])) out.push(pts[0]);
    for (let i = 0; i < segs; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const ia = inside(a);
      const ib = inside(b);
      if (ia && ib) out.push(b);
      else if (ia && !ib) out.push(cross(a, b));
      else if (!ia && ib) out.push(cross(a, b), b);
    }
    return out.map(([x, y]) => this.project(x, y));
  }
}

const circle = (cx, cy, r, a0 = 0, a1 = TAU, n = 72) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
};

// ---------- renderer ----------

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.u = this.W / 1920; // UI scale for screen-space sizes
    this.base = Math.min((this.W - 160 * this.u) / PITCH.w, (this.H - 160 * this.u) / PITCH.h);
    this.noisePattern = this.g.createPattern(makeNoise(), 'repeat');
    if (this.u > 1.2) this.noisePattern.setTransform(new DOMMatrix().scale(Math.round(this.u)));
    this.images = new Map();
    this.v = null;
  }

  camAt(scene, t, useCamera = true) {
    if (!useCamera || !scene.camera?.length) return { ...DEFAULT_CAM };
    return sampleKF(scene.camera, t, CAM_KEYS);
  }
  viewFor(scene, t, useCamera = true) {
    return new View(this.W, this.H, this.base, this.camAt(scene, t, useCamera));
  }
  viewSize(zoom = 1) {
    return { w: this.W / (this.base * zoom), h: this.H / (this.base * zoom) };
  }

  image(src) {
    if (!src) return null;
    let img = this.images.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => this.onImageLoad?.();
      img.src = src;
      this.images.set(src, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }
  // Resolve once every image the project uses has loaded (needed before export).
  async loadImages(project) {
    const ids = new Set();
    for (const sc of project.scenes) {
      if (sc.image) ids.add(sc.image);
      if (sc.image2) ids.add(sc.image2);
      for (const o of sc.objects) if (o.photo) ids.add(o.photo);
    }
    await Promise.all([...ids].map((id) => new Promise((res) => {
      const src = project.assets[id];
      if (!src) return res();
      this.image(src);
      const img = this.images.get(src);
      if (img.complete) return res();
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    })));
  }

  // Text in the current transform's units (metres), rendered crisp.
  text(txt, x, y, size, { weight = 700, fill = '#fff', stroke = null, strokeW = 0, align = 'center' } = {}) {
    const g = this.g;
    g.save();
    g.translate(x, y);
    g.scale(1 / TS, 1 / TS);
    g.font = `${weight} ${size * TS}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (stroke) {
      g.lineJoin = 'round';
      g.lineWidth = strokeW * TS;
      g.strokeStyle = stroke;
      g.strokeText(txt, 0, 0);
    }
    g.fillStyle = fill;
    g.fillText(txt, 0, 0);
    g.restore();
  }
  measure(txt, size, weight = 700) {
    const g = this.g;
    g.save();
    g.font = `${weight} ${size * TS}px ${FONT}`;
    const w = g.measureText(txt).width / TS;
    g.restore();
    return w;
  }

  // Path helpers for ground geometry (world metres → screen).
  path(pts, closed = false) {
    const g = this.g;
    const sp = this.v.clip(pts, closed);
    g.beginPath();
    sp.forEach(([X, Y], i) => (i ? g.lineTo(X, Y) : g.moveTo(X, Y)));
    if (closed && sp.length) g.closePath();
    return sp.length > 1;
  }
  line(x1, y1, x2, y2) {
    return this.path([[x1, y1], [x2, y2]]);
  }

  // ---------- top-level ----------

  // opts: { editor, sel, useCamera, temp, showCaptions, prev: {scene, t} }
  draw(project, sc, t, o = {}) {
    const g = this.g;
    this.drawScene(project, sc, t, o);
    const tr = sc.transition;
    if (!o.editor && o.prev && t < TRANSITION_TIME && (tr === 'wipe' || tr === 'crossfade')) {
      const aux = this.aux();
      aux.drawScene(project, o.prev.scene, o.prev.t, { showCaptions: o.showCaptions, useCamera: true });
      const p = easeInOut(t / TRANSITION_TIME);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (tr === 'crossfade') {
        g.globalAlpha = 1 - p;
        g.drawImage(aux.canvas, 0, 0);
      } else {
        const { W, H } = this;
        const s = 0.22 * W;
        const bx = -s + (W + 2 * s) * p;
        g.beginPath();
        g.moveTo(bx + s, 0);
        g.lineTo(W + s, 0);
        g.lineTo(W + s, H);
        g.lineTo(bx - s, H);
        g.closePath();
        g.save();
        g.clip();
        g.drawImage(aux.canvas, 0, 0);
        g.restore();
        const band = (w, col) => {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(bx + s, 0);
          g.lineTo(bx + s + w, 0);
          g.lineTo(bx - s + w, H);
          g.lineTo(bx - s, H);
          g.closePath();
          g.fill();
        };
        band(46 * this.u, project.teams.home.color);
        band(12 * this.u, '#efe8d6');
      }
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    this.drawGrain();
    if (!o.editor && tr === 'fade' && t < 0.5) {
      g.fillStyle = `rgba(0,0,0,${1 - easeInOut(t / 0.5)})`;
      g.fillRect(0, 0, this.W, this.H);
    }
  }

  aux() {
    if (!this._aux) {
      const c = document.createElement('canvas');
      c.width = this.W;
      c.height = this.H;
      this._aux = new Renderer(c);
      this._aux.images = this.images;
    }
    return this._aux;
  }

  drawScene(project, sc, t, o = {}) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.setLineDash([]);
    if (sc.kind === 'card') this.drawCard(project, sc, t);
    else if (sc.kind === 'chart') this.drawChart(project, sc, t);
    else this.drawPitchScene(project, sc, t, o);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.setLineDash([]);
    if (o.showCaptions && sc.caption) this.drawCaption(sc.caption, o.editor ? 1 : clamp(t / 0.35, 0, 1));
  }

  drawGrain() {
    const g = this.g;
    g.fillStyle = this.noisePattern;
    g.fillRect(0, 0, this.W, this.H);
    if (!this.vignette) {
      const v = g.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.42, this.W / 2, this.H / 2, this.W * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.38)');
      this.vignette = v;
    }
    g.fillStyle = this.vignette;
    g.fillRect(0, 0, this.W, this.H);
  }

  drawCaption(text, a) {
    const g = this.g;
    const u = this.u;
    g.save();
    g.globalAlpha = a;
    g.font = `500 ${44 * u}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lines = wrap(g, text, this.W - 520 * u);
    const lh = 56 * u;
    const h = lines.length * lh + 28 * u;
    const maxW = Math.max(...lines.map((l) => g.measureText(l).width));
    const y0 = this.H - 64 * u - h;
    g.fillStyle = 'rgba(14,18,16,0.78)';
    g.beginPath();
    g.roundRect(this.W / 2 - maxW / 2 - 34 * u, y0, maxW + 68 * u, h, 8 * u);
    g.fill();
    g.fillStyle = '#fff';
    lines.forEach((l, i) => g.fillText(l, this.W / 2, y0 + 14 * u + lh * i + lh / 2));
    g.restore();
  }

  // ---------- cards ----------

  paperBands(bg) {
    const g = this.g;
    const { W, H, u } = this;
    g.save();
    g.globalAlpha = 0.06;
    g.fillStyle = luminance(bg) > 0.5 ? '#000' : '#fff';
    for (let i = -H; i < W; i += 140 * u) {
      g.beginPath();
      g.moveTo(i, H);
      g.lineTo(i + 70 * u, H);
      g.lineTo(i + 70 * u + H, 0);
      g.lineTo(i + H, 0);
      g.fill();
    }
    g.restore();
  }

  coverImage(img, m, motion, strength) {
    const g = this.g;
    const { W, H } = this;
    let z = 1.06;
    let ox = 0;
    const s = strength;
    if (motion === 'in') z = 1.04 + 0.1 * m * s;
    else if (motion === 'out') z = 1.04 + 0.1 * (1 - m) * s;
    else if (motion === 'left' || motion === 'right') {
      z = 1.1 + 0.02 * s;
      ox = (motion === 'left' ? 0.5 - m : m - 0.5) * 0.08 * W * s;
    }
    const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight) * z;
    const w = img.naturalWidth * sc;
    const h = img.naturalHeight * sc;
    g.drawImage(img, (W - w) / 2 + ox, (H - h) / 2, w, h);
  }

  drawCard(project, sc, t) {
    const g = this.g;
    const { W, H, u } = this;
    const bg = sc.bg || '#e8dfc8';
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const m = clamp(t / Math.max(0.1, sc.duration), 0, 1);
    const img = this.image(sc.image && project.assets?.[sc.image]);
    const img2 = this.image(sc.image2 && project.assets?.[sc.image2]);
    if (img) this.coverImage(img, m, sc.motion || 'in', 1);
    if (img2) this.coverImage(img2, m, sc.motion || 'in', 2.4); // foreground layer moves faster: parallax
    if (!img && !img2) this.paperBands(bg);
    const hasImg = !!(img || img2);
    const layout = sc.layout || 'title';
    if (hasImg && (sc.title || sc.subtitle)) {
      const grad = g.createLinearGradient(0, H * (layout === 'lower' ? 0.5 : 0.3), 0, H);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.72)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    const ink = hasImg || luminance(bg) < 0.5 ? '#f6f1e4' : '#1d2621';
    const accent = project.teams.home.color;
    const p = easeInOut(clamp(t / 0.9, 0, 1));
    const p2 = easeInOut(clamp((t - 0.35) / 0.9, 0, 1));
    const p3 = easeInOut(clamp((t - 0.7) / 0.9, 0, 1));
    g.textBaseline = 'middle';

    if (layout === 'quote') {
      const x0 = 260 * u;
      g.textAlign = 'left';
      g.globalAlpha = p;
      g.fillStyle = accent;
      g.font = `700 ${360 * u}px ${FONT}`;
      g.fillText('“', x0 - 150 * u, H * 0.3 + (1 - p) * 30 * u);
      g.font = `500 ${76 * u}px ${FONT}`;
      const lines = wrap(g, sc.title || '', W - 2 * x0);
      const lh = 96 * u;
      let y = H / 2 - (lines.length * lh) / 2 - 20 * u;
      g.fillStyle = ink;
      lines.forEach((l, i) => {
        const a = easeInOut(clamp((t - 0.2 - i * 0.28) / 0.6, 0, 1));
        g.globalAlpha = a;
        g.fillText(l, x0, y + lh / 2 + (1 - a) * 20 * u);
        y += lh;
      });
      if (sc.subtitle) {
        const a = easeInOut(clamp((t - 0.4 - lines.length * 0.28) / 0.6, 0, 1));
        g.globalAlpha = a;
        g.fillStyle = accent;
        g.fillRect(x0, y + 40 * u, 90 * u * a, 8 * u);
        g.fillStyle = ink;
        g.font = `400 ${40 * u}px ${FONT}`;
        g.fillText(sc.subtitle, x0 + 110 * u, y + 44 * u);
      }
      g.globalAlpha = 1;
      return;
    }

    if (layout === 'lower') {
      const x0 = 140 * u;
      g.textAlign = 'left';
      g.globalAlpha = p;
      g.fillStyle = accent;
      g.fillRect(x0, H - 330 * u, 160 * u * p, 10 * u);
      g.fillStyle = ink;
      g.font = `700 ${104 * u}px ${FONT}`;
      g.fillText((sc.title || '').toUpperCase(), x0 + (1 - p) * -40 * u, H - 250 * u);
      g.globalAlpha = p2;
      g.font = `400 ${44 * u}px ${FONT}`;
      g.fillText(sc.subtitle || '', x0, H - 170 * u);
      g.globalAlpha = 1;
      return;
    }

    // 'title' and 'chapter' are centred
    g.textAlign = 'center';
    const kick = layout === 'chapter' ? sc.kicker || '01' : sc.kicker;
    g.font = `700 ${124 * u}px ${FONT}`;
    const lines = sc.title ? wrap(g, sc.title.toUpperCase(), W - 320 * u) : [];
    g.font = `400 ${48 * u}px ${FONT}`;
    const sub = sc.subtitle ? wrap(g, sc.subtitle, W - 420 * u) : [];
    const kickH = kick ? (layout === 'chapter' ? 230 : 70) * u : 0;
    const blockH = kickH + lines.length * 130 * u + (sub.length ? 30 * u + sub.length * 60 * u : 0);
    const cy = hasImg ? H * 0.7 : H * 0.5;
    let y = cy - blockH / 2;
    if (kick) {
      g.globalAlpha = p;
      g.fillStyle = layout === 'chapter' ? accent : ink;
      let ks = 220 * u;
      if (layout === 'chapter') {
        g.font = `700 ${ks}px ${FONT}`;
        ks *= Math.min(1, (W - 300 * u) / Math.max(1, g.measureText(kick).width));
      }
      g.font = layout === 'chapter' ? `700 ${ks}px ${FONT}` : `500 ${44 * u}px ${FONT}`;
      g.fillText(layout === 'chapter' ? kick : kick.toUpperCase(), W / 2, y + kickH / 2 - (1 - p) * 30 * u);
      y += kickH;
    } else {
      g.globalAlpha = p;
      g.fillStyle = accent;
      const bw = 240 * u * p;
      g.fillRect(W / 2 - bw / 2, y - 46 * u, bw, 12 * u);
    }
    g.globalAlpha = kick ? p2 : p;
    g.fillStyle = ink;
    g.font = `700 ${124 * u}px ${FONT}`;
    const pa = kick ? p2 : p;
    for (const l of lines) {
      g.fillText(l, W / 2, y + 65 * u + (1 - pa) * 40 * u);
      y += 130 * u;
    }
    g.globalAlpha = kick ? p3 : p2;
    g.font = `400 ${48 * u}px ${FONT}`;
    y += 30 * u;
    for (const l of sub) {
      g.fillText(l, W / 2, y + 30 * u + (1 - (kick ? p3 : p2)) * 30 * u);
      y += 60 * u;
    }
    g.globalAlpha = 1;
  }

  // ---------- charts ----------

  drawChart(project, sc, t) {
    const g = this.g;
    const { W, H, u } = this;
    const bg = sc.bg || '#e8dfc8';
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    this.paperBands(bg);
    const dark = luminance(bg) < 0.5;
    const ink = dark ? '#f6f1e4' : '#1d2621';
    const muted = dark ? 'rgba(246,241,228,0.55)' : 'rgba(29,38,33,0.55)';
    const accent = project.teams.home.color;
    const p = easeInOut(clamp(t / 0.8, 0, 1));
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.globalAlpha = p;
    g.fillStyle = accent;
    g.fillRect(140 * u, 110 * u, 120 * u * p, 10 * u);
    g.fillStyle = ink;
    g.font = `700 ${76 * u}px ${FONT}`;
    g.fillText((sc.title || '').toUpperCase(), 140 * u, 180 * u + (1 - p) * 20 * u);
    g.globalAlpha = 1;

    const rows = parseChart(sc.data);
    if (!rows.length) return;
    const anyHi = rows.some((r) => r.hi);
    const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-6);
    g.font = `500 ${40 * u}px ${FONT}`;
    const labelW = Math.max(...rows.map((r) => g.measureText(r.label.toUpperCase()).width));
    const x0 = 140 * u + labelW + 30 * u;
    const x1 = W - 260 * u;
    const top = 280 * u;
    const rowH = Math.min(96 * u, (H - top - 170 * u) / rows.length);
    const barH = rowH * 0.62;
    rows.forEach((r, i) => {
      const a = easeInOut(clamp((t - 0.3 - i * 0.12) / 0.9, 0, 1));
      const y = top + i * rowH + rowH / 2;
      const col = anyHi ? (r.hi ? accent : dark ? '#6f7d74' : '#8d9a90') : accent;
      g.globalAlpha = clamp(a * 3, 0, 1);
      g.fillStyle = r.hi || !anyHi ? ink : muted;
      g.textAlign = 'right';
      g.font = `${r.hi ? 700 : 500} ${40 * u}px ${FONT}`;
      g.fillText(r.label.toUpperCase(), x0 - 30 * u, y);
      const w = ((x1 - x0) * Math.abs(r.value)) / max * a;
      g.fillStyle = col;
      g.fillRect(x0, y - barH / 2, w, barH);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x0, y + barH / 2 - 5 * u, w, 5 * u);
      g.textAlign = 'left';
      g.fillStyle = ink;
      g.font = `700 ${40 * u}px ${FONT}`;
      g.fillText((r.value * a).toFixed(r.decimals) + (sc.unit || ''), x0 + w + 18 * u, y);
    });
    g.globalAlpha = 1;
    if (sc.subtitle) {
      g.textAlign = 'left';
      g.fillStyle = muted;
      g.font = `400 ${32 * u}px ${FONT}`;
      g.fillText(sc.subtitle, 140 * u, H - 90 * u);
    }
  }

  // ---------- pitch ----------

  drawPitch() {
    const g = this.g;
    const v = this.v;
    const L = PITCH.w;
    const Wd = PITCH.h;
    g.fillStyle = '#2c5a35';
    if (this.path([[-60, -80], [165, -80], [165, 148], [-60, 148]], true)) g.fill();
    const stripes = 14;
    const sw = (L + 16) / stripes;
    for (let i = 0; i < stripes; i++) {
      const x = -8 + i * sw;
      g.fillStyle = i % 2 ? '#3b7245' : '#417a4b';
      if (this.path([[x, -8], [x + sw + 0.03, -8], [x + sw + 0.03, Wd + 8], [x, Wd + 8]], true)) g.fill();
    }
    g.strokeStyle = LINE;
    g.setLineDash([]);
    g.lineCap = 'butt';
    const lw = (x, y) => (g.lineWidth = 0.22 * v.k(x, y));
    const stroke = (pts, closed, x, y) => {
      if (this.path(pts, closed)) {
        lw(x, y);
        g.stroke();
      }
    };
    const rect = (x, y, w, h) => stroke([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, x + w / 2, y + h / 2);
    const spot = (x, y) => {
      if (v.depth(x, y) < NEAR) return;
      g.save();
      g.setTransform(...v.ground(x, y));
      g.fillStyle = LINE;
      g.beginPath();
      g.arc(0, 0, 0.3, 0, TAU);
      g.fill();
      g.restore();
    };
    const D = Math.acos(5.5 / 9.15);
    rect(0, 0, L, Wd);
    stroke([[L / 2, 0], [L / 2, Wd]], false, L / 2, Wd / 2);
    stroke(circle(L / 2, Wd / 2, 9.15), false, L / 2, Wd / 2);
    spot(L / 2, Wd / 2);
    rect(0, 13.84, 16.5, 40.32);
    rect(0, 24.84, 5.5, 18.32);
    spot(11, 34);
    stroke(circle(11, 34, 9.15, -D, D, 24), false, 18, 34);
    rect(L - 16.5, 13.84, 16.5, 40.32);
    rect(L - 5.5, 24.84, 5.5, 18.32);
    spot(L - 11, 34);
    stroke(circle(L - 11, 34, 9.15, Math.PI - D, Math.PI + D, 24), false, L - 18, 34);
    stroke(circle(0, 0, 1, 0, Math.PI / 2, 8), false, 0, 0);
    stroke(circle(L, 0, 1, Math.PI / 2, Math.PI, 8), false, L, 0);
    stroke(circle(0, Wd, 1, -Math.PI / 2, 0, 8), false, 0, Wd);
    stroke(circle(L, Wd, 1, Math.PI, Math.PI * 1.5, 8), false, L, Wd);
    this.drawGoal(0, -1);
    this.drawGoal(L, 1);
  }

  // 3D goal frame: posts, crossbar and net lines.
  drawGoal(x, dir) {
    const g = this.g;
    const v = this.v;
    const y1 = 30.34;
    const y2 = 37.66;
    const hgt = 2.44;
    const back = x + dir * 2;
    if (v.depth(x, 34) < NEAR) return;
    const P = (px, py, pz) => v.project(px, py, pz);
    const seg = (a, b) => {
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    };
    const k = v.k(x, 34);
    g.strokeStyle = 'rgba(236,230,211,0.55)';
    g.lineWidth = 0.1 * k;
    for (let i = 0; i <= 6; i++) {
      const yy = y1 + ((y2 - y1) * i) / 6;
      seg(P(x, yy, hgt), P(back, yy, 0));
    }
    seg(P(back, y1, 0), P(back, y2, 0));
    seg(P(x, y1, hgt), P(back, y1, 0));
    seg(P(x, y2, hgt), P(back, y2, 0));
    g.strokeStyle = '#f4f1e6';
    g.lineWidth = 0.24 * k;
    seg(P(x, y1, 0), P(x, y1, hgt));
    seg(P(x, y2, 0), P(x, y2, hgt));
    seg(P(x, y1, hgt), P(x, y2, hgt));
  }

  drawPitchScene(project, sc, t, o) {
    const g = this.g;
    const cam = this.camAt(sc, t, o.useCamera !== false);
    const v = (this.v = new View(this.W, this.H, this.base, cam));
    g.fillStyle = '#244a2c';
    g.fillRect(0, 0, this.W, this.H);
    this.drawPitch();

    const alphaFor = (ob) => (o.editor ? (inWindow(ob, t) ? 1 : 0.15) : alphaAt(ob, t));
    const list = [...sc.objects].sort((a, b) => LAYER[a.type] - LAYER[b.type]);
    let trailsDone = false;
    for (const ob of list) {
      if (!trailsDone && LAYER[ob.type] >= LAYER.player) {
        trailsDone = true;
        for (const p of sc.objects) {
          if (p.type !== 'player' || !p.trail) continue;
          const a = alphaFor(p);
          if (a > 0) this.drawTrail(project, p, t, a);
        }
      }
      let a = alphaFor(ob);
      if (ob.type === 'spot' && o.editor) a *= 0.45;
      if (a <= 0) continue;
      g.save();
      g.globalAlpha = a;
      this.drawObj(project, sc, ob, t, o, false);
      g.restore();
    }
    if (v.tilt > 3) {
      const haze = g.createLinearGradient(0, 0, 0, this.H * 0.45);
      haze.addColorStop(0, `rgba(14,28,19,${0.55 * v.st})`);
      haze.addColorStop(1, 'rgba(14,28,19,0)');
      g.fillStyle = haze;
      g.fillRect(0, 0, this.W, this.H * 0.45);
    }
    if (o.temp) {
      g.save();
      g.globalAlpha = 0.85;
      if (o.temp.type === 'camrect') {
        g.setLineDash([10 * this.u, 7 * this.u]);
        g.lineWidth = 3 * this.u;
        g.strokeStyle = SEL;
        const r = o.temp;
        if (this.path([[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], true)) g.stroke();
      } else this.drawObj(project, sc, o.temp, t, o, true);
      g.restore();
    }
    if (o.editor) this.drawEditorOverlay(sc, t, o, cam);
  }

  drawTrail(project, p, t, a) {
    const g = this.g;
    const t0 = Math.max(p.in || 0, p.kf[0].t, t - 6);
    if (t - t0 < 0.1) return;
    const pts = [];
    for (let s = t0; s <= t; s += 1 / 20) {
      const q = sampleKF(p.kf, s);
      pts.push([q.x, q.y]);
    }
    const q = sampleKF(p.kf, t);
    pts.push([q.x, q.y]);
    const col = p.color || project.teams[p.team]?.color || '#fff';
    const k = this.v.k(q.x, q.y);
    g.save();
    g.globalAlpha = a * 0.85;
    g.strokeStyle = col;
    g.lineWidth = 0.3 * k;
    g.lineCap = 'round';
    g.setLineDash([0.7 * k, 0.55 * k]);
    if (this.path(pts)) g.stroke();
    g.restore();
  }

  drawEditorOverlay(sc, t, o, cam) {
    const g = this.g;
    const v = this.v;
    const u = this.u;
    g.save();
    g.lineWidth = 2.5 * u;
    for (const id of o.sel || []) {
      const ob = sc.objects.find((x) => x.id === id);
      if (!ob) continue;
      g.strokeStyle = SEL;
      g.setLineDash([8 * u, 5 * u]);
      if (ob.kf) {
        const p = sampleKF(ob.kf, t);
        if (ob.kf.length > 1) {
          const t0 = ob.kf[0].t;
          const t1 = ob.kf[ob.kf.length - 1].t;
          const pts = [];
          for (let i = 0; i <= 40; i++) {
            const q = sampleKF(ob.kf, t0 + ((t1 - t0) * i) / 40);
            pts.push([q.x, q.y]);
          }
          g.save();
          g.strokeStyle = 'rgba(90,209,255,0.6)';
          g.setLineDash([4 * u, 4 * u]);
          if (this.path(pts)) g.stroke();
          g.fillStyle = SEL;
          for (const k of ob.kf) {
            const [X, Y] = v.project(k.x, k.y);
            g.beginPath();
            g.arc(X, Y, 4 * u, 0, TAU);
            g.fill();
          }
          g.restore();
        }
        if (this.path(circle(p.x, p.y, ob.type === 'ball' ? 1.3 : 2.2, 0, TAU, 40), true)) g.stroke();
      } else if (ob.type === 'zone') {
        const pts = ob.shape === 'ellipse'
          ? circle(0, 0, 1, 0, TAU, 64).map(([x, y]) => [ob.x + ob.w / 2 + (x * (ob.w + 0.8)) / 2, ob.y + ob.h / 2 + (y * (ob.h + 0.8)) / 2])
          : [[ob.x - 0.4, ob.y - 0.4], [ob.x + ob.w + 0.4, ob.y - 0.4], [ob.x + ob.w + 0.4, ob.y + ob.h + 0.4], [ob.x - 0.4, ob.y + ob.h + 0.4]];
        if (this.path(pts, true)) g.stroke();
      } else if (ob.type === 'text') {
        const r = this.textRect(ob);
        if (r) g.strokeRect(r.x - 6 * u, r.y - 4 * u, r.w + 12 * u, r.h + 8 * u);
      } else if (ob.type === 'chain') {
        if (this.path(chainPts(sc, ob, t), !!ob.fill)) g.stroke();
      } else if (ob.type === 'shadow') {
        const pts = this.shadowPts(sc, ob, t);
        if (pts && this.path(pts, true)) g.stroke();
      } else if (ob.type === 'spot') {
        const c = this.spotCenter(sc, ob, t);
        if (this.path(circle(c.x, c.y, ob.r || 7), true)) g.stroke();
      }
      if ((o.sel || []).length === 1) {
        g.setLineDash([]);
        for (const h of handlesFor(ob)) {
          const [X, Y] = v.project(h.x, h.y);
          g.fillStyle = SEL;
          g.strokeStyle = '#fff';
          g.beginPath();
          g.arc(X, Y, 9 * u, 0, TAU);
          g.fill();
          g.stroke();
        }
      }
    }
    if (o.useCamera === false && sc.camera?.length) {
      // footprint of the real camera on the ground
      const real = new View(this.W, this.H, this.base, sampleKF(sc.camera, t, CAM_KEYS));
      const pts = [];
      const N = 12;
      const edge = (x0, y0, x1, y1) => {
        for (let i = 0; i < N; i++) {
          const q = real.unproject(x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * i) / N);
          if (q) pts.push([q.x, q.y]);
        }
      };
      const top = real.tilt > 0 ? this.H * 0.02 : 0;
      edge(0, top, this.W, top);
      edge(this.W, top, this.W, this.H);
      edge(this.W, this.H, 0, this.H);
      edge(0, this.H, 0, top);
      g.setLineDash([14 * u, 8 * u]);
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 3 * u;
      if (pts.length > 2 && this.path(pts, true)) g.stroke();
      if (pts.length) {
        const [X, Y] = v.project(pts[0][0], pts[0][1]);
        g.fillStyle = '#fff';
        g.font = `600 ${20 * u}px ${FONT}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(`CAMERA  ${real.zoom.toFixed(1)}×  tilt ${Math.round(real.tilt)}°`, X + 8 * u, Y + 8 * u);
      }
    }
    g.restore();
  }

  spotCenter(sc, ob, t) {
    return (ob.pid && objPos(sc, ob.pid, t)) || { x: ob.x, y: ob.y };
  }

  shadowPts(sc, ob, t) {
    const P = objPos(sc, ob.pid, t);
    const B = objPos(sc, ob.bid || firstBall(sc)?.id, t);
    if (!P || !B) return null;
    const dx = P.x - B.x;
    const dy = P.y - B.y;
    const a0 = Math.atan2(dy, dx);
    const sp = ((ob.spread || 30) * DEG) / 2;
    const len = ob.len || 14;
    const pts = [[P.x, P.y]];
    for (let i = 0; i <= 16; i++) {
      const a = a0 - sp + (2 * sp * i) / 16;
      pts.push([P.x + Math.cos(a) * len, P.y + Math.sin(a) * len]);
    }
    return pts;
  }

  // Screen rectangle of a text label (billboard).
  textRect(ob) {
    const [X, Y, k, d] = this.v.project(ob.x, ob.y, 0);
    if (d < NEAR) return null;
    const size = ob.size || 3;
    const w = this.measure(String(ob.text || '').toUpperCase(), size) * k;
    const h = size * k * (ob.flat ? this.v.ct : 1);
    return { x: X - w / 2, y: Y - h / 2, w, h };
  }

  drawObj(project, sc, ob, t, o, isTemp) {
    const g = this.g;
    const v = this.v;
    switch (ob.type) {
      case 'player': {
        const p = sampleKF(ob.kf, t);
        if (v.depth(p.x, p.y) < NEAR) return;
        const team = project.teams[ob.team] || project.teams.home;
        const col = ob.color || team.color;
        const edge = shade(col, -0.45);
        const r = 1.35;
        g.save();
        g.setTransform(...v.ground(p.x + 0.3, p.y + 0.45));
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.beginPath();
        g.arc(0, 0, r * 1.02, 0, TAU);
        g.fill();
        if (ob.highlight) {
          g.setTransform(...v.ground(p.x, p.y));
          const pulse = 1 + 0.12 * Math.sin(t * 6);
          g.beginPath();
          g.arc(0, 0, (r + 0.95) * pulse, 0, TAU);
          g.fillStyle = 'rgba(242,193,78,0.22)';
          g.fill();
          g.strokeStyle = ACCENT;
          g.lineWidth = 0.3;
          g.stroke();
        }
        // puck side, then top face
        g.fillStyle = edge;
        for (const z of [0, PUCK_H * 0.5]) {
          g.setTransform(...v.flat(p.x, p.y, z));
          g.beginPath();
          g.arc(0, 0, r, 0, TAU);
          g.fill();
        }
        g.setTransform(...v.flat(p.x, p.y, PUCK_H));
        g.fillStyle = col;
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.fill();
        const img = ob.photo && this.image(project.assets?.[ob.photo]);
        if (img) {
          g.save();
          g.beginPath();
          g.arc(0, 0, r - 0.2, 0, TAU);
          g.clip();
          const s = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight);
          g.drawImage(img, (-img.naturalWidth * s) / 2, (-img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
          g.restore();
          g.lineWidth = 0.3;
          g.strokeStyle = col;
          g.beginPath();
          g.arc(0, 0, r - 0.12, 0, TAU);
          g.stroke();
        } else {
          g.fillStyle = 'rgba(255,255,255,0.13)';
          g.beginPath();
          g.arc(0, 0, r - 0.14, Math.PI * 1.05, Math.PI * 1.95);
          g.fill();
          // numbers: foreshortened like the disc, but without perspective skew so they stay upright
          const [m0, m1, m2, m3, mx, my] = v.flat(p.x, p.y, PUCK_H);
          g.save();
          g.setTransform(Math.hypot(m0, m1), 0, 0, Math.hypot(m2, m3), mx, my);
          this.text(String(ob.num ?? ''), 0, 0.06, 1.45, { fill: team.text || '#fff' });
          g.restore();
        }
        g.lineWidth = 0.2;
        g.strokeStyle = edge;
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.stroke();
        if (ob.name) {
          const [X, Y, k] = v.project(p.x, p.y, PUCK_H);
          g.setTransform(k, 0, 0, k, X, Y);
          const label = ob.name.toUpperCase();
          const tw = this.measure(label, 1.1, 600);
          const y = r * v.ct + 1.3;
          g.fillStyle = 'rgba(16,20,18,0.82)';
          g.beginPath();
          g.roundRect(-tw / 2 - 0.45, y - 0.78, tw + 0.9, 1.56, 0.35);
          g.fill();
          this.text(label, 0, y + 0.03, 1.1, { weight: 600, fill: '#fff' });
        }
        g.restore();
        break;
      }
      case 'ball': {
        const p = sampleKF(ob.kf, t);
        if (v.depth(p.x, p.y) < NEAR) return;
        g.save();
        g.setTransform(...v.ground(p.x + 0.2, p.y + 0.3));
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.arc(0, 0, 0.6, 0, TAU);
        g.fill();
        const [X, Y, k] = v.project(p.x, p.y, 0.4);
        g.setTransform(k, 0, 0, k, X, Y);
        g.fillStyle = '#fbfaf5';
        g.beginPath();
        g.arc(0, 0, 0.62, 0, TAU);
        g.fill();
        g.lineWidth = 0.14;
        g.strokeStyle = '#1b1b1b';
        g.stroke();
        g.fillStyle = '#1b1b1b';
        g.beginPath();
        g.arc(0, 0, 0.2, 0, TAU);
        g.fill();
        g.restore();
        break;
      }
      case 'arrow': {
        let p = 1;
        if (!o.editor && !isTemp) p = easeInOut(clamp((t - (ob.in || 0)) / Math.max(0.01, ob.dur || 0.8), 0, 1));
        if (p <= 0) return;
        const pts = arrowPath(ob, p);
        const mid = pts[Math.floor(pts.length / 2)];
        const k = v.k(mid[0], mid[1]);
        const col = ob.color || STYLE_COLORS[ob.style] || '#fff';
        const lw = ob.style === 'run' ? 0.5 : ob.style === 'line' || ob.style === 'measure' ? 0.3 : 0.38;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.setLineDash(ob.style === 'pass' ? [1.1 * k, 0.8 * k] : []);
        g.lineWidth = lw * k;
        const sp = v.clip(pts, false);
        const stroke = (dx, dy, c) => {
          g.strokeStyle = c;
          g.beginPath();
          sp.forEach(([X, Y], i) => (i ? g.lineTo(X + dx, Y + dy) : g.moveTo(X + dx, Y + dy)));
          g.stroke();
        };
        stroke(0.18 * k, 0.24 * k, 'rgba(0,0,0,0.25)');
        stroke(0, 0, col);
        g.setLineDash([]);
        const head = (tip, from, sz) => {
          const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
          const tri = [
            [tip[0] + Math.cos(ang) * sz * 0.35, tip[1] + Math.sin(ang) * sz * 0.35],
            [tip[0] + Math.cos(ang + 2.6) * sz, tip[1] + Math.sin(ang + 2.6) * sz],
            [tip[0] + Math.cos(ang - 2.6) * sz, tip[1] + Math.sin(ang - 2.6) * sz],
          ];
          g.fillStyle = col;
          if (this.path(tri, true)) g.fill();
        };
        if (ob.style !== 'line' && pts.length > 2) head(pts[pts.length - 1], pts[Math.max(0, pts.length - 5)], ob.style === 'measure' ? 1 : 1.5);
        if (ob.style === 'measure' && pts.length > 2) {
          head(pts[0], pts[Math.min(pts.length - 1, 4)], 1);
          if (p >= 1) {
            const dist = Math.round(Math.hypot(ob.x2 - ob.x1, ob.y2 - ob.y1));
            const [X, Y, kk] = v.project(mid[0], mid[1], 0);
            g.setTransform(kk, 0, 0, kk, X, Y - 1.6 * kk);
            const label = `${dist} M`;
            const tw = this.measure(label, 1.5);
            g.fillStyle = 'rgba(16,20,18,0.85)';
            g.beginPath();
            g.roundRect(-tw / 2 - 0.6, -1, tw + 1.2, 2, 0.4);
            g.fill();
            this.text(label, 0, 0.05, 1.5, { fill: '#fff' });
          }
        }
        break;
      }
      case 'chain': {
        const pts = chainPts(sc, ob, t);
        if (pts.length < 2) return;
        const c = pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length], [0, 0]);
        const k = v.k(c[0], c[1]);
        const col = ob.color || '#fff';
        g.lineCap = 'round';
        g.lineJoin = 'round';
        if (ob.fill && pts.length > 2 && this.path(pts, true)) {
          g.fillStyle = withAlpha(col, 0.2);
          g.fill();
        }
        if (this.path(pts, !!ob.fill && pts.length > 2)) {
          g.lineWidth = 0.32 * k;
          g.strokeStyle = col;
          g.stroke();
        }
        break;
      }
      case 'shadow': {
        const pts = this.shadowPts(sc, ob, t);
        if (!pts || !this.path(pts, true)) return;
        const [X0, Y0] = v.project(pts[0][0], pts[0][1]);
        const far = pts[9];
        const [X1, Y1] = v.project(far[0], far[1]);
        const grad = g.createLinearGradient(X0, Y0, X1, Y1);
        grad.addColorStop(0, 'rgba(8,12,10,0.6)');
        grad.addColorStop(0.7, 'rgba(8,12,10,0.32)');
        grad.addColorStop(1, 'rgba(8,12,10,0.08)');
        g.fillStyle = grad;
        g.fill();
        g.strokeStyle = 'rgba(8,12,10,0.35)';
        g.lineWidth = 0.15 * v.k(pts[0][0], pts[0][1]);
        g.setLineDash([]);
        g.stroke();
        break;
      }
      case 'spot': {
        const c = this.spotCenter(sc, ob, t);
        const sp = v.clip(circle(c.x, c.y, ob.r || 7), true);
        if (sp.length < 3) return;
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.beginPath();
        g.rect(0, 0, this.W, this.H);
        sp.forEach(([X, Y], i) => (i ? g.lineTo(X, Y) : g.moveTo(X, Y)));
        g.closePath();
        g.fillStyle = `rgba(6,10,8,${ob.dim ?? 0.55})`;
        g.fill('evenodd');
        g.beginPath();
        sp.forEach(([X, Y], i) => (i ? g.lineTo(X, Y) : g.moveTo(X, Y)));
        g.closePath();
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 0.22 * v.k(c.x, c.y);
        g.stroke();
        g.restore();
        break;
      }
      case 'zone': {
        const col = ob.color || ACCENT;
        let s = 1;
        if (!o.editor && !isTemp && ob.in > 0) s = 0.85 + 0.15 * easeInOut(clamp((t - ob.in) / 0.4, 0, 1));
        const cx = ob.x + ob.w / 2;
        const cy = ob.y + ob.h / 2;
        const hw = (ob.w / 2) * s;
        const hh = (ob.h / 2) * s;
        const pts = ob.shape === 'ellipse'
          ? circle(0, 0, 1, 0, TAU, 72).map(([x, y]) => [cx + x * hw, cy + y * hh])
          : [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]];
        if (!this.path(pts, true)) return;
        const k = v.k(cx, cy);
        g.fillStyle = withAlpha(col, 0.26);
        g.fill();
        g.setLineDash([0.9 * k, 0.6 * k]);
        g.lineWidth = 0.28 * k;
        g.strokeStyle = col;
        g.stroke();
        g.setLineDash([]);
        break;
      }
      case 'text': {
        if (v.depth(ob.x, ob.y) < NEAR) return;
        const size = ob.size || 3;
        if (ob.flat) g.setTransform(...v.flat(ob.x, ob.y));
        else {
          const [X, Y, k] = v.project(ob.x, ob.y);
          g.setTransform(k, 0, 0, k, X, Y);
        }
        this.text(String(ob.text || '').toUpperCase(), 0, 0, size, {
          fill: ob.color || '#fff', stroke: 'rgba(15,20,17,0.85)', strokeW: size * 0.14,
        });
        g.setTransform(1, 0, 0, 1, 0, 0);
        break;
      }
    }
  }

  // ---------- hit testing (screen space) ----------

  hitTest(project, sc, t, X, Y, useCamera) {
    const v = (this.v = this.viewFor(sc, t, useCamera));
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const order = { text: 0, ball: 1, player: 2, spot: 3, arrow: 4, chain: 5, shadow: 6, zone: 7 };
    const tol = 12 * this.u;
    const polyDist = (sp) => {
      let best = Infinity;
      for (let i = 0; i < sp.length - 1; i++) {
        const [ax, ay] = sp[i];
        const [bx, by] = sp[i + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const L = dx * dx + dy * dy || 1;
        const q = clamp(((X - ax) * dx + (Y - ay) * dy) / L, 0, 1);
        best = Math.min(best, Math.hypot(ax + q * dx - X, ay + q * dy - Y));
      }
      return best;
    };
    const inPoly = (pts) => this.path(pts, true) && g.isPointInPath(X, Y);
    const hit = (o) => {
      switch (o.type) {
        case 'player':
        case 'ball': {
          const p = sampleKF(o.kf, t);
          const [px, py, k] = v.project(p.x, p.y, o.type === 'player' ? PUCK_H : 0.4);
          return Math.hypot(px - X, py - Y) < (o.type === 'ball' ? 1.1 : 1.8) * k + 3 * this.u;
        }
        case 'text': {
          const r = this.textRect(o);
          return r && X >= r.x - 6 && X <= r.x + r.w + 6 && Y >= r.y - 6 && Y <= r.y + r.h + 6;
        }
        case 'arrow':
          return polyDist(v.clip(arrowPath(o, 1), false)) < tol;
        case 'chain': {
          const pts = chainPts(sc, o, t);
          if (o.fill && pts.length > 2 && inPoly(pts)) return true;
          return pts.length > 1 && polyDist(v.clip(pts, !!o.fill)) < tol;
        }
        case 'shadow': {
          const pts = this.shadowPts(sc, o, t);
          return pts && inPoly(pts);
        }
        case 'spot': {
          const c = this.spotCenter(sc, o, t);
          return polyDist(v.clip(circle(c.x, c.y, o.r || 7), true)) < tol;
        }
        case 'zone': {
          const pts = o.shape === 'ellipse'
            ? circle(0, 0, 1, 0, TAU, 48).map(([x, y]) => [o.x + o.w / 2 + (x * o.w) / 2, o.y + o.h / 2 + (y * o.h) / 2])
            : [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
          return inPoly(pts);
        }
      }
      return false;
    };
    const list = [...sc.objects].sort((a, b) => order[a.type] - order[b.type]);
    for (const visible of [true, false]) {
      for (const o of list) if (inWindow(o, t) === visible && hit(o)) return o;
    }
    return null;
  }

  handleAt(sc, t, obj, X, Y, useCamera) {
    const v = this.viewFor(sc, t, useCamera);
    for (const h of handlesFor(obj)) {
      const [hx, hy] = v.project(h.x, h.y);
      if (Math.hypot(hx - X, hy - Y) < 14 * this.u) return h;
    }
    return null;
  }
}
