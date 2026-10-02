// Video export.
//  • Pro path (Chrome/Edge): frame-by-frame rendering + WebCodecs H.264/AAC → MP4.
//    Any resolution (1080p, 1440p, 4K), 30/60 fps, no dropped frames, correct duration.
//  • Fallback: real-time canvas capture + MediaRecorder.
// Also PNG snapshots and SRT subtitles.
import { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } from '../vendor/mp4-muxer.mjs';
import { Renderer } from './renderer.js';

export const RESOLUTIONS = {
  '720p': [1280, 720],
  '1080p': [1920, 1080],
  '1440p': [2560, 1440],
  '4k': [3840, 2160],
};

export function projectDuration(project) {
  return project.scenes.reduce((s, sc) => s + sc.duration, 0);
}

export function locate(project, T) {
  let acc = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const d = project.scenes[i].duration;
    if (T < acc + d || i === project.scenes.length - 1) return { si: i, t: Math.min(T - acc, d) };
    acc += d;
  }
  return { si: 0, t: 0 };
}

// Draw the frame at project time T (handles scene transitions).
export function renderAt(renderer, project, T) {
  const { si, t } = locate(project, T);
  const sc = project.scenes[si];
  const prev = si > 0 ? { scene: project.scenes[si - 1], t: project.scenes[si - 1].duration } : null;
  renderer.draw(project, sc, t, { showCaptions: project.showCaptions, useCamera: true, prev });
}

export const supportsWebCodecs = () => typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';

async function pickVideoConfig(width, height, fps, bitrate) {
  const px = width * height * fps;
  const levels = px <= 1920 * 1080 * 30 ? ['28', '2a', '32', '33'] : px <= 1920 * 1080 * 60 ? ['2a', '32', '33'] : px <= 2560 * 1440 * 60 ? ['32', '33', '34'] : ['33', '34'];
  const candidates = [
    ...levels.map((l) => ({ codec: `avc1.6400${l}`, mux: 'avc', avc: { format: 'avc' } })),
    { codec: 'vp09.00.51.08', mux: 'vp9' },
    { codec: 'av01.0.12M.08', mux: 'av1' },
  ];
  for (const c of candidates) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const config = { codec: c.codec, width, height, bitrate, framerate: fps, hardwareAcceleration, ...(c.avc ? { avc: c.avc } : {}) };
      try {
        const r = await VideoEncoder.isConfigSupported(config);
        if (r.supported) return { config, mux: c.mux };
      } catch { /* try next */ }
    }
  }
  throw new Error('No supported video encoder found in this browser.');
}

async function pickAudioConfig(sampleRate) {
  if (typeof window.AudioEncoder !== 'function') return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const config = { codec, sampleRate, numberOfChannels: 2, bitrate: 192000 };
    try {
      if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, mux };
    } catch { /* next */ }
  }
  return null;
}

/**
 * Frame-accurate export.
 * @param {object} o { project, audio, width, height, fps, bitrate, onProgress(p, info), signal, fileHandle, images }
 * fileHandle: optional FileSystemFileHandle — streams to disk (no memory limit).
 */
export async function exportPro(o) {
  const { project, audio, width, height, fps = 30, onProgress, signal, fileHandle } = o;
  const bitrate = o.bitrate || Math.round(width * height * fps * 0.2);
  const total = projectDuration(project);
  const nFrames = Math.max(1, Math.round(total * fps));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new Renderer(canvas);
  if (o.images) renderer.images = o.images;
  await document.fonts?.ready;
  await renderer.loadImages(project);

  onProgress?.(0, { phase: 'Mixing audio…' });
  const sampleRate = 48000;
  const mix = await audio.renderMix(project, total, sampleRate);
  const vcfg = await pickVideoConfig(width, height, fps, bitrate);
  const acfg = await pickAudioConfig(sampleRate);

  let writable = null;
  let target;
  if (fileHandle) {
    writable = await fileHandle.createWritable();
    target = new FileSystemWritableFileStreamTarget(writable);
  } else target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: vcfg.mux, width, height, frameRate: fps },
    ...(acfg ? { audio: { codec: acfg.mux, numberOfChannels: 2, sampleRate } } : {}),
    fastStart: fileHandle ? false : 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failed = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failed = e),
  });
  venc.configure(vcfg.config);

  if (acfg) {
    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => (failed = e),
    });
    aenc.configure(acfg.config);
    const L = mix.getChannelData(0);
    const R = mix.getChannelData(1);
    const block = 4096;
    for (let i = 0; i < mix.length; i += block) {
      const n = Math.min(block, mix.length - i);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0);
      data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / sampleRate) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();
  }

  const started = performance.now();
  const frameDur = 1e6 / fps;
  for (let i = 0; i < nFrames; i++) {
    if (signal?.aborted || failed) break;
    renderAt(renderer, project, Math.min(i / fps, total - 1e-4));
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1));
    if (i % 5 === 0) {
      const el = (performance.now() - started) / 1000;
      const eta = (el / (i + 1)) * (nFrames - i - 1);
      onProgress?.((i + 1) / nFrames, { phase: `Rendering frame ${i + 1} / ${nFrames}`, eta, speed: (i + 1) / fps / el });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (failed) throw failed;
  if (signal?.aborted) {
    venc.close();
    if (writable) await writable.abort?.();
    return null;
  }
  await venc.flush();
  venc.close();
  muxer.finalize();
  if (writable) {
    await writable.close();
    return { savedToDisk: true, ext: 'mp4', codec: vcfg.config.codec };
  }
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4', codec: vcfg.config.codec };
}

