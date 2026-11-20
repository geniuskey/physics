import { D, L, Matter, inZone, type MBody, type Sim, type Vec, type Zone } from './sim';

const { Composite, Constraint } = Matter;

export type Theme = 'sky' | 'space' | 'table' | 'lab' | 'ice' | 'night' | 'void';

export interface View { scale: number; ox: number; oy: number; cw: number; ch: number; dpr: number }

export function fitView(cw: number, ch: number, W: number, H: number, dpr: number): View {
  const scale = Math.min(cw / W, ch / H);
  return { scale, ox: (cw - W * scale) / 2, oy: (ch - H * scale) / 2, cw, ch, dpr };
}

export function toWorld(v: View, sx: number, sy: number): Vec {
  return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale };
}

type Hook = (ctx: CanvasRenderingContext2D, sim: Sim, t: number) => void;

export interface RenderOpts {
  theme: Theme;
  back?: Hook;
  front?: Hook;
  overlay?: Hook;
  shake?: number;
  /** 세상 밖은 그리지 않기 (기본 켜짐) */
  clip?: boolean;
  /** 세상 위쪽으로 이만큼(세상 단위)은 하늘로 보고 그려요 */
  skyAbove?: number;
}

// 별·구름 위치는 고정 (매 프레임 같은 자리)
function seeded(n: number, seed: number) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ x: r(), y: r(), z: r() }));
}
const STARS = seeded(160, 7);

export function render(ctx: CanvasRenderingContext2D, sim: Sim, v: View, o: RenderOpts) {
  const t = performance.now();
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  background(ctx, v, o.theme, t);

  const sx = o.shake ? (Math.random() - 0.5) * o.shake : 0;
  const sy = o.shake ? (Math.random() - 0.5) * o.shake : 0;
  ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * (v.ox + sx), v.dpr * (v.oy + sy));

  // 세상 바깥(화면 비율이 다를 때 남는 곳)은 깔끔하게 비워 둬요
  ctx.save();
  if (o.clip !== false) {
    ctx.beginPath();
    const top = o.skyAbove ?? 0;
    ctx.rect(0, -top, sim.W, sim.H + top);
    ctx.clip();
  }
  worldDecor(ctx, sim, o.theme);
  for (const z of sim.zones) if (z.kind !== 'water') drawZone(ctx, z, t);
  o.back?.(ctx, sim, t);
  if (sim.field) drawField(ctx, sim);
  if (sim.trails) drawTrails(ctx, sim);

  const bodies = Composite.allBodies(sim.world);
  drawDrops(ctx, bodies);
  for (const b of bodies) {
    const d = D(b);
    if (!d || d.kind === 'drop' || d.kind === 'goal') continue;
    drawBody(ctx, b, t);
  }
  for (const z of sim.zones) if (z.kind === 'water') drawWater(ctx, z, t);
  drawLinks(ctx, sim);
  o.front?.(ctx, sim, t);
  drawEffects(ctx, sim, t);
  ctx.restore();
  o.overlay?.(ctx, sim, t);
}

