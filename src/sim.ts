import Matter from 'matter-js';
import { MATERIALS, type MatId } from './materials';

const { Engine, Bodies, Body, Composite, Constraint, Events, Query, Vector } = Matter;

export type MBody = Matter.Body;
export type MConstraint = Matter.Constraint;
export interface Vec { x: number; y: number }

/** 지구 중력 1g 에 해당하는 가속도 (px/ms²) */
export const G_SCALE = 0.001;
const STEP = 1000 / 60;
const K_ELECTRIC = 30;
const K_LORENTZ = 0.00026;
const K_MAGNET = 180;
const K_IRON = 34;
const K_WIND = 2.6e-7;

export type Kind = 'shape' | 'drop' | 'charge' | 'magnet' | 'star' | 'wall' | 'goal';

export interface BodyData {
  kind: Kind;
  shape: 'circle' | 'poly';
  radius?: number;
  mat?: MatId;
  color: string;
  stroke: string;
  face?: boolean;
  emoji?: string;
  label?: string;
  charge?: number;
  magnet?: number;
  /** 별처럼 주변을 끌어당기는 세기 */
  attract?: number;
  lift?: number;
  magnetic?: boolean;
  baseAir: number;
  removable: boolean;
  pitch: number;
  trail?: Vec[];
  scored?: boolean;
  goal?: string;
  /** 그릴 때만 쓰는 장식 */
  deco?: 'pin' | 'domino' | 'sun' | 'feather' | 'apple';
  number?: number;
  nopin?: boolean;
  born: number;
}

export type ZoneKind = 'water' | 'wind' | 'magnetic' | 'gravity' | 'drag';

export interface Zone {
  id: number;
  kind: ZoneKind;
  x: number; y: number; w: number; h: number;
  density?: number;
  dir?: Vec;
  strength?: number;
  g?: Vec;
  drag?: number;
  /** 바닥 마찰처럼 매번 일정하게 속도를 줄임 (위에서 내려다보는 놀이용) */
  decel?: number;
  label?: string;
  color?: string;
  removable: boolean;
}

export interface LinkData { type: 'rope' | 'spring' | 'grab'; color?: string }

export interface Effect {
  kind: 'ring' | 'confetti' | 'pop' | 'text';
  x: number; y: number;
  born: number;
  life: number;
  color?: string;
  text?: string;
  parts?: { x: number; y: number; vx: number; vy: number; c: string; r: number }[];
}

export interface Shape {
  static?: boolean;
  face?: boolean;
  color?: string;
  stroke?: string;
  angle?: number;
  removable?: boolean;
  emoji?: string;
  label?: string;
  deco?: BodyData['deco'];
  number?: number;
  nopin?: boolean;
  air?: number;
  restitution?: number;
  friction?: number;
  frictionStatic?: number;
  density?: number;
  inertia?: number;
  /** 사용자가 직접 만든 것 → 되돌리기 가능 */
  user?: boolean;
}

export function D(b: MBody): BodyData {
  return (b.plugin as { d: BodyData }).d;
}
export function L(c: MConstraint): LinkData | undefined {
  return (c as unknown as { plugin: { d?: LinkData } }).plugin.d;
}

let zoneSeq = 1;

export class Sim {
  engine: Matter.Engine;
  world: Matter.World;
  W: number;
  H: number;
  zones: Zone[] = [];
  gravity: Vec = { x: 0, y: 1 };
  air = 1;
  speed = 1;
  paused = false;
  trails = false;
  field = false;
  effects: Effect[] = [];
  history: (() => void)[] = [];
  drops: MBody[] = [];
  onImpact?: (pitch: number, strength: number) => void;
  onGoal?: (b: MBody, goal: string) => void;
  onTick?: () => void;
  steps = 0;
  private acc = 0;

