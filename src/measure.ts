import { MATERIALS } from './materials';
import { D, Matter, type MBody, type Sim, type Vec } from './sim';
import { G_EARTH, PX_PER_M, toM, velToSI } from './units';

const { Body, Composite } = Matter;

/** 한 물체의 상태를 SI 단위로 (위쪽이 +y) */
export interface Reading {
  /** 시뮬레이션 시간 (s) */
  t: number;
  m: number;
  /** 왼쪽 끝에서 잰 가로 위치 (m) */
  x: number;
  /** 바닥에서 잰 높이 (m) */
  h: number;
  vx: number;
  vy: number;
  speed: number;
  /** 운동량 크기 (kg·m/s) */
  p: number;
  /** 운동에너지 ½mv² (J) */
  ke: number;
  /** 위치에너지: 중력 mgh + 별의 인력 −GMm/r (J) */
  pe: number;
}

/**
 * matter-js 의 속도는 마지막 한 걸음 동안의 평균(= 그 걸음의 가운데 시점 속도)이에요.
 * 위치·시간도 같은 가운데 시점으로 맞춰야 ½mv² + mgh 가 제대로 보존돼 보여요.
 */
export function read(sim: Sim, b: MBody): Reading {
  const moving = !b.isStatic;
  // 타입 정의에는 없지만 matter-js 가 실제로 갖고 있는 값이에요
  const raw = b as MBody & { positionPrev: Vec; deltaTime?: number };
  const v = moving ? Body.getVelocity(b) : { x: 0, y: 0 };
  const pos = moving
    ? { x: (b.position.x + raw.positionPrev.x) / 2, y: (b.position.y + raw.positionPrev.y) / 2 }
    : b.position;
  const vx = velToSI(v.x), vy = -velToSI(v.y);
  const speed = Math.hypot(vx, vy);
  const m = moving ? b.mass : massOf(b);
  return {
    t: (sim.time - (moving && sim.steps ? (raw.deltaTime ?? 0) / 2 : 0)) / 1000,
    m,
    x: toM(pos.x),
    h: toM(sim.ground - pos.y),
    vx, vy, speed,
    p: m * speed,
    ke: 0.5 * m * speed * speed,
    pe: potential(sim, pos, m, b),
  };
}

/** 고정된 물체는 matter-js 질량이 무한대라 밀도 × 넓이로 다시 계산해요 */
function massOf(b: MBody) {
  const d = D(b);
  const dens = d?.mat ? MATERIALS[d.mat].density : b.density;
  return dens * b.area;
}

/**
 * 위치에너지 (J). 중력은 그 물체가 있는 곳의 중력으로 바닥 기준 mgh,
 * 별은 −GMm/r (GM = attract, m³/s²).
 */
export function potential(sim: Sim, p: Vec, m: number, self?: MBody) {
  const g = sim.gravityAt(p);
  // g 는 지구 = 1 인 화면 방향 벡터 → 바닥 기준점에서 g 방향 반대로 얼마나 올라와 있나
  const up = -(g.x * p.x + g.y * (p.y - sim.ground)) / PX_PER_M;
  let pe = m * G_EARTH * up;
  for (const s of Composite.allBodies(sim.world)) {
    const ds = D(s);
    if (!ds?.attract || s === self) continue;
    const r = Math.max(Math.hypot(s.position.x - p.x, s.position.y - p.y), ds.radius ?? 30);
    pe -= (ds.attract * m) / toM(r);
  }
  return pe;
}

/** 측정 패널에 보여줄 이름 */
export function nameOf(b: MBody) {
  const d = D(b);
  if (!d) return '물체';
  if (d.label) return d.label;
  if (d.kind === 'charge') return `${d.charge! > 0 ? '+' : '−'} 전기 구슬`;
  if (d.kind === 'magnet') return '막대자석';
  if (d.kind === 'star') return '별';
  const mat = d.mat ? MATERIALS[d.mat].name : '';
  const shape = d.deco === 'domino' ? '도미노' : d.shape === 'circle' ? '공' : '물체';
  return `${mat} ${shape}`.trim();
}

/** 측정할 수 있는 물체인지 (벽·센서·물방울은 빼요) */
export function measurable(b: MBody) {
  const d = D(b);
  return !!d && !b.isSensor && d.kind !== 'wall' && d.kind !== 'drop' && d.kind !== 'goal';
}

export interface Sample extends Reading { ax: number; ay: number }

/** 고른 물체를 따라가며 시간에 따라 기록해요 */
export class Recorder {
  target?: MBody;
  samples: Sample[] = [];
  /** 기록 간격 (s) */
  every = 1 / 30;
  /** 최대 기록 길이 (s) */
  span = 60;
  private lastT = -Infinity;

  select(b: MBody | undefined) {
    this.target = b;
    this.clear();
  }

  clear() {
    this.samples = [];
    this.lastT = -Infinity;
  }

  /** 매 물리 걸음마다 불러요 */
  sample(sim: Sim) {
    const b = this.target;
    if (!b) return;
    if (!sim.world.bodies.includes(b)) { this.target = undefined; return; }
    const t = sim.time / 1000;
    if (t - this.lastT < this.every - 1e-9) return;
    this.lastT = t;
    const r = read(sim, b);
    const prev = this.samples[this.samples.length - 1];
    const dt = prev ? r.t - prev.t : 0;
    const s: Sample = { ...r, ax: dt > 0 ? (r.vx - prev.vx) / dt : 0, ay: dt > 0 ? (r.vy - prev.vy) / dt : 0 };
    this.samples.push(s);
    while (this.samples.length && t - this.samples[0].t > this.span) this.samples.shift();
  }

  csv() {
    const head = 't (s),x (m),h (m),vx (m/s),vy (m/s),speed (m/s),ax (m/s²),ay (m/s²),p (kg·m/s),KE (J),PE (J),E (J)';
    const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toPrecision(6));
    const rows = this.samples.map((s) =>
      [s.t, s.x, s.h, s.vx, s.vy, s.speed, s.ax, s.ay, s.p, s.ke, s.pe, s.ke + s.pe].map(f).join(','));
    return [head, ...rows].join('\n');
  }
}