// ───────────────────────── 색 다듬기 ─────────────────────────
// 장면마다 쓴 원색을 그대로 쓰지 않고, 채도를 낮추고 밝기를 좁은 폭에 모아
// 어두운 실험대 위에서 차분한 보석·금속 색으로 보이게 해요.
type RGBA = [number, number, number, number];
const parsed = new Map<string, RGBA>();
function parse(c: string): RGBA {
  let v = parsed.get(c);
  if (v) return v;
  v = [128, 128, 128, 1];
  if (c[0] === '#') {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  } else {
    const m = c.match(/[\d.]+/g);
    if (m && m.length >= 3) v = [+m[0], +m[1], +m[2], m[3] !== undefined ? +m[3] : 1];
  }
  parsed.set(c, v);
  return v;
}
function toHsl([r, g, b]: RGBA): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsla(h: number, s: number, l: number, a: number) {
  return `hsla(${(h * 360).toFixed(1)},${(s * 100).toFixed(1)}%,${(Math.max(0, Math.min(1, l)) * 100).toFixed(1)}%,${a})`;
}
type Tone = { h: number; s: number; l: number; a: number };
const toned = new Map<string, Tone>();
/** 원색 → 차분한 색. lo/hi 는 밝기 범위 */
function tone(c: string, lo = 0.3, hi = 0.84): Tone {
  const k = `${c}|${lo}|${hi}`;
  let t = toned.get(k);
  if (t) return t;
  const rgba = parse(c);
  const [h, s, l] = toHsl(rgba);
  t = { h, s: Math.min(s * 0.55, 0.4), l: Math.max(lo, Math.min(hi, l)), a: rgba[3] };
  toned.set(k, t);
  return t;
}
const shade = (t: Tone, dl: number, a = t.a) => hsla(t.h, t.s, t.l + dl, a);
/** 선·궤적용: 어두운 바탕에서 잘 보이게 밝게 */
export function lineColor(c: string, a?: number) {
  const t = tone(c, 0.58, 0.82);
  return shade(t, 0, a ?? t.a);
}

export const GOLD = '#c8a96a';
const IVORY = 'rgba(236,228,212,';

function background(ctx: CanvasRenderingContext2D, v: View, theme: Theme, t: number) {
  const { cw, ch } = v;
  const lin = (a: string, b: string) => {
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  };
  switch (theme) {
    case 'void':
      // 페이지 배경이 그대로 보이게 (첫 화면)
      ctx.clearRect(0, 0, cw, ch);
      return;
    case 'space':
    case 'night':
      lin(theme === 'space' ? '#040508' : '#060912', theme === 'space' ? '#0b0d16' : '#101628');
      for (const s of STARS) {
        const tw = 0.5 + 0.5 * Math.sin(t / 900 + s.z * 30);
        ctx.globalAlpha = 0.12 + 0.45 * tw * s.z;
        ctx.fillStyle = s.z > 0.85 ? '#f3e2bd' : '#e9ecf2';
        const r = 0.5 + s.z * 0.9;
        ctx.beginPath(); ctx.arc(s.x * cw, s.y * ch, r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    case 'table':
      lin('#140e0a', '#0b0806');
      break;
    case 'lab':
      lin('#141417', '#0c0d0f');
      break;
    case 'ice':
      lin('#10161c', '#0a0d11');
      break;
    default:
      lin('#16171b', '#0c0d10');
  }
  // 가장자리를 살짝 어둡게: 조명이 가운데를 비추는 실험대
  const vg = ctx.createRadialGradient(cw / 2, ch * 0.42, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cw, ch);
}

function worldDecor(ctx: CanvasRenderingContext2D, sim: Sim, theme: Theme) {
  const { W, H } = sim;
  if (theme === 'table') {
    // 짙은 녹색 펠트 + 금색 상감선
    ctx.fillStyle = '#0e3326';
    roundRect(ctx, 0, 0, W, H, 18);
    ctx.fill();
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 60, W / 2, H / 2, W * 0.65);
    g.addColorStop(0, 'rgba(120,200,160,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, W, H, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,169,106,0.35)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 46, 46, W - 92, H - 92, 8);
    ctx.stroke();
    return;
  }
  if (theme === 'space' || theme === 'night' || theme === 'void') return;
  // 정밀 모눈: 10 cm 가는 선, 1 m 굵은 선
  const cool = theme === 'ice';
  const base = cool ? 'rgba(170,200,230,' : IVORY;
  ctx.lineWidth = 1;
  ctx.strokeStyle = base + '0.028)';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 50) if (x % 100) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 50) if (y % 100) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.strokeStyle = base + '0.055)';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 100) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
}