  constructor(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.engine = Engine.create({ positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
    this.engine.gravity.scale = 0; // 중력은 직접 계산 (구역마다 다르게 하려고)
    this.world = this.engine.world;
    Events.on(this.engine, 'collisionStart', (ev) => this.collisions(ev.pairs));
  }

  // ───────────────────────────── 시간 ─────────────────────────────
  frame(dtMs: number) {
    if (this.paused) { this.acc = 0; return; }
    this.acc += Math.min(dtMs, 100);
    let n = 0;
    while (this.acc >= STEP && n < 3) {
      this.acc -= STEP;
      n++;
      const sub = this.speed >= 1 ? Math.round(this.speed) : 1;
      this.engine.timing.timeScale = this.speed < 1 ? this.speed : 1;
      for (let i = 0; i < sub; i++) this.step();
    }
    if (n === 3) this.acc = 0;
  }

  step() {
    this.applyForces();
    Engine.update(this.engine, STEP);
    this.steps++;
    this.post();
    this.onTick?.();
  }

  // ───────────────────────────── 힘 ─────────────────────────────
  gravityAt(p: Vec): Vec {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.kind === 'gravity' && inZone(z, p)) return z.g!;
    }
    return this.gravity;
  }

  private applyForces() {
    const bodies = Composite.allBodies(this.world);
    const charges: MBody[] = [];
    const magnets: MBody[] = [];
    const stars: MBody[] = [];
    const irons: MBody[] = [];
    for (const b of bodies) {
      const d = D(b);
      if (!d) continue;
      if (d.charge) charges.push(b);
      if (d.magnet) magnets.push(b);
      if (d.attract) stars.push(b);
      if (d.magnetic && !d.magnet && !b.isStatic) irons.push(b);
    }

    for (const b of bodies) {
      if (b.isStatic || b.isSensor) continue;
      const d = D(b);
      const g = this.gravityAt(b.position);
      const gx = g.x * G_SCALE, gy = g.y * G_SCALE;
      b.force.x += b.mass * gx;
      b.force.y += b.mass * gy;
      if (d?.lift) {
        b.force.x -= b.area * d.lift * gx;
        b.force.y -= b.area * d.lift * gy;
      }
      for (const z of this.zones) {
        if (z.kind === 'water') {
          const sub = submergedArea(b, z);
          if (sub > 0) {
            const rho = z.density ?? 0.001;
            b.force.x -= rho * sub * gx;
            b.force.y -= rho * sub * gy;
            const frac = Math.min(1, sub / b.area);
            damp(b, (d?.kind === 'drop' ? 0.01 : 0.04) * frac * (z.drag ?? 1));
          }
        } else if (z.kind === 'wind') {
          if (inZone(z, b.position)) {
            const f = (z.strength ?? 1) * K_WIND * b.area;
            b.force.x += z.dir!.x * f;
            b.force.y += z.dir!.y * f;
          }
        } else if (z.kind === 'magnetic') {
          if (d?.charge && inZone(z, b.position)) {
            const v = Body.getVelocity(b);
            const k = d.charge * (z.strength ?? 1) * K_LORENTZ;
            b.force.x += k * v.y;
            b.force.y -= k * v.x;
          }
        } else if (z.kind === 'drag') {
          if (inZone(z, b.position)) {
            if (z.drag) damp(b, z.drag);
            if (z.decel) {
              const v = Body.getVelocity(b);
              const sp = Math.hypot(v.x, v.y);
              const k = sp > 0 ? Math.max(0, sp - z.decel) / sp : 0;
              Body.setVelocity(b, { x: v.x * k, y: v.y * k });
              Body.setAngularVelocity(b, Body.getAngularVelocity(b) * 0.96);
            }
          }
        }
      }
    }

    // 전기: 같은 전기는 밀고, 다른 전기는 당긴다
    for (let i = 0; i < charges.length; i++) {
      for (let j = i + 1; j < charges.length; j++) {
        const a = charges[i], b = charges[j];
        const rx = b.position.x - a.position.x, ry = b.position.y - a.position.y;
        const r2 = rx * rx + ry * ry;
        const r = Math.sqrt(r2) || 1;
        const f = (K_ELECTRIC * D(a).charge! * D(b).charge!) / (r2 + 600);
        const fx = (f * rx) / r, fy = (f * ry) / r;
        if (!a.isStatic) { a.force.x -= fx; a.force.y -= fy; }
        if (!b.isStatic) { b.force.x += fx; b.force.y += fy; }
      }
    }

    // 자석: N극/S극을 점으로 생각
    const poles = magnets.flatMap((m) => magnetPoles(m).map((p) => ({ m, ...p })));
    for (let i = 0; i < poles.length; i++) {
      for (let j = i + 1; j < poles.length; j++) {
        const a = poles[i], b = poles[j];
        if (a.m === b.m) continue;
        const rx = b.x - a.x, ry = b.y - a.y;
        const r2 = rx * rx + ry * ry;
        if (r2 > 700 * 700) continue;
        const r = Math.sqrt(r2) || 1;
        const f = (K_MAGNET * a.p * b.p) / (r2 + 400);
        const fx = (f * rx) / r, fy = (f * ry) / r;
        if (!a.m.isStatic) Body.applyForce(a.m, a, { x: -fx, y: -fy });
        if (!b.m.isStatic) Body.applyForce(b.m, b, { x: fx, y: fy });
      }
    }
    for (const iron of irons) {
      for (const p of poles) {
        const rx = p.x - iron.position.x, ry = p.y - iron.position.y;
        const r2 = rx * rx + ry * ry;
        if (r2 > 450 * 450) continue;
        const r = Math.sqrt(r2) || 1;
        const fade = 1 - r / 450;
        const f = (K_IRON * Math.abs(p.p) * Math.sqrt(iron.mass) * fade) / (r2 + 900);
        const fx = (f * rx) / r, fy = (f * ry) / r;
        iron.force.x += fx; iron.force.y += fy;
        if (!p.m.isStatic) Body.applyForce(p.m, p, { x: -fx, y: -fy });
      }
    }

    // 별: 주변 모든 것을 끌어당김
    for (const s of stars) {
      const k = D(s).attract!;
      const rs = D(s).radius ?? 30;
      for (const b of bodies) {
        if (b === s || b.isStatic || b.isSensor) continue;
        const rx = s.position.x - b.position.x, ry = s.position.y - b.position.y;
        const r2 = rx * rx + ry * ry;
        const r = Math.sqrt(r2) || 1;
        const a = k / Math.max(r2, rs * rs);
        b.force.x += (b.mass * a * rx) / r;
        b.force.y += (b.mass * a * ry) / r;
      }
    }
  }

