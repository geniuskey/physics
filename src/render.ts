import { D, L, Matter, inZone, type MBody, type Sim, type Vec, type Zone } from './sim';

const { Composite, Constraint } = Matter;

export type Theme = 'sky' | 'space' | 'table' | 'lab' | 'ice' | 'night';

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
}

// 별·구름 위치는 고정 (매 프레임 같은 자리)
function seeded(n: number, seed: number) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ x: r(), y: r(), z: r() }));
}
const STARS = seeded(160, 7);
const CLOUDS = seeded(6, 42);

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
    ctx.rect(0, 0, sim.W, sim.H);
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

function background(ctx: CanvasRenderingContext2D, v: View, theme: Theme, t: number) {
  const { cw, ch } = v;
  let g: CanvasGradient;
  switch (theme) {
    case 'space':
    case 'night':
      g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, theme === 'space' ? '#070b1f' : '#14183a');
      g.addColorStop(1, theme === 'space' ? '#1a1f4a' : '#2d2f6b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      for (const s of STARS) {
        const tw = 0.5 + 0.5 * Math.sin(t / 700 + s.z * 30);
        ctx.globalAlpha = 0.25 + 0.6 * tw * s.z;
        ctx.fillStyle = '#fff';
        ctx.fillRect(s.x * cw, s.y * ch, 1 + s.z * 1.6, 1 + s.z * 1.6);
      }
      ctx.globalAlpha = 1;
      break;
    case 'table':
      ctx.fillStyle = '#5b3a21';
      ctx.fillRect(0, 0, cw, ch);
      break;
    case 'lab':
      ctx.fillStyle = '#fbf6ec';
      ctx.fillRect(0, 0, cw, ch);
      break;
    case 'ice':
      g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, '#e3f4ff');
      g.addColorStop(1, '#f7fcff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      break;
    default:
      g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, '#9fd8ff');
      g.addColorStop(0.75, '#e4f5ff');
      g.addColorStop(1, '#fff7e6');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
  }
}

function worldDecor(ctx: CanvasRenderingContext2D, sim: Sim, theme: Theme) {
  const { W, H } = sim;
  if (theme === 'sky') {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const t = performance.now() / 1000;
    for (const c of CLOUDS) {
      const x = ((c.x * W + t * (6 + c.z * 10)) % (W + 300)) - 150;
      const y = 60 + c.y * H * 0.35;
      const s = 0.6 + c.z;
      for (const [dx, dy, rx, ry] of [[0, 0, 70, 26], [40, -16, 46, 26], [-36, -8, 36, 20]]) {
        ctx.beginPath();
        ctx.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (theme === 'lab' || theme === 'ice') {
    ctx.strokeStyle = theme === 'lab' ? 'rgba(180,150,110,0.16)' : 'rgba(120,170,220,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  } else if (theme === 'table') {
    ctx.fillStyle = '#2e8b57';
    roundRect(ctx, 0, 0, W, H, 30);
    ctx.fill();
    const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, W, H, 30);
    ctx.fill();
  }
}

function drawZone(ctx: CanvasRenderingContext2D, z: Zone, t: number) {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, z.x, z.y, z.w, z.h, 14);
  ctx.clip();
  if (z.kind === 'gravity') {
    ctx.fillStyle = z.color ?? 'rgba(160,120,255,0.12)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
  } else if (z.kind === 'wind') {
    ctx.fillStyle = 'rgba(160,220,255,0.18)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
    const dir = z.dir!;
    const ang = Math.atan2(dir.y, dir.x);
    const speed = 0.12 * (z.strength ?? 1);
    ctx.strokeStyle = 'rgba(80,150,220,0.45)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    const span = Math.hypot(z.w, z.h);
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    for (let i = 0; i < 16; i++) {
      const lane = ((i * 0.618) % 1) - 0.5;
      const off = (((t * speed + i * 137) % span) - span / 2);
      ctx.beginPath();
      ctx.moveTo(off, lane * span);
      ctx.lineTo(off + 40, lane * span);
      ctx.stroke();
    }
  } else if (z.kind === 'magnetic') {
    const s = z.strength ?? 1;
    ctx.fillStyle = s > 0 ? 'rgba(190,120,255,0.13)' : 'rgba(255,170,60,0.13)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = s > 0 ? 'rgba(140,70,220,0.5)' : 'rgba(220,120,20,0.55)';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 2;
    for (let x = z.x + 30; x < z.x + z.w; x += 60) {
      for (let y = z.y + 30; y < z.y + z.h; y += 60) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.stroke();
        if (s > 0) {
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
          ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
          ctx.stroke();
        }
      }
    }
  } else if (z.kind === 'drag') {
    ctx.fillStyle = z.color ?? 'rgba(120,200,120,0.25)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
  }
  ctx.restore();
  if (z.label) {
    ctx.font = '700 24px Pretendard, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = z.kind === 'drag' ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,110,0.6)';
    ctx.fillText(z.label, z.x + z.w / 2, Math.max(z.y, 0) + 40);
  }
  if (z.kind === 'wind') {
    // 바람 방향 화살표
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(z.dir!.y, z.dir!.x));
    ctx.fillStyle = 'rgba(60,130,210,0.35)';
    ctx.beginPath();
    ctx.moveTo(30, 0); ctx.lineTo(-14, -20); ctx.lineTo(-6, 0); ctx.lineTo(-14, 20);
    ctx.fill();
    ctx.restore();
  }
}