function drawZone(ctx: CanvasRenderingContext2D, z: Zone, t: number) {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, z.x, z.y, z.w, z.h, 6);
  ctx.clip();
  if (z.kind === 'gravity') {
    const c = tone(z.color ?? 'rgba(160,120,255,0.12)', 0.4, 0.75);
    ctx.fillStyle = shade(c, 0, Math.min(c.a, 0.14));
    ctx.fillRect(z.x, z.y, z.w, z.h);
  } else if (z.kind === 'wind') {
    ctx.fillStyle = 'rgba(140,180,205,0.06)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
    const dir = z.dir!;
    const ang = Math.atan2(dir.y, dir.x);
    const speed = 0.12 * (z.strength ?? 1);
    ctx.strokeStyle = 'rgba(190,215,232,0.26)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    const span = Math.hypot(z.w, z.h);
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    for (let i = 0; i < 22; i++) {
      const lane = ((i * 0.618) % 1) - 0.5;
      const off = (((t * speed + i * 137) % span) - span / 2);
      ctx.beginPath();
      ctx.moveTo(off, lane * span);
      ctx.lineTo(off + 54, lane * span);
      ctx.stroke();
    }
  } else if (z.kind === 'magnetic') {
    const s = z.strength ?? 1;
    ctx.fillStyle = s > 0 ? 'rgba(150,135,200,0.07)' : 'rgba(200,169,106,0.07)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = s > 0 ? 'rgba(185,172,225,0.5)' : 'rgba(214,186,128,0.55)';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.25;
    for (let x = z.x + 30; x < z.x + z.w; x += 60) {
      for (let y = z.y + 30; y < z.y + z.h; y += 60) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
        if (s > 0) {
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x - 3.5, y - 3.5); ctx.lineTo(x + 3.5, y + 3.5);
          ctx.moveTo(x + 3.5, y - 3.5); ctx.lineTo(x - 3.5, y + 3.5);
          ctx.stroke();
        }
      }
    }
  } else if (z.kind === 'drag') {
    const c = tone(z.color ?? 'rgba(120,200,120,0.25)', 0.35, 0.7);
    ctx.fillStyle = shade(c, 0, Math.min(c.a * 0.45, 0.2));
    ctx.fillRect(z.x, z.y, z.w, z.h);
  }
  ctx.restore();
  if (z.kind !== 'wind' && z.kind !== 'water') {
    ctx.strokeStyle = IVORY + '0.07)';
    ctx.lineWidth = 1;
    roundRect(ctx, z.x + 0.5, z.y + 0.5, z.w - 1, z.h - 1, 6);
    ctx.stroke();
  }
  if (z.label) {
    ctx.font = '500 21px Pretendard, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = IVORY + '0.62)';
    ctx.fillText(z.label, z.x + z.w / 2, Math.max(z.y, 0) + 40);
  }
  if (z.kind === 'wind') {
    // 바람 방향 화살표
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(z.dir!.y, z.dir!.x));
    ctx.strokeStyle = 'rgba(200,222,238,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-26, 0); ctx.lineTo(26, 0);
    ctx.moveTo(14, -12); ctx.lineTo(26, 0); ctx.lineTo(14, 12);
    ctx.stroke();
    ctx.restore();
  }
}