  /** 어떤 위치에서 전기/자기 힘이 어느 쪽으로 향하는지 (화살표 그리기용) */
  fieldAt(x: number, y: number): Vec {
    let fx = 0, fy = 0;
    for (const b of Composite.allBodies(this.world)) {
      const d = D(b);
      if (!d) continue;
      if (d.charge) {
        const rx = x - b.position.x, ry = y - b.position.y;
        const r2 = rx * rx + ry * ry + 600;
        const r = Math.sqrt(r2);
        fx += (d.charge * rx) / (r2 * r);
        fy += (d.charge * ry) / (r2 * r);
      }
      if (d.magnet) {
        for (const p of magnetPoles(b)) {
          const rx = x - p.x, ry = y - p.y;
          const r2 = rx * rx + ry * ry + 400;
          const r = Math.sqrt(r2);
          fx += (p.p * rx) / (r2 * r);
          fy += (p.p * ry) / (r2 * r);
        }
      }
    }
    return { x: fx, y: fy };
  }

  hasFieldSources() {
    return Composite.allBodies(this.world).some((b) => D(b)?.charge || D(b)?.magnet);
  }

  private collisions(pairs: Matter.Pair[]) {
    for (const pair of pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent;
      const da = D(a), db = D(b);
      if (pair.isSensor) {
        if (da?.kind === 'goal' && !b.isStatic) this.onGoal?.(b, da.goal!);
        else if (db?.kind === 'goal' && !a.isStatic) this.onGoal?.(a, db.goal!);
        continue;
      }
      if (!this.onImpact) continue;
      const va = a.isStatic ? { x: 0, y: 0 } : Body.getVelocity(a);
      const vb = b.isStatic ? { x: 0, y: 0 } : Body.getVelocity(b);
      const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
      if (rel < 2.5) continue;
      if (da?.kind === 'drop' && db?.kind === 'drop') continue;
      const pitch = Math.max(da?.pitch ?? 300, db?.pitch ?? 300);
      this.onImpact(pitch, Math.min(1, (rel - 2) / 18));
    }
  }

