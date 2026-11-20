/**
 * 시뮬레이터가 교과서 식(해석해)과 맞는지 확인해요.
 * 모든 값은 SI 단위로 비교하고, 허용 오차는 60 Hz 수치 적분 오차 정도로 잡았어요.
 */
import { describe, expect, it } from 'vitest';
import { read, Recorder } from '../src/measure';
import { MATERIALS } from '../src/materials';
import { SCENES } from '../src/scenes';
import { Matter, Sim } from '../src/sim';
import { B_DEMO, G_EARTH, K_COULOMB, Q_UNIT, toM, toPx, velFromSI, velToSI } from '../src/units';

const { Body } = Matter;
const FRAME = 1000 / 60;

/** 진공·무중력 등 깨끗한 실험실 */
function lab(o: { gravity?: boolean } = {}) {
  const sim = new Sim(1600, 900);
  sim.setAir(0);
  if (o.gravity === false) sim.gravity = { x: 0, y: 0 };
  return sim;
}

/** 조건이 될 때까지 한 걸음씩 돌리고, 조건을 넘은 순간을 선형 보간한 시간(s)을 돌려줘요 */
function stepUntil(sim: Sim, f: () => number, max = 60 * 60) {
  let prev = f(), tPrev = sim.time;
  for (let i = 0; i < max; i++) {
    sim.step();
    const cur = f();
    if (cur >= 0 && prev < 0) return (tPrev + ((sim.time - tPrev) * -prev) / (cur - prev)) / 1000;
    prev = cur; tPrev = sim.time;
  }
  throw new Error('조건에 닿지 못했어요');
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('단위 변환', () => {
  it('속도 m/s ↔ px/걸음 은 서로 되돌아온다', () => {
    expect(velToSI(velFromSI(3.7))).toBeCloseTo(3.7, 10);
  });

  it('진공에서 떨어지는 물체의 가속도는 9.81 m/s² 이다', () => {
    const sim = lab();
    const b = sim.ball(800, 100, 20, 'stone');
    const rec = new Recorder();
    rec.select(b);
    for (let i = 0; i < 60; i++) { sim.step(); rec.sample(sim); }
    const a = rec.samples.slice(2).map((s) => s.ay);
    for (const ay of a) expect(ay).toBeCloseTo(-G_EARTH, 6);
  });
});

describe('자유 낙하 · 포물선', () => {
  it('5 m 를 떨어지는 데 걸린 시간 = √(2h/g)', () => {
    const sim = lab();
    const b = sim.ball(800, 100, 20, 'stone');
    const h = 5;
    const t = stepUntil(sim, () => b.position.y - (100 + toPx(h)));
    expect(rel(t, Math.sqrt((2 * h) / G_EARTH))).toBeLessThan(0.02);
  });

  it('달에서는 같은 높이를 √(g지구/g달) 배 더 오래 떨어진다', () => {
    const fall = (g: number) => {
      const sim = lab();
      sim.gravity = { x: 0, y: g };
      const b = sim.ball(800, 100, 20, 'stone');
      return stepUntil(sim, () => b.position.y - 500);
    };
    const moon = 1.62 / G_EARTH;
    expect(rel(fall(moon) / fall(1), Math.sqrt(1 / moon))).toBeLessThan(0.02);
  });

  for (const deg of [30, 45, 60]) {
    it(`${deg}° 로 10 m/s 로 던지면 사거리 = v² sin2θ / g`, () => {
      const sim = lab();
      const v = 10, th = (deg * Math.PI) / 180;
      const x0 = 100, y0 = 800;
      const b = sim.ball(x0, y0, 10, 'stone');
      Body.setVelocity(b, { x: velFromSI(v * Math.cos(th)), y: -velFromSI(v * Math.sin(th)) });
      sim.step(); // 올라가기 시작한 다음부터 "다시 내려와 출발 높이를 지나는 때"를 찾아요
      stepUntil(sim, () => b.position.y - y0);
      const range = toM(b.position.x - x0);
      expect(rel(range, (v * v * Math.sin(2 * th)) / G_EARTH)).toBeLessThan(0.02);
    });
  }

  it('최고점 높이 = v²/2g, 에너지(½mv² + mgh)는 보존된다', () => {
    const sim = lab();
    const b = sim.ball(800, 850, 15, 'metal');
    Body.setVelocity(b, { x: 0, y: -velFromSI(8) });
    const r0 = read(sim, b);
    const e0 = r0.ke + r0.pe;
    let top = 0;
    for (let i = 0; i < 80; i++) {
      sim.step();
      const r = read(sim, b);
      top = Math.max(top, r.h - r0.h);
      expect(rel(r.ke + r.pe, e0)).toBeLessThan(0.005);
    }
    expect(rel(top, 64 / (2 * G_EARTH))).toBeLessThan(0.02);
  });
});

describe('공기 저항', () => {
  it('깃털의 종단 속도 = g/γ (속도에 비례하는 저항, γ = 60·frictionAir /s)', () => {
    const sim = new Sim(1600, 900);
    const f = sim.ball(800, -2000, 20, 'feather');
    for (let i = 0; i < 300; i++) sim.step();
    const gamma = 60 * MATERIALS.feather.air;
    expect(rel(-read(sim, f).vy, G_EARTH / gamma)).toBeLessThan(0.01);
  });
});

describe('만유인력 · 궤도', () => {
  /** 별 둘레를 원 궤도로 한 바퀴 돌리고 반지름 변화와 주기를 재요 */
  function orbit(rPx: number, GM = 70) {
    const sim = lab({ gravity: false });
    sim.star(800, 450, 30, GM);
    const p = sim.ball(800 + rPx, 450, 6, 'rubber', { air: 0 });
    const r = toM(rPx);
    const v = Math.sqrt(GM / r); // m/s
    Body.setVelocity(p, { x: 0, y: velFromSI(v) });
    const T = (2 * Math.PI * r) / v;
    let maxDev = 0, angle = 0, prevA = 0;
    const steps = Math.round((T * 1000) / FRAME);
    for (let i = 0; i < steps; i++) {
      sim.step();
      const dx = p.position.x - 800, dy = p.position.y - 450;
      maxDev = Math.max(maxDev, rel(Math.hypot(dx, dy), rPx));
      const a = Math.atan2(dy, dx);
      let d = a - prevA;
      if (d < -Math.PI) d += 2 * Math.PI;
      if (d > Math.PI) d -= 2 * Math.PI;
      angle += d;
      prevA = a;
    }
    return { maxDev, turns: angle / (2 * Math.PI), T };
  }

  it('v = √(GM/r) 로 출발하면 반지름을 지키며 주기 2πr/v 에 한 바퀴 돈다', () => {
    const o = orbit(250);
    expect(o.maxDev).toBeLessThan(0.02);
    expect(Math.abs(o.turns - 1)).toBeLessThan(0.02);
  });

  it('케플러 제3법칙: T²/r³ 는 반지름과 상관없이 4π²/GM', () => {
    for (const r of [150, 300]) {
      const o = orbit(r);
      expect(Math.abs(o.turns - 1)).toBeLessThan(0.02);
      expect(rel((o.T * o.T) / toM(r) ** 3, (4 * Math.PI ** 2) / 70)).toBeLessThan(1e-9);
    }
  });
});

describe('전기 · 자기', () => {
  it('쿨롱 법칙: 처음 가속도 = k q₁q₂ / (m r²)', () => {
    const sim = lab({ gravity: false });
    sim.charge(600, 450, 1, { static: true });
    const b = sim.charge(800, 450, 1, { air: 0 });
    const rec = new Recorder();
    rec.select(b);
    rec.every = 0;
    for (let i = 0; i < 3; i++) { sim.step(); rec.sample(sim); }
    const r = 2; // m
    const expected = (K_COULOMB * Q_UNIT * Q_UNIT) / (b.mass * r * r);
    expect(rel(rec.samples[2].ax, expected)).toBeLessThan(0.02);
  });

  it('쿨롱 힘은 거리의 제곱에 반비례한다', () => {
    const accel = (d: number) => {
      const sim = lab({ gravity: false });
      sim.charge(400, 450, 1, { static: true });
      const b = sim.charge(400 + d, 450, -1, { air: 0 });
      sim.step();
      return Math.abs(read(sim, b).vx);
    };
    expect(rel(accel(150) / accel(300), 4)).toBeLessThan(0.01);
  });

  it('자기장 속 전기 구슬: 반지름 r = mv/(qB), 주기 T = 2πm/(qB)', () => {
    const sim = lab({ gravity: false });
    sim.zone({ kind: 'magnetic', x: -2000, y: -2000, w: 6000, h: 6000, strength: B_DEMO });
    const b = sim.charge(800, 450, 1, { air: 0 });
    const v = 4; // m/s
    Body.setVelocity(b, { x: velFromSI(v), y: 0 });
    const q = Q_UNIT, B = B_DEMO, m = b.mass;
    const R = (m * v) / (q * B);
    const T = (2 * Math.PI * m) / (q * B);
    let minY = Infinity, maxY = -Infinity;
    const steps = Math.round((T * 1000) / FRAME);
    for (let i = 0; i < steps; i++) {
      sim.step();
      minY = Math.min(minY, b.position.y);
      maxY = Math.max(maxY, b.position.y);
    }
    expect(rel(toM(maxY - minY) / 2, R)).toBeLessThan(0.03);
    // 자기력은 일을 하지 않아요: 속력이 그대로
    expect(rel(read(sim, b).speed, v)).toBeLessThan(0.005);
    // 한 주기 뒤에는 출발점으로 돌아와요
    expect(toM(Math.hypot(b.position.x - 800, b.position.y - 450))).toBeLessThan(R * 0.06);
  });
});

describe('충돌', () => {
  it('정면 충돌 전후로 운동량의 합은 보존된다', () => {
    const sim = lab({ gravity: false });
    const a = sim.ball(500, 450, 30, 'metal', { friction: 0, frictionStatic: 0 });
    const b = sim.ball(900, 450, 20, 'rubber', { friction: 0, frictionStatic: 0 });
    Body.setVelocity(a, { x: velFromSI(5), y: 0 });
    Body.setVelocity(b, { x: velFromSI(-2), y: 0 });
    const p = () => read(sim, a).m * read(sim, a).vx + read(sim, b).m * read(sim, b).vx;
    const p0 = p();
    for (let i = 0; i < 120; i++) sim.step();
    expect(read(sim, a).vx).toBeLessThan(5); // 정말 부딪혔는지
    expect(rel(p(), p0)).toBeLessThan(0.01);
  });

  it('같은 질량의 완전 탄성 충돌: 속도를 맞바꾼다', () => {
    const sim = lab({ gravity: false });
    const o = { friction: 0, frictionStatic: 0, restitution: 1 };
    const a = sim.ball(500, 450, 25, 'stone', o);
    const b = sim.ball(800, 450, 25, 'stone', o);
    Body.setVelocity(a, { x: velFromSI(4), y: 0 });
    for (let i = 0; i < 90; i++) sim.step();
    expect(Math.abs(read(sim, a).vx)).toBeLessThan(0.2);
    expect(rel(read(sim, b).vx, 4)).toBeLessThan(0.05);
  });
});

describe('부력', () => {
  it('떠 있는 나무가 잠긴 비율 = 나무 밀도 / 물 밀도', () => {
    const sim = new Sim(1600, 900);
    sim.bounds();
    sim.zone({ kind: 'water', x: 0, y: 400, w: 1600, h: 460, density: 0.001 });
    const s = 80;
    const wood = sim.box(800, 380, s, s, 'wood', { friction: 0 });
    for (let i = 0; i < 900; i++) sim.step();
    const sunk = (wood.bounds.max.y - 400) / s;
    expect(rel(sunk, MATERIALS.wood.density / 0.001)).toBeLessThan(0.05);
  });
});

describe('예측 실험', () => {
  // 실험을 실제로 돌렸을 때 나와야 하는 보기 번호
  const expected: Record<string, number> = { 'drop-race': 2, planets: 1, hoops: 1, swirl: 1 };
  for (const scene of SCENES.filter((s) => s.id in expected)) {
    it(`${scene.id}: 실험 결과가 물리 법칙대로 나온다`, () => {
      const sim = new Sim(scene.W ?? 1600, scene.H ?? 900);
      sim.gravity = { ...(scene.gravity ?? { x: 0, y: 1 }) };
      sim.setAir(scene.air ?? 1);
      const rt = scene.build(sim) ?? {};
      sim.onTick = rt.tick;
      const p = rt.predict!;
      expect(p.options[expected[scene.id]]).toBeDefined();
      p.start();
      let r: ReturnType<typeof p.result>;
      for (let i = 0; i < 60 * 30 && !(r = p.result()); i++) sim.step();
      expect(r, '30초 안에 결과가 나와야 해요').toBeDefined();
      expect(r!.pick, r!.detail).toBe(expected[scene.id]);
    });
  }
});
