import { MATERIALS, type MatId } from './materials';
import { D, G_SCALE, L, Matter, type MBody, type MConstraint, type Sim, type Vec } from './sim';

const { Body, Composite, Constraint } = Matter;

export type ToolId =
  | 'hand' | 'ball' | 'box' | 'tri' | 'plank' | 'domino' | 'drop'
  | 'plus' | 'minus' | 'magnet' | 'star'
  | 'wall' | 'rope' | 'spring'
  | 'water' | 'wind' | 'field' | 'gzone'
  | 'blast' | 'pin' | 'erase' | 'cue';

export interface ToolDef {
  id: ToolId;
  icon: string;
  name: string;
  tip: string;
  usesMat?: boolean;
  usesSize?: boolean;
  variants?: { id: string; label: string }[];
}

export const TOOLS: Record<ToolId, ToolDef> = {
  hand: { id: 'hand', icon: '✋', name: '잡기', tip: '물체를 잡아서 끌거나 던져요' },
  cue: { id: 'cue', icon: '🎱', name: '큐', tip: '아무 데나 누르고 뒤로 당겼다 놓으면 흰 공을 쳐요' },
  ball: { id: 'ball', icon: '⚽', name: '공', tip: '톡 누르면 놓이고, 당겼다 놓으면 날아가요', usesMat: true, usesSize: true },
  box: { id: 'box', icon: '📦', name: '상자', tip: '톡 누르면 놓이고, 당겼다 놓으면 날아가요', usesMat: true, usesSize: true },
  tri: { id: 'tri', icon: '🔺', name: '세모', tip: '뾰족한 세모를 놓아요', usesMat: true, usesSize: true },
  plank: { id: 'plank', icon: '➖', name: '판자', tip: '길쭉한 판자를 놓아요', usesMat: true, usesSize: true },
  domino: { id: 'domino', icon: '🁢', name: '도미노', tip: '바닥 위에 도미노를 세워요', usesSize: true },
  drop: { id: 'drop', icon: '💧', name: '물방울', tip: '누르고 있으면 물이 쏟아져요' },
  plus: { id: 'plus', icon: '➕', name: '+ 전기', tip: '+ 전기 구슬: − 와는 당기고, + 와는 밀어내요', usesSize: false },
  minus: { id: 'minus', icon: '➖', name: '− 전기', tip: '− 전기 구슬: + 와는 당기고, − 와는 밀어내요' },
  magnet: { id: 'magnet', icon: '🧲', name: '자석', tip: 'N극과 S극이 있는 막대자석. 쇠를 끌어당겨요', usesSize: true },
  star: { id: 'star', icon: '☀️', name: '끌개 별', tip: '주변의 모든 것을 끌어당기는 별', usesSize: true },
  wall: { id: 'wall', icon: '✏️', name: '벽 긋기', tip: '끌어서 움직이지 않는 벽을 그려요' },
  rope: { id: 'rope', icon: '🪢', name: '막대 줄', tip: '물체에서 다른 물체(또는 빈 곳)까지 끌어서 이어요' },
  spring: { id: 'spring', icon: '🌀', name: '용수철', tip: '끌어서 통통 튕기는 용수철로 이어요' },
  water: { id: 'water', icon: '🌊', name: '물웅덩이', tip: '끌어서 네모난 물웅덩이를 만들어요' },
  wind: { id: 'wind', icon: '🌬️', name: '바람', tip: '바람이 불 방향으로 끌어요' },
  field: {
    id: 'field', icon: '🧿', name: '자기장', tip: '끌어서 자기장 구역을 만들어요. 움직이는 전기 구슬이 휘어요',
    variants: [{ id: 'out', label: '⊙ 왼쪽으로 휨' }, { id: 'in', label: '⊗ 오른쪽으로 휨' }],
  },
  gzone: {
    id: 'gzone', icon: '🌙', name: '중력 구역', tip: '끌어서 중력이 다른 구역을 만들어요',
    variants: [
      { id: 'moon', label: '🌙 달 (약하게)' }, { id: 'zero', label: '🛰️ 무중력' },
      { id: 'up', label: '🙃 거꾸로' }, { id: 'jupiter', label: '🪐 목성 (세게)' },
    ],
  },
  blast: { id: 'blast', icon: '💥', name: '펑!', tip: '누른 곳에서 바람이 펑 터져요' },
  pin: { id: 'pin', icon: '📌', name: '고정핀', tip: '물체를 그 자리에 고정하거나 풀어요' },
  erase: { id: 'erase', icon: '🧽', name: '지우개', tip: '문질러서 지워요' },
};