  private post() {
    const bodies = Composite.allBodies(this.world);
    const trail = this.trails && this.steps % 2 === 0;
    for (const b of bodies) {
      if (b.isStatic) continue;
      const p = b.position;
      if (p.y > this.H + 500 || p.y < -3000 || p.x < -800 || p.x > this.W + 800) {
        this.remove(b);
        continue;
      }
      const d = D(b);
      if (!d) continue;
      if (trail && d.kind !== 'drop') {
        (d.trail ??= []).push({ x: p.x, y: p.y });
        if (d.trail.length > 90) d.trail.shift();
      } else if (!this.trails && d.trail) d.trail = undefined;
    }
  }

  // ───────────────────────────── 만들기 ─────────────────────────────
  private tag(b: MBody, d: Partial<BodyData> & Pick<BodyData, 'kind' | 'shape'>, o: Shape) {
    const mat = d.mat ? MATERIALS[d.mat] : undefined;
    const full: BodyData = {
      color: o.color ?? mat?.color ?? '#888',
      stroke: o.stroke ?? mat?.stroke ?? '#555',
      baseAir: o.air ?? mat?.air ?? 0.01,
      removable: o.removable ?? true,
      pitch: mat?.pitch ?? 300,
      lift: mat?.lift,
      magnetic: mat?.magnetic,
      face: o.face,
      emoji: o.emoji,
      label: o.label,
      deco: o.deco,
      number: o.number,
      nopin: o.nopin,
      born: performance.now(),
      ...d,
    };
    (b.plugin as { d: BodyData }).d = full;
    b.frictionAir = full.baseAir * this.air;
    // 처음부터 isStatic 으로 만들면 나중에 풀 때 질량이 무한대가 돼요 → 만든 다음 고정
    if (o.static && !b.isStatic) Body.setStatic(b, true);
    if (o.inertia !== undefined) Body.setInertia(b, o.inertia);
    Composite.add(this.world, b);
    if (o.user) this.history.push(() => this.remove(b));
    return b;
  }

  private matOpts(mat: MatId, o: Shape): Matter.IChamferableBodyDefinition {
    const m = MATERIALS[mat];
    return {
      density: o.density ?? m.density,
      friction: o.friction ?? m.friction,
      frictionStatic: o.frictionStatic ?? m.frictionStatic,
      restitution: o.restitution ?? m.restitution,
      angle: o.angle ?? 0,
    };
  }

  ball(x: number, y: number, r: number, mat: MatId = 'rubber', o: Shape = {}) {
    const b = Bodies.circle(x, y, r, this.matOpts(mat, o));
    return this.tag(b, { kind: 'shape', shape: 'circle', radius: r, mat }, o);
  }

  box(x: number, y: number, w: number, h: number, mat: MatId = 'wood', o: Shape = {}) {
    const b = Bodies.rectangle(x, y, w, h, { ...this.matOpts(mat, o), chamfer: { radius: Math.min(4, w / 5, h / 5) } });
    return this.tag(b, { kind: 'shape', shape: 'poly', mat }, o);
  }

  poly(x: number, y: number, sides: number, r: number, mat: MatId = 'wood', o: Shape = {}) {
    const b = Bodies.polygon(x, y, sides, r, this.matOpts(mat, o));
    return this.tag(b, { kind: 'shape', shape: 'poly', mat, radius: r }, o);
  }

  /** 여러 조각을 붙인 하나의 물체 (배, 물레방아 등) */
  compound(parts: MBody[], mat: MatId = 'wood', o: Shape = {}) {
    const m = MATERIALS[mat];
    for (const p of parts) Body.setDensity(p, o.density ?? m.density);
    const b = Body.create({ parts, friction: m.friction, frictionStatic: m.frictionStatic, restitution: m.restitution });
    if (o.static) Body.setStatic(b, true);
    return this.tag(b, { kind: 'shape', shape: 'poly', mat }, o);
  }

