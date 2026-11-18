// 작은 효과음 — 소리 파일 없이 즉석에서 만들어요

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let last = 0;
let muted = load();

function load() {
  try { return localStorage.getItem('physics:muted') === '1'; } catch { return false; }
}

export function isMuted() { return muted; }

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('physics:muted', m ? '1' : '0'); } catch { /* 저장 못 해도 괜찮아요 */ }
}

/** 첫 터치 때 깨워야 브라우저가 소리를 허락해요 */
export function unlock() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch { return; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'triangle', slide = 0.6) {
  if (muted || !ctx || !master || ctx.state !== 'running') return;
  if (!Number.isFinite(freq) || !Number.isFinite(vol) || freq <= 0 || vol <= 0) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function impact(pitch: number, strength: number) {
  const now = performance.now();
  if (now - last < 35) return;
  last = now;
  tone(pitch * (0.9 + Math.random() * 0.2), 0.07 + strength * 0.08, 0.04 + strength * 0.16);
}

export function boom() {
  tone(140, 0.35, 0.35, 'sawtooth', 0.25);
  tone(70, 0.4, 0.3, 'sine', 0.5);
}

export function ding() {
  tone(880, 0.25, 0.2, 'sine', 1);
  setTimeout(() => tone(1320, 0.35, 0.18, 'sine', 1), 110);
}

export function click() {
  tone(660, 0.05, 0.06, 'square', 0.9);
}