export const ALL_TOOLS: ToolId[] = [
  'hand', 'ball', 'box', 'tri', 'plank', 'domino', 'drop',
  'plus', 'minus', 'magnet', 'star',
  'wall', 'rope', 'spring', 'water', 'wind', 'field', 'gzone',
  'blast', 'pin', 'erase',
];

export const SIZES = [
  { id: 0.7, label: '작게' },
  { id: 1, label: '보통' },
  { id: 1.45, label: '크게' },
];

export interface ToolState {
  tool: ToolId;
  mat: MatId;
  size: number;
  variant: Record<string, string>;
}

type Gesture =
  | { mode: 'grab'; c: MConstraint }
  | { mode: 'launch'; start: Vec; cur: Vec }
  | { mode: 'rect'; start: Vec; cur: Vec }
  | { mode: 'line'; start: Vec; cur: Vec }
  | { mode: 'link'; a: { body?: MBody; point: Vec }; cur: Vec }
  | { mode: 'erase'; cur: Vec }
  | { mode: 'pour'; cur: Vec }
  | { mode: 'cue'; start: Vec; cur: Vec };

/** 포인터(마우스·손가락)로 도구를 쓰는 부분 */
export class ToolController {
  g?: Gesture;
  hover?: Vec;
  cueBall?: () => MBody | undefined;
  onAction?: (kind: 'blast' | 'spawn' | 'erase' | 'cue') => void;

  constructor(public sim: Sim, public state: ToolState) {}

  get def() {
    return TOOLS[this.state.tool];
  }

  down(p: Vec) {
    const sim = this.sim;
    const t = this.state.tool;
    const spawnTool = ['ball', 'box', 'tri', 'plank', 'plus', 'minus', 'magnet', 'star', 'domino'].includes(t);
    if (t === 'hand' || spawnTool) {
      const hit = sim.bodyAt(p, 8);
      if (hit && D(hit)) return this.grab(hit, p);
      if (t === 'hand') return;
      this.g = { mode: 'launch', start: p, cur: p };
      return;
    }
    switch (t) {
      case 'cue':
        this.g = { mode: 'cue', start: p, cur: p };
        return;
      case 'drop':
        this.g = { mode: 'pour', cur: p };
        return;
      case 'blast':
        sim.blast(p);
        this.onAction?.('blast');
        return;
      case 'pin': {
        const hit = sim.bodyAt(p, 8, (b) => !!D(b) && D(b).removable && D(b).kind !== 'drop' && D(b).kind !== 'wall');
        if (hit) {
          sim.setStatic(hit, !hit.isStatic);
          sim.text(hit.position.x, hit.position.y - 30, hit.isStatic ? '고정!' : '풀림!', '#e63946');
        }
        return;
      }
      case 'erase':
        this.g = { mode: 'erase', cur: p };
        this.eraseAt(p, true);
        return;
      case 'wall':
        this.g = { mode: 'line', start: p, cur: p };
        return;
      case 'water': case 'wind': case 'field': case 'gzone':
        this.g = { mode: 'rect', start: p, cur: p };
        return;
      case 'rope': case 'spring': {
        const hit = sim.bodyAt(p, 6, (b) => !b.isStatic || D(b)?.kind === 'shape');
        this.g = { mode: 'link', a: { body: hit, point: p }, cur: p };
        return;
      }
    }
  }

  move(p: Vec) {
    this.hover = p;
    const g = this.g;
    if (!g) return;
    if (g.mode === 'grab') g.c.pointA = p;
    else if (g.mode === 'erase') { g.cur = p; this.eraseAt(p, false); }
    else g.cur = p;
  }