  /** 움직이지 않는 벽·바닥 */
  wall(x: number, y: number, w: number, h: number, o: Shape & { color?: string } = {}) {
    const b = Bodies.rectangle(x, y, w, h, {
      isStatic: true, angle: o.angle ?? 0, friction: o.friction ?? 0.6, frictionStatic: o.frictionStatic ?? 0.9,
      restitution: o.restitution ?? 0.2, chamfer: { radius: Math.min(6, w / 2.5, h / 2.5) },
    });
    return this.tag(b, { kind: 'wall', shape: 'poly' }, {
      color: o.color ?? '#6c5b7b', stroke: o.stroke ?? '#4a3d57', removable: o.removable ?? false, ...o,
    });
  }

  /** 두 점 사이에 벽 긋기 */
  line(x1: number, y1: number, x2: number, y2: number, thick = 16, o: Shape = {}) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    return this.wall((x1 + x2) / 2, (y1 + y2) / 2, len + thick, thick, {
      angle: Math.atan2(y2 - y1, x2 - x1), ...o,
    });
  }

  /** 바깥 테두리: 바닥, 양옆 벽 (+천장) */
  bounds(o: { ceiling?: boolean; floor?: number; color?: string; sides?: boolean } = {}) {
    const t = 200;
    const floor = o.floor ?? this.H - 40;
    const c = { color: o.color ?? '#7a6a8a', stroke: '#584a66' };
    this.wall(this.W / 2, floor + t / 2, this.W + 2 * t, t, { ...c, friction: 0.8 });
    if (o.sides !== false) {
      this.wall(-t / 2, this.H / 2 - 400, t, this.H + 800, c);
      this.wall(this.W + t / 2, this.H / 2 - 400, t, this.H + 800, c);
    }
    if (o.ceiling) this.wall(this.W / 2, -t / 2, this.W + 2 * t, t, c);
  }

  drop(x: number, y: number) {
    const b = Bodies.circle(x, y, 7, {
      density: 0.001, friction: 0.0, frictionStatic: 0, restitution: 0, slop: 0.5,
    });
    this.tag(b, { kind: 'drop', shape: 'circle', radius: 7 }, { color: '#4fa8ff', stroke: '#2a7fd4', air: 0.005 });
    D(b).pitch = 0;
    this.drops.push(b);
    if (this.drops.length > 520) this.remove(this.drops[0]);
    return b;
  }

  charge(x: number, y: number, q: number, o: Shape = {}) {
    const r = o.static ? 22 : 18;
    const b = Bodies.circle(x, y, r, {
      density: o.density ?? 0.0012, friction: 0.1, frictionStatic: 0.1, restitution: 0.6,
    });
    return this.tag(b, { kind: 'charge', shape: 'circle', radius: r, charge: q }, {
      color: q > 0 ? '#ff5d5d' : '#4d8dff', stroke: q > 0 ? '#c23a3a' : '#2c5fc4', air: 0.0, ...o,
    });
  }

  magnet(x: number, y: number, angle = 0, o: Shape & { size?: number } = {}) {
    const w = o.size ?? 100, h = w * 0.32;
    const b = Bodies.rectangle(x, y, w, h, {
      density: 0.003, friction: 0.5, frictionStatic: 0.6, restitution: 0.1, angle,
      chamfer: { radius: 6 },
    });
    return this.tag(b, { kind: 'magnet', shape: 'poly', magnet: 1, radius: w / 2, mat: 'metal' }, {
      color: '#e84a5f', stroke: '#333', ...o,
    });
  }

  star(x: number, y: number, r: number, strength: number, o: Shape = {}) {
    const b = Bodies.circle(x, y, r, { density: 0.02, restitution: 0.3, friction: 0.5 });
    return this.tag(b, { kind: 'star', shape: 'circle', radius: r, attract: strength }, {
      color: '#ffc94d', stroke: '#f29f05', deco: 'sun', air: 0, ...o, static: o.static ?? true,
    });
  }

  goal(x: number, y: number, w: number, h: number, name: string, shape: 'circle' | 'rect' = 'rect') {
    const b = shape === 'circle'
      ? Bodies.circle(x, y, w / 2, { isStatic: true, isSensor: true })
      : Bodies.rectangle(x, y, w, h, { isStatic: true, isSensor: true });
    return this.tag(b, { kind: 'goal', shape: shape === 'circle' ? 'circle' : 'poly', radius: w / 2, goal: name }, {
      color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', removable: false,
    });
  }

  link(
    a: { body?: MBody; point: Vec },
    b: { body?: MBody; point: Vec },
    type: 'rope' | 'spring' = 'rope',
    o: { user?: boolean; stiffness?: number; length?: number; color?: string } = {},
  ) {
    // 몸체에 붙일 땐 몸체 중심에서의 차이, 아니면 세상 좌표 그대로
    const local = (e: { body?: MBody; point: Vec }) => (e.body ? Vector.sub(e.point, e.body.position) : e.point);
    const c = Constraint.create({
      bodyA: a.body, pointA: local(a),
      bodyB: b.body, pointB: local(b),
      stiffness: o.stiffness ?? (type === 'spring' ? 0.012 : 0.9),
      damping: type === 'spring' ? 0.015 : 0.02,
      length: o.length ?? Vector.magnitude(Vector.sub(b.point, a.point)),
    });
    (c as unknown as { plugin: { d: LinkData } }).plugin.d = { type, color: o.color };
    Composite.add(this.world, c);
    if (o.user) this.history.push(() => Composite.remove(this.world, c));
    return c;
  }

  zone(z: Omit<Zone, 'id' | 'removable'> & { removable?: boolean; user?: boolean }) {
    const zone: Zone = { removable: true, ...z, id: zoneSeq++ };
    if (zone.w < 0) { zone.x += zone.w; zone.w = -zone.w; }
    if (zone.h < 0) { zone.y += zone.h; zone.h = -zone.h; }
    this.zones.push(zone);
    if (z.user) this.history.push(() => this.removeZone(zone));
    return zone;
  }

  removeZone(z: Zone) {
    this.zones = this.zones.filter((q) => q !== z);
  }

  remove(b: MBody) {
    Composite.remove(this.world, b);
    for (const c of Composite.allConstraints(this.world)) {
      if (c.bodyA === b || c.bodyB === b) Composite.remove(this.world, c);
    }
    if (D(b)?.kind === 'drop') {
      const i = this.drops.indexOf(b);
      if (i >= 0) this.drops.splice(i, 1);
    }
  }

  undo() {
    this.history.pop()?.();
  }

  setAir(a: number) {
    this.air = a;
    for (const b of Composite.allBodies(this.world)) {
      const d = D(b);
      if (d) b.frictionAir = d.baseAir * a;
    }
  }

  setStatic(b: MBody, s: boolean) {
    Body.setStatic(b, s);
    if (!s) {
      Body.setVelocity(b, { x: 0, y: 0 });
    }
  }

  // ───────────────────────────── 찾기 ─────────────────────────────
  bodies() {
    return Composite.allBodies(this.world);
  }

  bodyAt(p: Vec, tol = 10, filter: (b: MBody) => boolean = (b) => !b.isStatic) {
    const list = this.bodies().filter((b) => filter(b) && !b.isSensor);
    const hit = Query.point(list, p);
    if (hit.length) return hit[hit.length - 1];
    let best: MBody | undefined, bd = Infinity;
    for (const b of list) {
      const ext = Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2;
      const dist = Math.hypot(b.position.x - p.x, b.position.y - p.y) - Math.min(ext, 30);
      if (dist < tol && dist < bd) { bd = dist; best = b; }
    }
    return best;
  }

  zoneAt(p: Vec) {
    for (let i = this.zones.length - 1; i >= 0; i--) if (inZone(this.zones[i], p)) return this.zones[i];
    return undefined;
  }

  // ───────────────────────────── 효과 ─────────────────────────────
  blast(p: Vec, power = 1) {
    const R = 260 * Math.sqrt(power);
    for (const b of this.bodies()) {
      if (b.isStatic) continue;
      const dx = b.position.x - p.x, dy = b.position.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > R) continue;
      const k = (1 - dist / R) * 26 * power * Math.min(2, Math.max(0.35, 1 / Math.sqrt(b.mass)));
      const v = Body.getVelocity(b);
      const n = dist || 1;
      Body.setVelocity(b, { x: v.x + (dx / n) * k, y: v.y + (dy / n) * k - 2 * (1 - dist / R) });
      Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.3);
    }
    this.fx({ kind: 'ring', x: p.x, y: p.y, life: 500, color: '#ffb703' });
    this.fx({ kind: 'pop', x: p.x, y: p.y, life: 400, text: '펑!' });
  }

  fx(e: Omit<Effect, 'born'>) {
    this.effects.push({ ...e, born: performance.now() });
  }

  confetti(x: number, y: number) {
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'];
    const parts = Array.from({ length: 28 }, () => {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6;
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, c: colors[(Math.random() * 5) | 0], r: 3 + Math.random() * 4 };
    });
    this.fx({ kind: 'confetti', x, y, life: 1300, parts });
  }

  text(x: number, y: number, text: string, color = '#333') {
    this.fx({ kind: 'text', x, y, life: 1200, text, color });
  }
}