// ---------- real-time fallback ----------

function pickMime() {
  const c = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

// Chrome records fragmented MP4 whose header only states the first fragment's length,
// so players show e.g. 0:03 for a 5-minute video. Patch the durations in the moov box.
async function fixMp4Duration(blob, seconds) {
  if (blob.size > 1.5e9) return blob;
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let movieScale = 0;
  const put = (pos, v1, scale) => {
    const d = Math.round(seconds * scale);
    if (v1) dv.setBigUint64(pos, BigInt(d));
    else dv.setUint32(pos, d);
  };
  const walk = (off, end) => {
    while (off + 8 <= end) {
      let size = dv.getUint32(off);
      let hdr = 8;
      if (size === 1) {
        size = Number(dv.getBigUint64(off + 8));
        hdr = 16;
      } else if (size === 0) size = end - off;
      if (size < 8) return;
      const type = String.fromCharCode(...buf.subarray(off + 4, off + 8));
      const v1 = buf[off + hdr] === 1;
      const p = off + hdr + 4; // skip version + flags
      if (type === 'moov' || type === 'trak' || type === 'mdia') walk(off + hdr, off + size);
      else if (type === 'mvhd') {
        movieScale = dv.getUint32(p + (v1 ? 16 : 8));
        put(p + (v1 ? 20 : 12), v1, movieScale);
      } else if (type === 'mdhd') {
        put(p + (v1 ? 20 : 12), v1, dv.getUint32(p + (v1 ? 16 : 8)));
      } else if (type === 'tkhd' && movieScale) {
        put(p + (v1 ? 24 : 16), v1, movieScale);
      }
      off += size;
    }
  };
  try {
    walk(0, buf.length);
    return new Blob([buf], { type: blob.type });
  } catch (e) {
    console.warn('Could not patch MP4 duration', e);
    return blob;
  }
}

export async function exportRealtime({ project, renderer, audio, fps = 30, bitrate = 16e6, onProgress, signal }) {
  if (!window.MediaRecorder) throw new Error('This browser cannot record video. Use Chrome or Edge.');
  const total = projectDuration(project);
  await audio.preload(project);
  await renderer.loadImages(project);
  const ctx = audio.ensure();
  const dest = ctx.createMediaStreamDestination();
  // Keep the audio track producing (silent) samples. With no voiceover/music the track
  // would carry no data, and Chrome's recorder then truncates MP4 or writes empty WebM.
  const keepAlive = ctx.createConstantSource();
  keepAlive.offset.value = 0;
  keepAlive.connect(dest);
  keepAlive.start();
  renderAt(renderer, project, 0);
  const vstream = renderer.canvas.captureStream(fps);
  const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));

  const t0 = ctx.currentTime + 0.3;
  const nodes = audio.schedule(project, 0, 0, true, dest, t0);
  rec.start(500);
  const recStart = performance.now();
  let recEnd = 0;

  await new Promise((resolve) => {
    const loop = () => {
      const T = ctx.currentTime - t0;
      if (signal?.aborted || T >= total) {
        renderAt(renderer, project, Math.max(0, total - 1e-3));
        setTimeout(() => { recEnd = performance.now(); rec.stop(); resolve(); }, 250);
        return;
      }
      renderAt(renderer, project, Math.max(0, T));
      onProgress?.(Math.max(0, T) / total, { phase: 'Recording in real time…' });
      requestAnimationFrame(loop);
    };
    loop();
  });
  await stopped;
  [...nodes, keepAlive].forEach((n) => { try { n.stop(); } catch { /* ignore */ } });
  vstream.getTracks().forEach((t) => t.stop());
  if (signal?.aborted) return null;
  const type = (mimeType || 'video/webm').split(';')[0];
  let blob = new Blob(chunks, { type });
  if (type.includes('mp4')) blob = await fixMp4Duration(blob, (recEnd - recStart) / 1000);
  return { blob, ext: type.includes('mp4') ? 'mp4' : 'webm' };
}

// ---------- stills & subtitles ----------

export async function snapshotPNG(project, scene, t, width, height, images, prev) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const r = new Renderer(canvas);
  if (images) r.images = images;
  await document.fonts?.ready;
  await r.loadImages(project);
  r.draw(project, scene, t, { showCaptions: project.showCaptions, useCamera: true, prev });
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// One subtitle cue per ~12 words, spread evenly across each scene.
export function buildSRT(project) {
  const cues = [];
  let acc = 0;
  for (const sc of project.scenes) {
    const text = (sc.narration || sc.caption || '').trim();
    if (text) {
      const words = text.split(/\s+/);
      const n = Math.ceil(words.length / 12);
      const per = sc.duration / n;
      for (let i = 0; i < n; i++) {
        cues.push({ a: acc + i * per, b: acc + (i + 1) * per - 0.05, text: words.slice(i * 12, (i + 1) * 12).join(' ') });
      }
    }
    acc += sc.duration;
  }
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.a)} --> ${srtTime(c.b)}\n${c.text}\n`).join('\n');
}