  up(p: Vec) {
    const g = this.g;
    this.g = undefined;
    if (!g) return;
    const sim = this.sim;
    switch (g.mode) {
      case 'grab':
        Composite.remove(sim.world, g.c);
        break;
      case 'launch': {
        const v = this.launchVel(g.start, p);
        const b = this.spawn(g.start);
        if (b && (v.x || v.y)) Body.setVelocity(b, v);
        this.onAction?.('spawn');
        break;
      }
      case 'cue': {
        const ball = this.cueBall?.();
        if (!ball) break;
        const dx = g.start.x - p.x, dy = g.start.y - p.y;
        const len = Math.hypot(dx, dy);
        if (len < 8) break;
        const k = Math.min(len, 320) * 0.13;
        Body.setVelocity(ball, { x: (dx / len) * k, y: (dy / len) * k });
        this.onAction?.('cue');
        break;
      }
      case 'line': {
        if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < 20) break;
        sim.line(g.start.x, g.start.y, p.x, p.y, 16, { removable: true, user: true, color: '#8e7cc3', stroke: '#5e4b94' });
        break;
      }
      case 'rect':
        this.makeZone(g.start, p);
        break;
      case 'link': {
        const hit = sim.bodyAt(p, 6, (b) => !b.isStatic || D(b)?.kind === 'shape');
        const b = { body: hit, point: p };
        if (!g.a.body && !b.body) break;
        if (g.a.body && g.a.body === b.body) break;
        if (Math.hypot(p.x - g.a.point.x, p.y - g.a.point.y) < 10) break;
        // 물체의 중심 근처를 누르면 중심에 붙여요
        for (const e of [g.a, b]) {
          if (e.body && Math.hypot(e.point.x - e.body.position.x, e.point.y - e.body.position.y) < 14) {
            e.point = { ...e.body.position };
          }
        }
        sim.link(g.a, b, this.state.tool === 'spring' ? 'spring' : 'rope', { user: true });
        break;
      }
    }
  }

  cancel() {
    if (this.g?.mode === 'grab') Composite.remove(this.sim.world, this.g.c);
    this.g = undefined;
  }

  /** 매 프레임: 물 붓기 */
  tick() {
    if (this.g?.mode === 'pour') {
      for (let i = 0; i < 2; i++) {
        const b = this.sim.drop(this.g.cur.x + (Math.random() - 0.5) * 18, this.g.cur.y + (Math.random() - 0.5) * 18);
        Body.setVelocity(b, { x: (Math.random() - 0.5) * 1.5, y: 2 });
      }
    }
  }

  private grab(b: MBody, p: Vec) {
    const c = Constraint.create({
      pointA: p, bodyB: b, pointB: { x: p.x - b.position.x, y: p.y - b.position.y },
      stiffness: 0.18, damping: 0.08, length: 0,
    });
    (c as unknown as { plugin: { d: object } }).plugin.d = { type: 'grab' };
    Composite.add(this.sim.world, c);
    this.g = { mode: 'grab', c };
  }

  launchVel(start: Vec, end: Vec): Vec {
    const dx = start.x - end.x, dy = start.y - end.y;
    const len = Math.hypot(dx, dy);
    if (len < 14) return { x: 0, y: 0 };
    const k = Math.min(len, 260) * 0.15;
    return { x: (dx / len) * k, y: (dy / len) * k };
  }

  spawn(p: Vec): MBody | undefined {
    const { sim, state } = this;
    const s = state.size;
    const m = state.mat;
    const o = { user: true };
    switch (state.tool) {
      case 'ball': return sim.ball(p.x, p.y, 22 * s, m, { ...o, face: true });
      case 'box': return sim.box(p.x, p.y, 52 * s, 52 * s, m, o);
      case 'tri': return sim.poly(p.x, p.y, 3, 34 * s, m, o);
      case 'plank': return sim.box(p.x, p.y, 170 * s, 18, m, o);
      case 'domino': return sim.box(p.x, p.y, 16 * s, 80 * s, 'wood', { ...o, color: '#2b2d42', stroke: '#111', deco: 'domino', label: 'domino', friction: 0.3, frictionStatic: 0.1, density: 0.002 });
      case 'plus': return sim.charge(p.x, p.y, 1, { ...o, air: 0.006 });
      case 'minus': return sim.charge(p.x, p.y, -1, { ...o, air: 0.006 });
      case 'magnet': return sim.magnet(p.x, p.y, 0, { ...o, size: 100 * s });
      case 'star': return sim.star(p.x, p.y, 30 * s, 60 * s * s, o);
    }
    return undefined;
  }

  private makeZone(a: Vec, b: Vec) {
    const sim = this.sim;
    const t = this.state.tool;
    let x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    let w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (t === 'wind') {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 30) return;
      const pad = 90;
      if (w < pad * 2) { x -= pad - w / 2; w = pad * 2; }
      if (h < pad * 2) { y -= pad - h / 2; h = pad * 2; }
      sim.zone({ kind: 'wind', x, y, w, h, dir: { x: dx / len, y: dy / len }, strength: 2.2, user: true });
      return;
    }
    if (w < 30 || h < 30) return;
    if (t === 'water') sim.zone({ kind: 'water', x, y, w, h, density: 0.001, user: true });
    if (t === 'field') {
      sim.zone({ kind: 'magnetic', x, y, w, h, strength: this.state.variant.field === 'in' ? -1.2 : 1.2, user: true });
    }
    if (t === 'gzone') {
      const v = this.state.variant.gzone ?? 'moon';
      const presets: Record<string, { g: Vec; label: string; color: string }> = {
        moon: { g: { x: 0, y: 0.17 }, label: '🌙 달', color: 'rgba(200,200,230,0.25)' },
        zero: { g: { x: 0, y: 0 }, label: '🛰️ 무중력', color: 'rgba(120,120,255,0.14)' },
        up: { g: { x: 0, y: -0.7 }, label: '🙃 거꾸로', color: 'rgba(255,140,200,0.18)' },
        jupiter: { g: { x: 0, y: 2.5 }, label: '🪐 목성', color: 'rgba(255,170,90,0.2)' },
      };
      const pr = presets[v];
      sim.zone({ kind: 'gravity', x, y, w, h, g: pr.g, label: pr.label, color: pr.color, user: true });
    }
  }

  private eraseAt(p: Vec, zones: boolean) {
    const sim = this.sim;
    const hit = sim.bodyAt(p, 10, (b) => !!D(b)?.removable);
    if (hit) {
      sim.remove(hit);
      sim.fx({ kind: 'ring', x: p.x, y: p.y, life: 250, color: '#adb5bd' });
      return;
    }
    for (const c of Composite.allConstraints(sim.world)) {
      const ld = L(c);
      if (!ld || ld.type === 'grab') continue;
      const a = Constraint.pointAWorld(c), b = Constraint.pointBWorld(c);
      if (segDist(p, a, b) < 10) { Composite.remove(sim.world, c); return; }
    }
    if (!zones) return; // 문지를 때는 구역은 안 지움 (톡 눌러야 지워져요)
    const z = sim.zoneAt(p);
    if (z?.removable) sim.removeZone(z);
  }

  // ───────────────────────── 미리보기 그리기 ─────────────────────────
  overlay(ctx: CanvasRenderingContext2D) {
    const g = this.g;
    ctx.save();
    if (g?.mode === 'launch') {
      const v = this.launchVel(g.start, g.cur);
      ctx.strokeStyle = 'rgba(60,60,90,0.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(g.start.x, g.start.y); ctx.lineTo(g.cur.x, g.cur.y); ctx.stroke();
      ctx.setLineDash([]);
      ghost(ctx, this.state, g.start);
      if (v.x || v.y) this.trajectory(ctx, g.start, v);
    } else if (g?.mode === 'cue') {
      const ball = this.cueBall?.();
      if (ball) {
        const dx = g.start.x - g.cur.x, dy = g.start.y - g.cur.y;
        const len = Math.hypot(dx, dy);
        if (len > 8) {
          const ux = dx / len, uy = dy / len;
          const pw = Math.min(len, 320);
          const bx = ball.position.x, by = ball.position.y;
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.setLineDash([10, 10]);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + ux * 900, by + uy * 900); ctx.stroke();
          ctx.setLineDash([]);
          // 큐대
          ctx.strokeStyle = '#d4a373';
          ctx.lineWidth = 10;
          ctx.lineCap = 'round';
          const off = 30 + pw * 0.5;
          ctx.beginPath();
          ctx.moveTo(bx - ux * off, by - uy * off);
          ctx.lineTo(bx - ux * (off + 420), by - uy * (off + 420));
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = '700 24px Pretendard, system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(`힘 ${Math.round((pw / 320) * 100)}%`, bx, by - 40);
        }
      }
    } else if (g?.mode === 'line') {
      ctx.strokeStyle = 'rgba(142,124,195,0.6)';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.start.x, g.start.y); ctx.lineTo(g.cur.x, g.cur.y); ctx.stroke();
    } else if (g?.mode === 'rect') {
      const t = this.state.tool;
      const color = t === 'water' ? '80,170,255' : t === 'wind' ? '120,200,255' : t === 'field' ? '170,110,255' : '200,150,255';
      if (t === 'wind') {
        ctx.strokeStyle = `rgba(${color},0.9)`;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        arrow(ctx, g.start, g.cur);
      } else {
        ctx.fillStyle = `rgba(${color},0.25)`;
        ctx.strokeStyle = `rgba(${color},0.9)`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.rect(g.start.x, g.start.y, g.cur.x - g.start.x, g.cur.y - g.start.y);
        ctx.fill(); ctx.stroke();
      }
    } else if (g?.mode === 'link') {
      ctx.strokeStyle = this.state.tool === 'spring' ? '#2a9d8f' : '#7b5232';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(g.a.point.x, g.a.point.y); ctx.lineTo(g.cur.x, g.cur.y); ctx.stroke();
    } else if (g?.mode === 'pour' || (!g && this.state.tool === 'drop' && this.hover)) {
      const p = g?.mode === 'pour' ? g.cur : this.hover!;
      ctx.font = '40px system-ui, "Apple Color Emoji"';
      ctx.textAlign = 'center';
      ctx.fillText('🚿', p.x, p.y - 30);
    }
    if ((this.state.tool === 'erase' || this.state.tool === 'blast') && this.hover) {
      ctx.strokeStyle = this.state.tool === 'erase' ? 'rgba(90,90,90,0.5)' : 'rgba(251,133,0,0.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(this.hover.x, this.hover.y, this.state.tool === 'erase' ? 16 : 60, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  private trajectory(ctx: CanvasRenderingContext2D, p0: Vec, v0: Vec) {
    const sim = this.sim;
    const dt2 = (1000 / 60) ** 2 * G_SCALE;
    let x = p0.x, y = p0.y, vx = v0.x, vy = v0.y;
    const air = 1 - MATERIALS[this.state.mat].air * sim.air;
    const lift = this.state.tool !== 'magnet' && this.state.tool !== 'star' && this.state.tool !== 'plus' && this.state.tool !== 'minus'
      ? (MATERIALS[this.state.mat].lift ?? 0) / MATERIALS[this.state.mat].density : 0;
    ctx.fillStyle = 'rgba(60,60,90,0.55)';
    for (let i = 0; i < 90; i++) {
      const g = sim.gravityAt({ x, y });
      vx = vx * air + g.x * dt2 * (1 - lift);
      vy = vy * air + g.y * dt2 * (1 - lift);
      x += vx; y += vy;
      if (i % 3 === 0) {
        ctx.globalAlpha = 1 - i / 90;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function ghost(ctx: CanvasRenderingContext2D, st: ToolState, p: Vec) {
  const s = st.size;
  const m = MATERIALS[st.mat];
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = st.tool === 'plus' ? '#ff5d5d' : st.tool === 'minus' ? '#4d8dff' : st.tool === 'star' ? '#ffc94d' : m.color;
  ctx.beginPath();
  if (st.tool === 'box') ctx.rect(p.x - 26 * s, p.y - 26 * s, 52 * s, 52 * s);
  else if (st.tool === 'plank') ctx.rect(p.x - 85 * s, p.y - 9, 170 * s, 18);
  else if (st.tool === 'magnet') ctx.rect(p.x - 50 * s, p.y - 16 * s, 100 * s, 32 * s);
  else if (st.tool === 'domino') ctx.rect(p.x - 8 * s, p.y - 40 * s, 16 * s, 80 * s);
  else ctx.arc(p.x, p.y, st.tool === 'star' ? 30 * s : st.tool === 'plus' || st.tool === 'minus' ? 18 : 22 * s, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function arrow(ctx: CanvasRenderingContext2D, a: Vec, b: Vec) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(ang - 0.5) * 24, b.y - Math.sin(ang - 0.5) * 24);
  ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(ang + 0.5) * 24, b.y - Math.sin(ang + 0.5) * 24);
  ctx.stroke();
}

function segDist(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