function drawWater(ctx: CanvasRenderingContext2D, z: Zone, t: number) {
  ctx.save();
  const wave = (x: number) => Math.sin(x / 40 + t / 400) * 3 + Math.sin(x / 17 - t / 260) * 1.5;
  ctx.beginPath();
  ctx.moveTo(z.x, z.y + z.h);
  for (let x = z.x; x <= z.x + z.w; x += 10) ctx.lineTo(x, z.y + wave(x));
  ctx.lineTo(z.x + z.w, z.y + wave(z.x + z.w));
  ctx.lineTo(z.x + z.w, z.y + z.h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, z.y, 0, z.y + z.h);
  g.addColorStop(0, 'rgba(80,180,255,0.38)');
  g.addColorStop(1, 'rgba(30,110,220,0.55)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  for (let x = z.x; x <= z.x + z.w; x += 10) {
    if (x === z.x) ctx.moveTo(x, z.y + wave(x));
    else ctx.lineTo(x, z.y + wave(x));
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
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
      ctx.strokeStyle = `rgba(255,170,40,${0.2 + 0.6 * k})`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - ux * len * 0.5, y - uy * len * 0.5);
      ctx.lineTo(x2 - ux * len * 0.5, y2 - uy * len * 0.5);
      ctx.stroke();
      const hx = x2 - ux * len * 0.5, hy = y2 - uy * len * 0.5;
      ctx.beginPath();
      ctx.moveTo(hx + ux * 4, hy + uy * 4);
      ctx.lineTo(hx - uy * 4 - ux * 3, hy + ux * 4 - uy * 3);
      ctx.lineTo(hx + uy * 4 - ux * 3, hy - ux * 4 - uy * 3);
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
    for (let i = 1; i < tr.length; i++) {
      ctx.strokeStyle = d.color;
      ctx.globalAlpha = (i / tr.length) * 0.6;
      ctx.lineWidth = 2 + (i / tr.length) * 3;
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
  ctx.fillStyle = '#3d8bfd';
  ctx.beginPath();
  for (const b of drops) {
    ctx.moveTo(b.position.x + 12, b.position.y);
    ctx.arc(b.position.x, b.position.y, 12, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = '#5aa5ff';
  ctx.beginPath();
  for (const b of drops) {
    ctx.moveTo(b.position.x + 8, b.position.y - 2);
    ctx.arc(b.position.x, b.position.y - 2, 8, 0, Math.PI * 2);
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

function drawBody(ctx: CanvasRenderingContext2D, b: MBody, t: number) {
  const d = D(b);
  const { x, y } = b.position;
  ctx.lineJoin = 'round';

  if (d.kind === 'star') {
    const r = d.radius!;
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.2);
    g.addColorStop(0, 'rgba(255,220,120,0.55)');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.kind === 'charge') {
    const pulse = 1 + 0.08 * Math.sin(t / 250 + b.id);
    const g = ctx.createRadialGradient(x, y, d.radius! * 0.6, x, y, d.radius! * 2.4 * pulse);
    g.addColorStop(0, d.charge! > 0 ? 'rgba(255,90,90,0.45)' : 'rgba(80,140,255,0.45)');
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

  pathBody(ctx, b);
  ctx.fillStyle = d.color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = d.stroke;
  ctx.stroke();

  // 도형 위 장식
  ctx.save();
  pathBody(ctx, b);
  ctx.clip();
  if (d.shape === 'circle') {
    const r = d.radius!;
    if (d.kind !== 'star' && !d.emoji && d.deco !== 'feather') {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.35, r * 0.22, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (d.mat === 'wood' || d.mat === 'stone' || d.mat === 'metal' || d.mat === 'ice') {
      // 굴러가는 게 보이도록 줄무늬
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(b.angle) * r, y + Math.sin(b.angle) * r);
      ctx.lineTo(x - Math.cos(b.angle) * r, y - Math.sin(b.angle) * r);
      ctx.stroke();
    }
  } else {
    // 사각형류: 안쪽 하이라이트
    ctx.translate(x, y);
    ctx.rotate(b.angle);
    if (d.mat === 'wood' && d.kind === 'shape' && !d.deco) {
      ctx.strokeStyle = 'rgba(120,70,20,0.22)';
      ctx.lineWidth = 2;
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(-200, k * 9);
        ctx.bezierCurveTo(-60, k * 9 + 4, 60, k * 9 - 4, 200, k * 9);
        ctx.stroke();
      }
    } else if (d.mat === 'metal' || d.mat === 'ice') {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.rotate(-0.6);
      ctx.fillRect(-200, -14, 400, 7);
    }
  }
  ctx.restore();

  if (d.deco === 'sun') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - d.radius! * 0.3, y - d.radius! * 0.3, d.radius! * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.deco === 'apple') {
    const r = d.radius!;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.strokeStyle = '#6b3e1f'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.quadraticCurveTo(2, -r * 1.2, 5, -r * 1.35); ctx.stroke();
    ctx.fillStyle = '#52b788';
    ctx.beginPath(); ctx.ellipse(r * 0.38, -r * 1.12, r * 0.38, r * 0.17, -0.5, 0, 7); ctx.fill();
    ctx.restore();
  }
  if (d.deco === 'feather') {
    const r = d.radius!;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle - 0.6);
    ctx.fillStyle = '#fff3d6'; ctx.strokeStyle = '#c9a66b'; ctx.lineWidth = 2;
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
    ctx.fillStyle = '#e63946';
    ctx.fillRect(-11, -18, 22, 5);
    ctx.fillRect(-11, -10, 22, 5);
    ctx.restore();
  }
  if (d.deco === 'domino' && b.area > 1100) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(-6, -1, 12, 2);
    for (const py of [-22, -12, 12, 22]) { ctx.beginPath(); ctx.arc(0, py, 2.6, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  if (d.number !== undefined) {
    const r = d.radius!;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, 7); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = `700 ${r * 0.62}px Pretendard, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(d.number), 0, 1);
    ctx.restore();
  }
  if (d.kind === 'charge') {
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${d.radius! * 1.4}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.charge! > 0 ? '+' : '−', x, y + 1);
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
  if (d.face) drawFace(ctx, b, t);
  if (b.isStatic && d.kind === 'shape' && !d.nopin) {
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }
  if (d.lift && d.shape === 'circle') {
    // 풍선 꼭지
    const r = d.radius!;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b.angle);
    ctx.fillStyle = d.stroke;
    ctx.beginPath(); ctx.moveTo(0, r - 2); ctx.lineTo(-5, r + 7); ctx.lineTo(5, r + 7); ctx.fill();
    ctx.strokeStyle = 'rgba(80,80,80,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, r + 7);
    ctx.quadraticCurveTo(8, r + 22, 0, r + 36);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, b: MBody, t: number) {
  const d = D(b);
  const r = d.radius ?? 20;
  const v = b.velocity;
  const sp = Math.hypot(v.x, v.y);
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  const blink = ((t + b.id * 977) % 3800) < 140;
  const ex = r * 0.34, ey = -r * 0.12, er = r * 0.2;
  // 눈동자는 움직이는 쪽을 봐요
  const look = Matter.Vector.rotate({ x: sp > 0.3 ? v.x / sp : 0, y: sp > 0.3 ? v.y / sp : 0.3 }, -b.angle);
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (blink) ctx.ellipse(sx * ex, ey, er, er * 0.18, 0, 0, 7);
    else ctx.arc(sx * ex, ey, er, 0, 7);
    ctx.fill();
    if (!blink) {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(sx * ex + look.x * er * 0.45, ey + look.y * er * 0.45, er * 0.52, 0, 7);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#3a1f1f';
  ctx.fillStyle = '#3a1f1f';
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.lineCap = 'round';
  if (sp > 9) {
    ctx.beginPath();
    ctx.ellipse(0, r * 0.38, r * 0.14, r * 0.18, 0, 0, 7);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, r * 0.2, r * 0.26, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMagnet(ctx: CanvasRenderingContext2D, b: MBody) {
  const d = D(b);
  const w = d.radius! * 2, h = w * 0.32;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#e84a5f';
  ctx.fillRect(0, -h / 2, w / 2, h);
  ctx.fillStyle = '#3d7bea';
  ctx.fillRect(-w / 2, -h / 2, w / 2, h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.3);
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2a2a3a';
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${h * 0.6}px system-ui, sans-serif`;
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
      ctx.strokeStyle = 'rgba(40,40,60,0.45)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(40,40,60,0.6)';
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, 7); ctx.fill();
      continue;
    }
    if (ld.type === 'spring') {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const coils = 14;
      ctx.strokeStyle = ld.color ?? '#2a9d8f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (let i = 1; i < coils; i++) {
        const f = i / coils, s = i % 2 ? 9 : -9;
        ctx.lineTo(a.x + dx * f + nx * s, a.y + dy * f + ny * s);
      }
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else {
      ctx.strokeStyle = ld.color ?? '#7b5232';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const [p, body] of [[a, c.bodyA], [b, c.bodyB]] as const) {
      ctx.fillStyle = body ? '#444' : '#e63946';
      ctx.beginPath(); ctx.arc(p.x, p.y, body ? 4 : 7, 0, 7); ctx.fill();
    }
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, sim: Sim, t: number) {
  sim.effects = sim.effects.filter((e) => t - e.born < e.life);
  for (const e of sim.effects) {
    const k = (t - e.born) / e.life;
    if (e.kind === 'ring') {
      ctx.strokeStyle = e.color ?? '#fb8500';
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, 20 + k * 240, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.kind === 'pop' || e.kind === 'text') {
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = e.color ?? '#fb5607';
      ctx.font = `800 ${e.kind === 'pop' ? 40 + k * 30 : 30}px Pretendard, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      const yy = e.y - (e.kind === 'text' ? k * 60 : 0);
      ctx.strokeText(e.text!, e.x, yy);
      ctx.fillText(e.text!, e.x, yy);
      ctx.globalAlpha = 1;
    } else if (e.kind === 'confetti') {
      const f = (t - e.born) / 16;
      for (const p of e.parts!) {
        ctx.fillStyle = p.c;
        ctx.globalAlpha = 1 - k;
        ctx.fillRect(p.x + p.vx * f, p.y + p.vy * f + 0.12 * f * f, p.r, p.r * 0.6);
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
