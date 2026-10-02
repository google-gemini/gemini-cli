// Voiceover / music / sound-effect scheduling, and microphone recording.
// The same schedule() runs on the live AudioContext (preview) and on an
// OfflineAudioContext (frame-accurate export).
import { CAM_KEYS, sampleKF } from './model.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.cache = new Map(); // assetId -> AudioBuffer
    this.nodes = [];
    this.rec = null;
  }

  ensure() {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: 48000 });
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async preload(project) {
    const ids = new Set(project.scenes.map((s) => s.audio).filter(Boolean));
    if (project.music) ids.add(project.music);
    const ctx = this.ensure();
    for (const id of ids) {
      if (this.cache.has(id) || !project.assets[id]) continue;
      try {
        const ab = await (await fetch(project.assets[id])).arrayBuffer();
        this.cache.set(id, await ctx.decodeAudioData(ab));
      } catch (e) {
        console.warn('Could not decode audio asset', id, e);
      }
    }
  }

  duration(id) {
    return this.cache.get(id)?.duration ?? null;
  }

  noise(ctx) {
    if (!this._noise || this._noise.sampleRate !== ctx.sampleRate) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noise = b;
    }
    return this._noise;
  }

  whoosh(ctx, out, when, dur, gain) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(350, when);
    bp.frequency.exponentialRampToValueAtTime(2600, when + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(500, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(when, Math.random());
    src.stop(when + dur + 0.05);
    return src;
  }

  tick(ctx, out, when, gain) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, when);
    o.frequency.exponentialRampToValueAtTime(420, when + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + 0.14);
    return o;
  }

  // Sound-effect cues for one scene, as [time, kind] pairs in scene time.
  sfxCues(sc) {
    const cues = [];
    if (sc.transition && sc.transition !== 'cut') cues.push([0, 'whoosh']);
    for (const o of sc.objects || []) {
      if (!(o.in > 0.05)) continue;
      if (o.type === 'arrow') cues.push([o.in, 'swish']);
      else if (['zone', 'text', 'spot', 'shadow'].includes(o.type)) cues.push([o.in, 'tick']);
    }
    const cam = sc.camera || [];
    for (let i = 1; i < cam.length; i++) {
      const a = sampleKF(cam, cam[i - 1].t, CAM_KEYS);
      const b = sampleKF(cam, cam[i].t, CAM_KEYS);
      const big = Math.abs(b.zoom - a.zoom) > 0.25 || Math.abs(b.tilt - a.tilt) > 10 || Math.hypot(b.cx - a.cx, b.cy - a.cy) > 15;
      if (big) cues.push([cam[i - 1].t, 'cam', cam[i].t - cam[i - 1].t]);
    }
    return cues;
  }

  // Schedule voiceover + music + sfx starting at scene `si`, local time `t`.
  schedule(project, si, t, all, dest, when, ctx = this.ensure()) {
    const nodes = [];
    // master limiter: voice + music + sfx never clip
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -3;
    out.knee.value = 0;
    out.ratio.value = 20;
    out.attack.value = 0.002;
    out.release.value = 0.12;
    out.connect(dest);
    let acc = -t;
    const last = all ? project.scenes.length - 1 : si;
    const sfxVol = project.sfx ? project.sfxVolume ?? 0.5 : 0;
    const sfxOut = ctx.createGain();
    sfxOut.gain.value = sfxVol;
    sfxOut.connect(out);
    for (let i = si; i <= last; i++) {
      const sc = project.scenes[i];
      const buf = sc.audio && this.cache.get(sc.audio);
      if (buf) {
        const off = Math.max(0, -acc);
        if (off < buf.duration) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const gain = ctx.createGain();
          gain.gain.value = sc.audioVolume ?? 1;
          src.connect(gain).connect(out);
          src.start(when + Math.max(0, acc), off);
          src.stop(when + acc + sc.duration);
          nodes.push(src);
        }
      }
      if (sfxVol > 0) {
        for (const [ct, kind, len] of this.sfxCues(sc)) {
          const at = acc + ct;
          if (at < 0) continue;
          if (kind === 'whoosh') nodes.push(this.whoosh(ctx, sfxOut, when + at, 0.7, 0.35));
          else if (kind === 'swish') nodes.push(this.whoosh(ctx, sfxOut, when + at, 0.35, 0.12));
          else if (kind === 'cam') nodes.push(this.whoosh(ctx, sfxOut, when + at, Math.min(1.6, Math.max(0.6, len)), 0.18));
          else nodes.push(this.tick(ctx, sfxOut, when + at, 0.12));
        }
      }
      acc += sc.duration;
    }
    const mbuf = project.music && this.cache.get(project.music);
    if (mbuf && acc > 0) {
      let before = 0;
      for (let i = 0; i < si; i++) before += project.scenes[i].duration;
      const src = ctx.createBufferSource();
      src.buffer = mbuf;
      src.loop = true;
      const gain = ctx.createGain();
      const vol = project.musicVolume ?? 0.15;
      gain.gain.setValueAtTime(vol, when);
      if (acc > 2) {
        gain.gain.setValueAtTime(vol, when + acc - 1.5);
        gain.gain.linearRampToValueAtTime(0, when + acc);
      }
      src.connect(gain).connect(out);
      src.start(when, (before + t) % mbuf.duration);
      src.stop(when + acc);
      nodes.push(src);
    }
    return nodes;
  }

  // Render the full project mix offline (for export).
  async renderMix(project, total, sampleRate = 48000) {
    await this.preload(project);
    const octx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * sampleRate)), sampleRate);
    this.schedule(project, 0, 0, true, octx.destination, 0, octx);
    return octx.startRendering();
  }

  play(project, si, t, all) {
    this.stop();
    const ctx = this.ensure();
    this.nodes = this.schedule(project, si, t, all, ctx.destination, ctx.currentTime + 0.02);
  }

  stop() {
    for (const n of this.nodes) {
      try { n.stop(); } catch { /* already stopped */ }
    }
    this.nodes = [];
  }

  async recStart() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
    const chunks = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((resolve) => {
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        resolve(new Blob(chunks, { type: rec.mimeType }));
      };
    });
    rec.start();
    this.rec = { rec, done };
  }

  async recStop() {
    if (!this.rec) return null;
    const { rec, done } = this.rec;
    this.rec = null;
    rec.stop();
    return done;
  }
}
