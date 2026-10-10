// Photo → illustration filters, applied once when an image is added.
//  • poster:  flat colour regions (k-means palette) + ink outlines, like a vector illustration
//  • duotone: three-tone print in dark ink / team colour / paper
//  • none:    unchanged

const INK = [29, 38, 33];

function hexToRgb(hex) {
  let c = String(hex || '#000').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function kmeans(d, k) {
  const samples = [];
  const step = Math.max(1, Math.floor(d.length / 4 / 8000));
  for (let i = 0; i < d.length; i += 4 * step) if (d[i + 3] > 128) samples.push([d[i], d[i + 1], d[i + 2]]);
  if (!samples.length) return [[0, 0, 0]];
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // k-means++ style seeding: start anywhere, then repeatedly take the farthest sample
  const centers = [samples[Math.floor(samples.length / 2)].slice()];
  while (centers.length < k) {
    let best = null;
    let bd = -1;
    for (let i = 0; i < samples.length; i += 3) {
      const s = samples[i];
      const m = Math.min(...centers.map((c) => dist(c, s)));
      if (m > bd) { bd = m; best = s; }
    }
    centers.push(best.slice());
  }
  for (let it = 0; it < 10; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = dist(s, centers[c]);
        if (dd < bd) { bd = dd; bi = c; }
      }
      const a = sum[bi];
      a[0] += s[0]; a[1] += s[1]; a[2] += s[2]; a[3]++;
    }
    sum.forEach((a, c) => { if (a[3]) centers[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  return centers;
}

/**
 * @param {string} src data URL
 * @param {'none'|'poster'|'duotone'} mode
 * @param {{colors?:number, outline?:boolean, accent?:string, paper?:string, max?:number}} opts
 * @returns {Promise<string>} data URL
 */
export async function stylizeImage(src, mode, opts = {}) {
  if (!mode || mode === 'none') return src;
  const img = await loadImage(src);
  const max = opts.max || 1920;
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.filter = `blur(${Math.max(1, Math.round(w / 700))}px)`;
  g.drawImage(img, 0, 0, w, h);
  g.filter = 'none';
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;
  let hasAlpha = false;
  const L = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    L[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (d[i + 3] < 250) hasAlpha = true;
  }

  if (mode === 'poster') {
    const centers = kmeans(d, opts.colors || 7).map((c0) => {
      // push the palette slightly towards flat, saturated print colours
      const m = (c0[0] + c0[1] + c0[2]) / 3;
      return c0.map((v) => Math.max(0, Math.min(255, m + (v - m) * 1.18)));
    });
    for (let i = 0; i < d.length; i += 4) {
      let bi = 0;
      let bd = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const c0 = centers[k];
        const dd = (d[i] - c0[0]) ** 2 + (d[i + 1] - c0[1]) ** 2 + (d[i + 2] - c0[2]) ** 2;
        if (dd < bd) { bd = dd; bi = k; }
      }
      d[i] = centers[bi][0];
      d[i + 1] = centers[bi][1];
      d[i + 2] = centers[bi][2];
    }
  } else if (mode === 'duotone') {
    const dark = INK;
    const mid = hexToRgb(opts.accent || '#d64545');
    const light = hexToRgb(opts.paper || '#e8dfc8');
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const l = Math.round((L[p] / 255) * 5) / 5; // posterize into 6 steps
      const [a, b, t] = l < 0.5 ? [dark, mid, l * 2] : [mid, light, (l - 0.5) * 2];
      d[i] = a[0] + (b[0] - a[0]) * t;
      d[i + 1] = a[1] + (b[1] - a[1]) * t;
      d[i + 2] = a[2] + (b[2] - a[2]) * t;
    }
  }

  if (opts.outline !== false) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const gx = -L[p - w - 1] - 2 * L[p - 1] - L[p + w - 1] + L[p - w + 1] + 2 * L[p + 1] + L[p + w + 1];
        const gy = -L[p - w - 1] - 2 * L[p - w] - L[p - w + 1] + L[p + w - 1] + 2 * L[p + w] + L[p + w + 1];
        const e = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - 60) / 90)) * 0.9;
        if (e > 0) {
          const i = p * 4;
          d[i] += (INK[0] - d[i]) * e;
          d[i + 1] += (INK[1] - d[i + 1]) * e;
          d[i + 2] += (INK[2] - d[i + 2]) * e;
        }
      }
    }
  }
  g.putImageData(id, 0, 0);
  return c.toDataURL(hasAlpha ? 'image/png' : 'image/jpeg', 0.92);
}