// ───────────────────────────── 도우미 ─────────────────────────────
export function inZone(z: Zone, p: Vec) {
  return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
}

function damp(b: MBody, k: number) {
  const v = Body.getVelocity(b);
  Body.setVelocity(b, { x: v.x * (1 - k), y: v.y * (1 - k) });
  Body.setAngularVelocity(b, Body.getAngularVelocity(b) * (1 - k));
}

export function magnetPoles(m: MBody) {
  const d = D(m);
  const L = (d.radius ?? 50) * 0.72;
  const c = Math.cos(m.angle), s = Math.sin(m.angle);
  const p = d.magnet ?? 1;
  return [
    { x: m.position.x + c * L, y: m.position.y + s * L, p }, // N
    { x: m.position.x - c * L, y: m.position.y - s * L, p: -p }, // S
  ];
}

/** 물 구역 안에 잠긴 넓이 (다각형을 직사각형으로 잘라서 계산) */
export function submergedArea(b: MBody, z: Zone) {
  if (b.bounds.max.y < z.y || b.bounds.min.y > z.y + z.h || b.bounds.max.x < z.x || b.bounds.min.x > z.x + z.w) return 0;
  const parts = b.parts.length > 1 ? b.parts.slice(1) : b.parts;
  let total = 0;
  for (const part of parts) {
    let poly: Vec[] = part.vertices.map((v) => ({ x: v.x, y: v.y }));
    poly = clip(poly, (p) => p.y - z.y, z.y, 'y');
    poly = clip(poly, (p) => z.y + z.h - p.y, z.y + z.h, 'y');
    poly = clip(poly, (p) => p.x - z.x, z.x, 'x');
    poly = clip(poly, (p) => z.x + z.w - p.x, z.x + z.w, 'x');
    total += polyArea(poly);
  }
  return total;
}

function clip(poly: Vec[], inside: (p: Vec) => number, at: number, axis: 'x' | 'y'): Vec[] {
  if (poly.length < 3) return [];
  const out: Vec[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = inside(a) >= 0, ib = inside(b) >= 0;
    if (ia) out.push(a);
    if (ia !== ib) {
      if (axis === 'y') {
        const t = (at - a.y) / (b.y - a.y);
        out.push({ x: a.x + (b.x - a.x) * t, y: at });
      } else {
        const t = (at - a.x) / (b.x - a.x);
        out.push({ x: at, y: a.y + (b.y - a.y) * t });
      }
    }
  }
  return out;
}

function polyArea(p: Vec[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export { Matter };