function drawWater(ctx: CanvasRenderingContext2D, z: Zone, t: number) {
  ctx.save();
  const wave = (x: number) => Math.sin(x / 46 + t / 520) * 2.4 + Math.sin(x / 19 - t / 340) * 1.1;
  ctx.beginPath();
  ctx.moveTo(z.x, z.y + z.h);
  for (let x = z.x; x <= z.x + z.w; x += 8) ctx.lineTo(x, z.y + wave(x));
  ctx.lineTo(z.x + z.w, z.y + wave(z.x + z.w));
  ctx.lineTo(z.x + z.w, z.y + z.h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, z.y, 0, z.y + z.h);
  g.addColorStop(0, 'rgba(70,130,160,0.30)');
  g.addColorStop(1, 'rgba(20,55,85,0.62)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  for (let x = z.x; x <= z.x + z.w; x += 8) {
    if (x === z.x) ctx.moveTo(x, z.y + wave(x));
    else ctx.lineTo(x, z.y + wave(x));
  }
  ctx.strokeStyle = 'rgba(210,232,242,0.65)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawField(ctx: CanvasRenderingContext2D, sim: Sim) {
  const sources = sim.fieldSources();
  if (!sources.length) return;
  const step = 52;
  ctx.lineCap = 'round';
  for (let x = step / 2; x < sim.W; x += step) {
    for (let y = step / 2; y < sim.H; y += step) {
      const f = sim.fieldAt(x, y, sources);
      const m = Math.hypot(f.x, f.y);
      if (m < 1e-7) continue;
      const k = Math.min(1, Math.log10(1 + m * 2e5) / 2.2);
      if (k < 0.08) continue;
      const len = 8 + 16 * k;
      const ux = f.x / m, uy = f.y / m;
      const x2 = x + ux * len, y2 = y + uy * len;
      ctx.strokeStyle = `rgba(214,186,128,${0.15 + 0.6 * k})`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - ux * len * 0.5, y - uy * len * 0.5);
      ctx.lineTo(x2 - ux * len * 0.5, y2 - uy * len * 0.5);
      ctx.stroke();
      const hx = x2 - ux * len * 0.5, hy = y2 - uy * len * 0.5;
      ctx.beginPath();
      ctx.moveTo(hx + ux * 4, hy + uy * 4);
      ctx.lineTo(hx - uy * 3.5 - ux * 3, hy + ux * 3.5 - uy * 3);
      ctx.lineTo(hx + uy * 3.5 - ux * 3, hy - ux * 3.5 - uy * 3);
      ctx.fill();
    }
  }
}

function drawTrails(ctx: CanvasRenderingContext2D, sim: Sim) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const b of Composite.allBodies(sim.world)) {
    const d = D(b);
    if (!d?.trail || d.trail.length < 2) continue;
    const tr = d.trail;
    ctx.strokeStyle = lineColor(d.color, 1);
    for (let i = 1; i < tr.length; i++) {
      ctx.globalAlpha = (i / tr.length) * 0.55;
      ctx.lineWidth = 1 + (i / tr.length) * 1.8;
      ctx.beginPath();
      ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
      ctx.lineTo(tr[i].x, tr[i].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawDrops(ctx: CanvasRenderingContext2D, bodies: MBody[]) {
  const drops = bodies.filter((b) => D(b)?.kind === 'drop');
  if (!drops.length) return;
  // 겹쳐 그려서 한 덩어리 물처럼 보이게
  ctx.fillStyle = 'rgba(52,104,134,0.92)';
  ctx.beginPath();
  for (const b of drops) {
    ctx.moveTo(b.position.x + 12, b.position.y);
    ctx.arc(b.position.x, b.position.y, 12, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(110,165,192,0.9)';
  ctx.beginPath();
  for (const b of drops) {
    ctx.moveTo(b.position.x + 7, b.position.y - 3);
    ctx.arc(b.position.x, b.position.y - 3, 7, 0, Math.PI * 2);
  }
  ctx.fill();
}

function pathBody(ctx: CanvasRenderingContext2D, b: MBody) {
  const d = D(b);
  ctx.beginPath();
  if (d.shape === 'circle') {
    ctx.arc(b.position.x, b.position.y, d.radius!, 0, Math.PI * 2);
    return;
  }
  const parts = b.parts.length > 1 ? b.parts.slice(1) : b.parts;
  for (const p of parts) {
    const vs = p.vertices;
    ctx.moveTo(vs[0].x, vs[0].y);
    for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y);
    ctx.closePath();
  }
}

/** 재질에 맞는 채우기: 쇠는 거울처럼, 얼음은 유리처럼, 나머지는 위에서 비추는 빛 */
function bodyFill(ctx: CanvasRenderingContext2D, b: MBody): { fill: string | CanvasGradient; edge: string } {
  const d = D(b);
  const { x, y } = b.position;
  const round = d.shape === 'circle';
  const r = round ? d.radius! : Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2;
  const top = b.bounds.min.y, bot = b.bounds.max.y;
  if (d.mat === 'metal' && d.kind === 'shape' && !b.isStatic) {
    if (round) {
      const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.04, x, y, r * 1.02);
      g.addColorStop(0, '#fbfaf6');
      g.addColorStop(0.16, '#d9dbdc');
      g.addColorStop(0.55, '#7d8389');
      g.addColorStop(0.85, '#34383d');
      g.addColorStop(1, '#5d6268');
      return { fill: g, edge: 'rgba(0,0,0,0.55)' };
    }
    const g = ctx.createLinearGradient(b.bounds.min.x, top, b.bounds.max.x, bot);
    g.addColorStop(0, '#c9ccce'); g.addColorStop(0.45, '#7a8086'); g.addColorStop(0.55, '#a7abaf'); g.addColorStop(1, '#45494e');
    return { fill: g, edge: 'rgba(0,0,0,0.55)' };
  }
  if (d.mat === 'ice' && d.kind === 'shape') {
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(205,230,242,0.42)');
    g.addColorStop(1, 'rgba(120,170,200,0.22)');
    return { fill: g, edge: 'rgba(225,242,250,0.75)' };
  }
  const t = tone(d.color, b.isStatic ? 0.14 : 0.3, b.isStatic ? 0.5 : 0.84);
  if (t.a < 0.02) return { fill: 'rgba(0,0,0,0)', edge: 'rgba(0,0,0,0)' };
  if (round) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
    g.addColorStop(0, shade(t, 0.2));
    g.addColorStop(0.5, shade(t, 0));
    g.addColorStop(1, shade(t, -0.17));
    return { fill: g, edge: shade(t, -0.24, Math.min(1, t.a)) };
  }
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, shade(t, 0.07));
  g.addColorStop(1, shade(t, -0.08));
  return { fill: g, edge: b.isStatic ? IVORY + '0.12)' : shade(t, -0.2, Math.min(1, t.a)) };
}

function drawBody(ctx: CanvasRenderingContext2D, b: MBody, t: number) {
  const d = D(b);
  const { x, y } = b.position;
  ctx.lineJoin = 'round';

  if (d.kind === 'star') {
    const r = d.radius!;
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.4);
    g.addColorStop(0, 'rgba(232,200,130,0.4)');
    g.addColorStop(1, 'rgba(200,160,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.kind === 'charge') {
    const pulse = 1 + 0.06 * Math.sin(t / 300 + b.id);
    const g = ctx.createRadialGradient(x, y, d.radius! * 0.6, x, y, d.radius! * 2.4 * pulse);
    g.addColorStop(0, d.charge! > 0 ? 'rgba(200,95,95,0.32)' : 'rgba(95,135,205,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, d.radius! * 2.4 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  if (d.kind === 'magnet') {
    drawMagnet(ctx, b);
    return;
  }

  const f = bodyFill(ctx, b);
  pathBody(ctx, b);
  ctx.fillStyle = f.fill;
  ctx.fill();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = f.edge;
  ctx.stroke();

  // 도형 위 장식
  ctx.save();
  pathBody(ctx, b);
  ctx.clip();
  if (d.shape === 'circle') {
    const r = d.radius!;
    if (d.kind !== 'star' && !d.emoji && d.deco !== 'feather' && d.mat !== 'metal') {
      // 부드러운 반사광
      const hg = ctx.createRadialGradient(x - r * 0.36, y - r * 0.42, 0, x - r * 0.36, y - r * 0.42, r * 0.45);
      hg.addColorStop(0, 'rgba(255,255,255,0.32)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (d.face || d.mat === 'wood' || d.mat === 'stone' || d.mat === 'metal' || d.mat === 'ice') {
      // 굴러가는(회전하는) 게 보이도록 가는 자오선
      ctx.strokeStyle = d.mat === 'metal' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(b.angle) * r, y + Math.sin(b.angle) * r);
      ctx.lineTo(x - Math.cos(b.angle) * r, y - Math.sin(b.angle) * r);
      ctx.stroke();
    }
  } else {
    ctx.translate(x, y);
    ctx.rotate(b.angle);
    if (d.mat === 'wood' && d.kind === 'shape' && !d.deco) {
      // 나뭇결
      ctx.strokeStyle = 'rgba(30,16,6,0.28)';
      ctx.lineWidth = 1;
      for (let k = -5; k <= 5; k++) {
        ctx.beginPath();
        ctx.moveTo(-200, k * 6);
        ctx.bezierCurveTo(-60, k * 6 + 3, 60, k * 6 - 3, 200, k * 6);
        ctx.stroke();
      }
    } else if (d.mat === 'ice') {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.rotate(-0.6);
      ctx.fillRect(-200, -12, 400, 3);
    }
  }
  ctx.restore();

  if (d.deco === 'apple') {
    const r = d.radius!;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.quadraticCurveTo(2, -r * 1.2, 5, -r * 1.35); ctx.stroke();
    ctx.fillStyle = '#4f6b4c';
    ctx.beginPath(); ctx.ellipse(r * 0.38, -r * 1.12, r * 0.36, r * 0.15, -0.5, 0, 7); ctx.fill();
    ctx.restore();
  }
  if (d.deco === 'feather') {
    const r = d.radius!;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle - 0.6);
    ctx.fillStyle = '#ece4d2'; ctx.strokeStyle = '#a99c80'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.5);
    ctx.quadraticCurveTo(r * 0.85, -r * 0.4, r * 0.15, r * 1.2);
    ctx.quadraticCurveTo(-r * 0.9, r * 0.1, 0, -r * 1.5);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.quadraticCurveTo(0.1 * r, 0, 0.15 * r, r * 1.6); ctx.stroke();
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath(); ctx.moveTo(0.05 * r, k * r * 0.3); ctx.lineTo(r * 0.45, k * r * 0.3 - r * 0.25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.05 * r, k * r * 0.3); ctx.lineTo(-r * 0.45, k * r * 0.3 - r * 0.25); ctx.stroke();
    }
    ctx.restore();
  }
  if (d.deco === 'pin') {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.fillStyle = '#8e2f38';
    ctx.fillRect(-11, -18, 22, 3);
    ctx.fillRect(-11, -11, 22, 3);
    ctx.restore();
  }
  if (d.deco === 'domino' && b.area > 1100) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.fillStyle = 'rgba(236,228,212,0.85)';
    ctx.fillRect(-6, -0.5, 12, 1);
    for (const py of [-22, -12, 12, 22]) { ctx.beginPath(); ctx.arc(0, py, 2.2, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  if (d.number !== undefined) {
    const r = d.radius!;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.fillStyle = '#efe9dc';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, 7); ctx.fill();
    ctx.fillStyle = '#17181b';
    ctx.font = `600 ${r * 0.56}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(d.number), 0, 1);
    ctx.restore();
  }
  if (d.kind === 'charge') {
    ctx.strokeStyle = 'rgba(245,238,225,0.92)';
    ctx.lineWidth = Math.max(1.5, d.radius! * 0.14);
    ctx.lineCap = 'round';
    const k = d.radius! * 0.42;
    ctx.beginPath();
    ctx.moveTo(x - k, y); ctx.lineTo(x + k, y);
    if (d.charge! > 0) { ctx.moveTo(x, y - k); ctx.lineTo(x, y + k); }
    ctx.stroke();
  }
  if (d.emoji) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    const s = (d.radius ?? Math.min(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2) * 1.3;
    ctx.font = `${s}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.emoji, 0, 2);
    ctx.restore();
  }
  if (b.isStatic && d.kind === 'shape' && !d.nopin) {
    // 고정핀: 작은 황동 나사
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.stroke();
  }
  if (d.lift && d.shape === 'circle') {
    // 풍선 매듭과 실
    const r = d.radius!;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.fillStyle = f.edge;
    ctx.beginPath(); ctx.moveTo(0, r - 2); ctx.lineTo(-4, r + 5); ctx.lineTo(4, r + 5); ctx.fill();
    ctx.strokeStyle = IVORY + '0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, r + 5);
    ctx.quadraticCurveTo(8, r + 22, 0, r + 38);
    ctx.stroke();
    ctx.restore();
  }
}


function drawMagnet(ctx: CanvasRenderingContext2D, b: MBody) {
  const d = D(b);
  const w = d.radius! * 2, h = w * 0.32;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  roundRect(ctx, -w / 2, -h / 2, w, h, 3);
  ctx.save();
  ctx.clip();
  const pole = (x0: number, a: string, c: string) => {
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, a); g.addColorStop(1, c);
    ctx.fillStyle = g;
    ctx.fillRect(x0, -h / 2, w / 2, h);
  };
  pole(0, '#a8414b', '#5f1f26');
  pole(-w / 2, '#47669a', '#1f3153');
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.22);
  ctx.fillStyle = 'rgba(200,169,106,0.8)';
  ctx.fillRect(-0.75, -h / 2, 1.5, h);
  ctx.restore();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, -w / 2, -h / 2, w, h, 3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(245,238,225,0.9)';
  ctx.font = `500 ${h * 0.5}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', w * 0.3, 1);
  ctx.fillText('S', -w * 0.3, 1);
  ctx.restore();
}

function drawLinks(ctx: CanvasRenderingContext2D, sim: Sim) {
  for (const c of Composite.allConstraints(sim.world)) {
    const ld = L(c);
    if (!ld) continue;
    const a = Constraint.pointAWorld(c), b = Constraint.pointBWorld(c);
    if (ld.type === 'grab') {
      ctx.strokeStyle = IVORY + '0.45)';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, 7); ctx.stroke();
      continue;
    }
    if (ld.type === 'spring') {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const coils = 16;
      ctx.strokeStyle = '#b8995a';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (let i = 1; i < coils; i++) {
        const f = i / coils, s = i % 2 ? 8 : -8;
        ctx.lineTo(a.x + dx * f + nx * s, a.y + dy * f + ny * s);
      }
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else {
      ctx.strokeStyle = lineColor(ld.color ?? '#a39a8a', 0.75);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const [p, body] of [[a, c.bodyA], [b, c.bodyB]] as const) {
      ctx.fillStyle = body ? '#d8d2c6' : GOLD;
      ctx.beginPath(); ctx.arc(p.x, p.y, body ? 2.5 : 4.5, 0, 7); ctx.fill();
    }
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, sim: Sim, t: number) {
  sim.effects = sim.effects.filter((e) => t - e.born < e.life);
  for (const e of sim.effects) {
    const k = (t - e.born) / e.life;
    const ease = 1 - (1 - k) ** 3;
    if (e.kind === 'ring') {
      ctx.strokeStyle = e.color ? lineColor(e.color) : GOLD;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.lineWidth = 2.5 * (1 - k) + 0.75;
      ctx.beginPath(); ctx.arc(e.x, e.y, 16 + ease * 220, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.kind === 'text') {
      // 기록은 소리치지 않고 조용히 떠올라요
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
      ctx.font = '500 26px "Noto Serif KR", Pretendard, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#e2c88f';
      ctx.fillText(e.text!, e.x, e.y - ease * 40);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    } else if (e.kind === 'confetti') {
      // 금빛 불꽃 몇 점
      const f = (t - e.born) / 16;
      for (const p of e.parts!) {
        ctx.fillStyle = p.r > 5 ? '#e2c88f' : GOLD;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.beginPath();
        ctx.arc(p.x + p.vx * f * 0.8, p.y + p.vy * f * 0.8 + 0.06 * f * f, Math.max(0.8, p.r * 0.32), 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
}

export { inZone };
